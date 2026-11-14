import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,posix} from 'node:path';
import pg from 'pg';
import {DeleteObjectCommand} from '@aws-sdk/client-s3';
import {encryptBackupFile} from '../src/backupCrypto.ts';
import {createPhotoSnapshot} from '../src/photoBackup.ts';
import {expireBackups} from '../src/backupRetention.ts';
import {FakeObjectStore,ownTemporary} from './helpers/fakePhotoStorage.ts';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Configure TEST_DATABASE_URL exclusivo terminado em _test.');
const sourceFingerprint='a'.repeat(64),prefix='homologacao';
async function isolated(run:(db:pg.PoolClient,directory:string)=>Promise<void>){
 const pool=new pg.Pool({connectionString:testUrl,max:1,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined}),db=await pool.connect();
 try{
  // No source rows or global settings are touched: this session shadows only
  // backup_runs with a temporary copy of the real migration018 structure.
  await db.query('CREATE TEMP TABLE backup_runs (LIKE public.backup_runs INCLUDING ALL)');
  await ownTemporary(directory=>run(db,directory));
 }finally{db.release();await pool.end();}
}
async function fixture(db:pg.PoolClient,directory:string,store:FakeObjectStore,key:Buffer,daysAgo:number,withPhoto=false){
 const id=randomUUID(),folder=join(directory,id);await mkdir(folder);
 const objectKey=`${prefix}/petcore-2026-11-13T12-00-00-000Z-${id}.dump.enc`,manifestKey=objectKey.replace(/\.dump\.enc$/,'.manifest.enc');
 const plain=join(folder,'dump'),encrypted=join(folder,'dump.enc');await writeFile(plain,randomBytes(100));const dump=await encryptBackupFile(plain,encrypted,key);store.objects.set(objectKey,await readFile(encrypted));
 let photos;
 if(withPhoto){
  const source=new FakeObjectStore(),tenant=randomUUID(),pet=randomUUID(),sourceKey=`tenants/${tenant}/pets/${pet}/${randomUUID()}.webp`;source.objects.set(sourceKey,randomBytes(512));
  photos=await createPhotoSnapshot({db:{query:async()=>({rows:[{tenant_id:tenant,id:pet,photo_key:sourceKey}]})} as any,source:source.storage('photos'),backup:store.storage('backups'),key,backupId:id,prefix,directory:folder});
 }
 const manifest={format:'petcore.backup.v1',backupId:id,createdAt:new Date(Date.now()-daysAgo*86400000).toISOString(),sourceFingerprint,dumpFile:posix.basename(objectKey),dumpSha256:dump.sha256,dumpBytes:dump.sizeBytes,objectsIncluded:Boolean(photos),...(photos?{photos}:{})};
 const manifestPlain=join(folder,'manifest'),manifestEncrypted=join(folder,'manifest.enc');await writeFile(manifestPlain,JSON.stringify(manifest));await encryptBackupFile(manifestPlain,manifestEncrypted,key);store.objects.set(manifestKey,await readFile(manifestEncrypted));
 await db.query("INSERT INTO backup_runs(id,state,started_at,finished_at,object_key,sha256,size_bytes) VALUES($1,'uploaded',now()-($5::int*interval '1 day'),now()-($5::int*interval '1 day'),$2,$3,$4)",[id,objectKey,dump.sha256,dump.sizeBytes,daysAgo]);
 return {id,objectKey,manifestKey,photos};
}

