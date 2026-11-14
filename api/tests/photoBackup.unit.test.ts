import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createPhotoSnapshot,verifyPhotoSnapshot,restorePhotoSnapshotToEmptyBucket,removeUnpublishedPhotoSnapshot,photoStorage,validatePhotoKey,storageFingerprint} from '../src/photoBackup.ts';
import {validateBackupObjectKey,validateExpirationPlan} from '../src/backupRetention.ts';
import {FakeObjectStore,ownTemporary} from './helpers/fakePhotoStorage.ts';

test('snapshot cifra fotos e manifesto e restaura bytes somente em namespace isolado',async()=>ownTemporary(async directory=>{
 const source=new FakeObjectStore(),backup=new FakeObjectStore(),key=randomBytes(32),tenantId=randomUUID(),petId=randomUUID(),backupId=randomUUID(),recoveryId=randomUUID();
 const sourceKey=`tenants/${tenantId}/pets/${petId}/${randomUUID()}.webp`,content=randomBytes(2048);source.objects.set(sourceKey,content);
 const snapshot=await createPhotoSnapshot({db:{query:async()=>({rows:[{tenant_id:tenantId,id:petId,photo_key:sourceKey}]})} as any,source:source.storage('photos'),backup:backup.storage('backups'),key,backupId,prefix:'petcore',directory});
 assert.equal(snapshot.photoCount,1);assert.equal(snapshot.plaintextBytes,content.length);
 for(const value of backup.objects.values())assert.ok(!value.equals(content)&&!value.includes(Buffer.from(sourceKey)),'Only encrypted objects are stored');
 const target=join(directory,'restore');await mkdir(target);
 const result=await verifyPhotoSnapshot({snapshot,backup:backup.storage('backups'),key,prefix:'petcore',directory:target,target:source.storage('photos'),recoveryId});
 assert.equal(result.photosVerified,1);assert.equal(result.activeNamespaceModified,false);assert.equal(result.applicationReady,false);
 assert.deepEqual(source.objects.get(`recovery-tests/${recoveryId}/${sourceKey}`),content);assert.deepEqual(source.objects.get(sourceKey),content);
 const collision=join(directory,'collision');await mkdir(collision);
 await assert.rejects(verifyPhotoSnapshot({snapshot,backup:backup.storage('backups'),key,prefix:'petcore',directory:collision,target:source.storage('photos'),recoveryId}),{name:'PreconditionFailed'});
 assert.ok(source.writes.every(value=>value.startsWith('recovery-tests/')));
}));
test('chave incorreta ou objeto alterado impedem qualquer restauração',async()=>ownTemporary(async directory=>{
 const source=new FakeObjectStore(),backup=new FakeObjectStore(),tenantId=randomUUID(),petId=randomUUID(),backupId=randomUUID(),key=randomBytes(32),sourceKey=`tenants/${tenantId}/pets/${petId}/${randomUUID()}.webp`;
 source.objects.set(sourceKey,randomBytes(128));
 const snapshot=await createPhotoSnapshot({db:{query:async()=>({rows:[{tenant_id:tenantId,id:petId,photo_key:sourceKey}]})} as any,source:source.storage('photos'),backup:backup.storage('backups'),key,backupId,prefix:'petcore',directory});
 const wrong=join(directory,'wrong');await mkdir(wrong);
 await assert.rejects(verifyPhotoSnapshot({snapshot,backup:backup.storage('backups'),key:randomBytes(32),prefix:'petcore',directory:wrong,target:source.storage('photos')}),{code:'BACKUP_INTEGRITY_FAILURE'});
 const objectKey=`petcore/photo-snapshots/${backupId}/0.webp.enc`,damaged=Buffer.from(backup.objects.get(objectKey)!);damaged[24]^=1;backup.objects.set(objectKey,damaged);
 const corrupt=join(directory,'corrupt');await mkdir(corrupt);
 await assert.rejects(verifyPhotoSnapshot({snapshot,backup:backup.storage('backups'),key,prefix:'petcore',directory:corrupt,target:source.storage('photos')}),{code:'BACKUP_INTEGRITY_FAILURE'});
 assert.equal(source.writes.length,0);
}));
test('configuração parcial, bucket igual e chave fora do pet não geram cópia enganosa',async()=>ownTemporary(async directory=>{
 assert.equal(photoStorage({}),null);assert.throws(()=>photoStorage({OBJECT_STORAGE_BUCKET:'missing-rest'}),{code:'PHOTO_STORAGE_MISSING'});
 const tenantId=randomUUID(),petId=randomUUID();assert.throws(()=>validatePhotoKey(tenantId,petId,`tenants/${randomUUID()}/pets/${petId}/${randomUUID()}.webp`),{code:'PHOTO_BACKUP_SOURCE_KEY_INVALID'});
 const storage=new FakeObjectStore().storage('same'),options={db:{query:async()=>({rows:[]})} as any,source:storage,backup:storage,key:randomBytes(32),backupId:randomUUID(),prefix:'petcore',directory};
 await assert.rejects(createPhotoSnapshot(options),{code:'PHOTO_BACKUP_STORAGE_MUST_BE_SEPARATE'});
}));
test('falha limpa somente objetos da tentativa atual e preserva snapshot preexistente',async()=>ownTemporary(async directory=>{
 const source=new FakeObjectStore(),backup=new FakeObjectStore(),tenantId=randomUUID(),petId=randomUUID(),backupId=randomUUID(),key=randomBytes(32),first=`tenants/${tenantId}/pets/${petId}/${randomUUID()}.webp`,missing=`tenants/${tenantId}/pets/${petId}/${randomUUID()}.webp`;
 source.objects.set(first,randomBytes(128));
 const options={db:{query:async()=>({rows:[{tenant_id:tenantId,id:petId,photo_key:first},{tenant_id:tenantId,id:petId,photo_key:missing}]})} as any,source:source.storage('photos'),backup:backup.storage('backups'),key,backupId,prefix:'petcore',directory};
 await assert.rejects(createPhotoSnapshot(options),{name:'NoSuchKey'});assert.equal(backup.objects.size,0);
 const oldKey=`petcore/photo-snapshots/${backupId}/0.webp.enc`,oldContent=randomBytes(96);backup.objects.set(oldKey,oldContent);backup.metadata.set(oldKey,{petcore_backup_id:backupId,petcore_snapshot_attempt:randomUUID()});
 const retry=join(directory,'retry');await mkdir(retry);
 await assert.rejects(createPhotoSnapshot({...options,directory:retry}),{name:'PreconditionFailed'});assert.deepEqual(backup.objects.get(oldKey),oldContent);
}));
test('limpeza de cópia não publicada exige manifesto autenticado e nonce da tentativa',async()=>ownTemporary(async directory=>{
 const source=new FakeObjectStore(),backup=new FakeObjectStore(),tenantId=randomUUID(),petId=randomUUID(),key=randomBytes(32),sourceKey=`tenants/${tenantId}/pets/${petId}/${randomUUID()}.webp`;
 source.objects.set(sourceKey,randomBytes(128));
 const snapshot=await createPhotoSnapshot({db:{query:async()=>({rows:[{tenant_id:tenantId,id:petId,photo_key:sourceKey}]})} as any,source:source.storage('photos'),backup:backup.storage('backups'),key,backupId:randomUUID(),prefix:'petcore',directory});
 const wrong=join(directory,'not-owner');await mkdir(wrong);
 await assert.rejects(removeUnpublishedPhotoSnapshot({snapshot:{...snapshot,attemptId:randomUUID()},backup:backup.storage('backups'),key,prefix:'petcore',directory:wrong}),{code:'PHOTO_BACKUP_CLEANUP_OWNERSHIP_REQUIRED'});assert.equal(backup.deletes.length,0);
 const owned=join(directory,'owned');await mkdir(owned);
 await removeUnpublishedPhotoSnapshot({snapshot,backup:backup.storage('backups'),key,prefix:'petcore',directory:owned});assert.equal(backup.objects.size,0);assert.equal(source.objects.size,1);
}));
test('plano de expiração recusa namespace ativo e bucket diferente',()=>{
 const id=randomUUID(),prefix='homologacao',objectKey=`${prefix}/petcore-2026-11-13T12-00-00-000Z-${id}.dump.enc`,fingerprint='a'.repeat(64);
 const manifest=validateBackupObjectKey(prefix,id,objectKey),row={id,state:'expiring',object_key:objectKey,sha256:'b'.repeat(64),size_bytes:72,expiration_objects:[objectKey,manifest],expiration_bucket_fingerprint:fingerprint};
 assert.deepEqual(validateExpirationPlan(prefix,row,fingerprint),row.expiration_objects);
 assert.throws(()=>validateExpirationPlan(prefix,{...row,expiration_objects:[objectKey,manifest,`tenants/${randomUUID()}/pets/private.webp`]},fingerprint),{code:'BACKUP_RETENTION_PLAN_INVALID'});
 assert.throws(()=>validateExpirationPlan(prefix,row,'c'.repeat(64)),{code:'BACKUP_RETENTION_PLAN_INVALID'});
 assert.throws(()=>validateBackupObjectKey(prefix,id,'other/'+basename(objectKey)),{code:'BACKUP_RETENTION_OBJECT_INVALID'});
});
async function recoveryFixture(directory:string){
 const source=new FakeObjectStore(),backup=new FakeObjectStore(),key=randomBytes(32),tenantId=randomUUID(),petId=randomUUID(),sourceKey=`tenants/${tenantId}/pets/${petId}/${randomUUID()}.webp`,content=randomBytes(256);
 source.objects.set(sourceKey,content);
 const snapshot=await createPhotoSnapshot({db:{query:async()=>({rows:[{tenant_id:tenantId,id:petId,photo_key:sourceKey}]})} as any,source:source.storage('photos'),backup:backup.storage('backups'),key,backupId:randomUUID(),prefix:'petcore',directory});
 return {source,backup,key,snapshot,sourceKey,content};
}
test('recuperação definitiva recusa bucket ativo ou de backups antes de escrever',async()=>ownTemporary(async directory=>{
 assert.equal(storageFingerprint('https://STORAGE.example.test:443/','photos'),storageFingerprint('https://storage.example.test','photos'));
 const fixture=await recoveryFixture(directory),target=join(directory,'new');await mkdir(target);
 const options={snapshot:fixture.snapshot,backup:fixture.backup.storage('backups'),key:fixture.key,prefix:'petcore',directory:target,activeSourceFingerprint:fixture.source.storage('photos').fingerprint,confirmNewEmptyBucket:true,confirmPrivacyReviewed:true};
 await assert.rejects(restorePhotoSnapshotToEmptyBucket({...options,target:fixture.source.storage('photos')}),{code:'PHOTO_RESTORE_TARGET_MUST_BE_SEPARATE'});
 await assert.rejects(restorePhotoSnapshotToEmptyBucket({...options,target:fixture.backup.storage('backups')}),{code:'PHOTO_RESTORE_TARGET_MUST_BE_SEPARATE'});assert.equal(fixture.source.writes.length,0);
}));
test('recuperação definitiva recusa bucket ocupado e preserva conteúdo existente',async()=>ownTemporary(async directory=>{
 const fixture=await recoveryFixture(directory),store=new FakeObjectStore();store.objects.set('existing.webp',Buffer.from('KEEP'));
 const target=join(directory,'new');await mkdir(target);
 await assert.rejects(restorePhotoSnapshotToEmptyBucket({snapshot:fixture.snapshot,backup:fixture.backup.storage('backups'),key:fixture.key,prefix:'petcore',directory:target,target:store.storage('new-photos'),activeSourceFingerprint:fixture.source.storage('photos').fingerprint,confirmNewEmptyBucket:true,confirmPrivacyReviewed:true}),{code:'PHOTO_RESTORE_TARGET_NOT_EMPTY'});
 assert.equal(store.writes.length,0);assert.equal(store.objects.get('existing.webp')!.toString(),'KEEP');
}));
test('recuperação definitiva em bucket novo preserva nomes originais e bytes',async()=>ownTemporary(async directory=>{
 const fixture=await recoveryFixture(directory),store=new FakeObjectStore(),target=join(directory,'new');await mkdir(target);
 const result=await restorePhotoSnapshotToEmptyBucket({snapshot:fixture.snapshot,backup:fixture.backup.storage('backups'),key:fixture.key,prefix:'petcore',directory:target,target:store.storage('new-photos'),activeSourceFingerprint:fixture.source.storage('photos').fingerprint,confirmNewEmptyBucket:true,confirmPrivacyReviewed:true});
 assert.equal(result.photosRestored,1);assert.equal(result.applicationReady,false);assert.equal(result.activeStorageModified,false);assert.deepEqual(store.objects.get(fixture.sourceKey),fixture.content);assert.deepEqual(fixture.source.objects.get(fixture.sourceKey),fixture.content);
}));
