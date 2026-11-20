// Authorized, isolated operational rehearsal. No customer record is queried.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import {parseBackupKey} from '../dist/backupCrypto.js';
import {createPhotoSnapshot,verifyPhotoSnapshot,photoStorage,photoSnapshotRoot,storageFingerprint} from '../dist/photoBackup.js';
import {backupStorage,privateTemporary,removeTemporary,safeCode} from './backup.mjs';
import {readStorageMetadata} from '../dist/storageMetadata.js';
assert.deepEqual(process.argv.slice(2),['--confirm-isolated-test'],'Confirm the isolated fictitious-object rehearsal.');
const source=photoStorage();assert.ok(source,'Configure the existing photo bucket references.');
const backup=backupStorage();backup.fingerprint=storageFingerprint(process.env.BACKUP_STORAGE_ENDPOINT,backup.bucket);
assert.notEqual(source.fingerprint,backup.fingerprint);
const key=parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY),runId=randomUUID(),tenantId=randomUUID(),petId=randomUUID();
const prefix=(process.env.BACKUP_STORAGE_PREFIX||'petcore').replace(/^\/+|\/+$/g,'')+'/qa-photo-recovery/'+runId;
const sourceKey=`tenants/${tenantId}/pets/${petId}/${runId}.webp`,restoredKey=`recovery-tests/${runId}/${sourceKey}`,snapshotRoot=photoSnapshotRoot(prefix,runId);
const temporary=await privateTemporary(),cleanup=[{storage:source,key:sourceKey,owner:'qa-run'},{storage:source,key:restoredKey,owner:'petcore-recovery-id'},{storage:backup,key:snapshotRoot+'/0.webp.enc',owner:'petcore-backup-id'},{storage:backup,key:snapshotRoot+'/manifest.enc',owner:'petcore-backup-id'}];
const result={ok:false,event:'photo_recovery_smoke',runId,photosVerified:0,wrongKeyRejected:false,overwriteRejected:false,activeCustomerObjectsModified:false,cleanupComplete:false};
try{
 const content=await sharp({create:{width:16,height:16,channels:3,background:'#00a1a5'}}).webp().toBuffer();
 await source.client.send(new PutObjectCommand({Bucket:source.bucket,Key:sourceKey,Body:content,ContentType:'image/webp',IfNoneMatch:'*',Metadata:{'qa-run':runId}}),{abortSignal:AbortSignal.timeout(15000)});
 const db={query:async()=>({rows:[{tenant_id:tenantId,id:petId,photo_key:sourceKey}]})};
 const snapshot=await createPhotoSnapshot({db,source,backup,key,backupId:runId,prefix,directory:temporary});
 const wrong=join(temporary,'wrong-key');await mkdir(wrong);
 await assert.rejects(verifyPhotoSnapshot({snapshot,backup,key:Buffer.alloc(32,0xa5),prefix,directory:wrong,target:source,recoveryId:runId}),{code:'BACKUP_INTEGRITY_FAILURE'});result.wrongKeyRejected=true;
 const destination=join(temporary,'verified');await mkdir(destination);
 const verified=await verifyPhotoSnapshot({snapshot,backup,key,prefix,directory:destination,target:source,recoveryId:runId});
 assert.equal(verified.photosVerified,1);assert.equal(verified.cloudRestoreVerified,true);assert.deepEqual(verified.restoredKeys,[restoredKey]);result.photosVerified=verified.photosVerified;
 const second=join(temporary,'no-overwrite');await mkdir(second);
 await assert.rejects(verifyPhotoSnapshot({snapshot,backup,key,prefix,directory:second,target:source,recoveryId:runId}),error=>error?.$metadata?.httpStatusCode===412||error?.name==='PreconditionFailed');result.overwriteRejected=true;
 const original=await source.client.send(new GetObjectCommand({Bucket:source.bucket,Key:sourceKey}),{abortSignal:AbortSignal.timeout(15000)});
 assert.deepEqual(Buffer.from(await original.Body.transformToByteArray()),content);
 const recovered=await source.client.send(new GetObjectCommand({Bucket:source.bucket,Key:restoredKey}),{abortSignal:AbortSignal.timeout(15000)});
 assert.deepEqual(Buffer.from(await recovered.Body.transformToByteArray()),content);result.ok=true;
}catch(error){result.errorCode=safeCode(error,'PHOTO_SMOKE_FAILED');process.exitCode=1;}
finally{
 let cleaned=0;
 for(const object of cleanup){
  assert.ok(object.key===sourceKey||object.key===restoredKey||object.key===snapshotRoot+'/0.webp.enc'||object.key===snapshotRoot+'/manifest.enc');
  try{
   const found=await object.storage.client.send(new HeadObjectCommand({Bucket:object.storage.bucket,Key:object.key}),{abortSignal:AbortSignal.timeout(15000)});
   assert.equal(readStorageMetadata(found.Metadata,object.owner),runId,'Refusing to delete an object not owned by this isolated rehearsal.');
   await object.storage.client.send(new DeleteObjectCommand({Bucket:object.storage.bucket,Key:object.key}),{abortSignal:AbortSignal.timeout(15000)});cleaned++;
  }catch(error){
   if(error?.$metadata?.httpStatusCode===404||error?.name==='NotFound'||error?.name==='NoSuchKey')cleaned++;
   else{result.cleanupErrorCode='PHOTO_SMOKE_CLEANUP_FAILED';process.exitCode=1;}
  }
 }
 result.cleanupComplete=cleaned===cleanup.length;await removeTemporary(temporary);source.client.destroy();backup.client.destroy();
 console.log(JSON.stringify(result));
}