test('retenção faz dry-run sem escrita e expira só cópia com mais de30dias, incluindo fotos',async()=>isolated(async(db,directory)=>{
 const store=new FakeObjectStore(),key=randomBytes(32),old=await fixture(db,directory,store,key,31,true),recent=await fixture(db,directory,store,key,29);
 const options={db,backup:store.storage('backups'),key,prefix,sourceFingerprint,directory};
 const dry=await expireBackups(options);assert.equal(dry.ok,true);assert.equal(dry.due,1);assert.equal(dry.expired,0);assert.equal(store.deletes.length,0);
 assert.equal((await db.query('SELECT state FROM backup_runs WHERE id=$1',[old.id])).rows[0].state,'uploaded');
 const applied=await expireBackups({...options,apply:true});assert.equal(applied.ok,true);assert.equal(applied.expired,1);assert.equal(store.deletes.length,4);
 const row=(await db.query('SELECT * FROM backup_runs WHERE id=$1',[old.id])).rows[0];assert.equal(row.state,'expired');assert.ok(row.expired_at);assert.equal(row.expiration_objects,null);
 assert.ok(store.objects.has(recent.objectKey));assert.ok(store.objects.has(recent.manifestKey));assert.equal((await db.query('SELECT state FROM backup_runs WHERE id=$1',[recent.id])).rows[0].state,'uploaded');
}));
test('expiração parcial conserva plano e retoma sem depender de manifesto já removido',async()=>isolated(async(db,directory)=>{
 const store=new FakeObjectStore(),key=randomBytes(32),old=await fixture(db,directory,store,key,40,true),options={db,backup:store.storage('backups'),key,prefix,sourceFingerprint,directory,apply:true};
 store.failDelete=old.manifestKey;const interrupted=await expireBackups(options);assert.equal(interrupted.ok,false);
 const row=(await db.query('SELECT * FROM backup_runs WHERE id=$1',[old.id])).rows[0];assert.equal(row.state,'expiring');assert.equal(row.expiration_objects.length,4);assert.ok(row.expiration_started_at);assert.equal(row.expired_at,null);
 // Simulates interruption after the last object was removed but before the
 // final DB update. The durable list remains sufficient and tenant-safe.
 store.objects.delete(old.manifestKey);store.failDelete=null;
 const resumed=await expireBackups(options);assert.equal(resumed.ok,true);assert.equal(resumed.expired,1);assert.equal(store.objects.size,0);
 assert.equal((await db.query('SELECT state FROM backup_runs WHERE id=$1',[old.id])).rows[0].state,'expired');
}));
test('manifesto não autenticado e plano com chave ativa são recusados sem apagar objetos',async()=>isolated(async(db,directory)=>{
 const store=new FakeObjectStore(),key=randomBytes(32),old=await fixture(db,directory,store,key,40),options={db,backup:store.storage('backups'),key,prefix,sourceFingerprint,directory,apply:true};
 const original=store.objects.get(old.manifestKey)!,corrupt=Buffer.from(original);corrupt[24]^=1;store.objects.set(old.manifestKey,corrupt);
 const rejected=await expireBackups(options);assert.equal(rejected.ok,false);assert.equal(store.deletes.length,0);assert.equal((await db.query('SELECT state FROM backup_runs WHERE id=$1',[old.id])).rows[0].state,'uploaded');
 await db.query("UPDATE backup_runs SET state='expiring',expiration_started_at=now(),expiration_objects=$2::jsonb,expiration_bucket_fingerprint=$3 WHERE id=$1",[old.id,JSON.stringify([old.objectKey,old.manifestKey,`tenants/${randomUUID()}/pets/active.webp`]),options.backup.fingerprint]);
 const forged=await expireBackups(options);assert.equal(forged.ok,false);assert.equal(store.deletes.length,0);assert.equal(forged.failures[0].code,'BACKUP_RETENTION_PLAN_INVALID');
}));

test('vinte manifestos inválidos não bloqueiam a cópia válida na página seguinte',async()=>isolated(async(db,directory)=>{
 const store=new FakeObjectStore(),key=randomBytes(32),invalid=[];
 for(let index=0;index<20;index++){
  const backup=await fixture(db,directory,store,key,40);invalid.push(backup);
  if(index<10)store.objects.delete(backup.manifestKey);
  else{const corrupt=Buffer.from(store.objects.get(backup.manifestKey)!);corrupt[0]^=1;store.objects.set(backup.manifestKey,corrupt);}
 }
 const valid=await fixture(db,directory,store,key,31);
 // Tied timestamps include sub-millisecond precision, exercising the keyset cursor.
 await db.query("UPDATE backup_runs SET finished_at='2000-01-01 00:00:00.123456+00' WHERE id=ANY($1::uuid[])",[invalid.map(item=>item.id)]);
 await db.query("UPDATE backup_runs SET finished_at='2000-01-02 00:00:00.123456+00' WHERE id=$1",[valid.id]);
 const options={db,backup:store.storage('backups'),key,prefix,sourceFingerprint,directory,limit:1};
 const bounded=await expireBackups({...options,scanLimit:20});
 assert.equal(bounded.ok,false);assert.equal(bounded.due,20);assert.equal(bounded.validated,0);assert.equal(bounded.scanLimitReached,true);assert.equal(bounded.code,'BACKUP_RETENTION_SCAN_LIMIT_REACHED');assert.equal(store.deletes.length,0);
 const dry=await expireBackups(options);
 assert.equal(dry.ok,false);assert.equal(dry.due,21);assert.equal(dry.validated,1);assert.equal(dry.failures.length,20);assert.equal(dry.expired,0);assert.equal(store.deletes.length,0);
 const applied=await expireBackups({...options,apply:true});
 assert.equal(applied.ok,false);assert.equal(applied.due,21);assert.equal(applied.validated,1);assert.equal(applied.expired,1);assert.equal(applied.failures.length,20);assert.equal(applied.scanLimitReached,false);
 assert.deepEqual(store.deletes,[valid.objectKey,valid.manifestKey]);
 assert.equal((await db.query("SELECT count(*)::int AS total FROM backup_runs WHERE id=ANY($1::uuid[]) AND state='uploaded'",[invalid.map(item=>item.id)])).rows[0].total,20);
 for(const backup of invalid)assert.ok(store.objects.has(backup.objectKey));
 assert.equal((await db.query('SELECT state FROM backup_runs WHERE id=$1',[valid.id])).rows[0].state,'expired');
}));

test('retenção abortada informa interrupção antes de ler ou apagar objetos',async()=>isolated(async(db,directory)=>{
 const store=new FakeObjectStore(),abort=new AbortController();abort.abort();
 const result=await expireBackups({db,backup:store.storage('backups'),key:randomBytes(32),prefix,sourceFingerprint,directory,apply:true,signal:abort.signal});
 assert.equal(result.ok,false);assert.equal(result.aborted,true);assert.equal(result.code,'BACKUP_RETENTION_ABORTED');assert.equal(result.due,0);assert.equal(store.deletes.length,0);
}));

test('interrupção durante exclusão conserva o plano e informa abort mesmo no limite validado',async()=>isolated(async(db,directory)=>{
 const store=new FakeObjectStore(),key=randomBytes(32),backup=await fixture(db,directory,store,key,40),abort=new AbortController(),send=store.send.bind(store);
 store.send=async command=>{if(command instanceof DeleteObjectCommand){abort.abort();throw Object.assign(new Error(),{code:'SIMULATED_ABORT'});}return send(command);};
 const result=await expireBackups({db,backup:store.storage('backups'),key,prefix,sourceFingerprint,directory,apply:true,limit:1,signal:abort.signal});
 assert.equal(result.ok,false);assert.equal(result.aborted,true);assert.equal(result.code,'BACKUP_RETENTION_ABORTED');assert.equal(result.validated,1);assert.equal(result.expired,0);assert.equal(store.deletes.length,0);
 const row=(await db.query('SELECT state,expiration_objects FROM backup_runs WHERE id=$1',[backup.id])).rows[0];
 assert.equal(row.state,'expiring');assert.deepEqual(row.expiration_objects,[backup.objectKey,backup.manifestKey]);
}));
