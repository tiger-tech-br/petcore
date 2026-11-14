import {createWriteStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join,posix} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import {parseBackupKey,decryptBackupFile} from '../dist/backupCrypto.js';
import {photoStorage,restorePhotoSnapshotToEmptyBucket,storageFingerprint} from '../dist/photoBackup.js';
import {BACKUP_RETENTION_LOCK,validateBackupObjectKey} from '../dist/backupRetention.js';
import {backupStorage,databaseAddress,databaseOptions,failure,fingerprint,privateTemporary,removeTemporary,safeCode} from './backup.mjs';

export async function restorePhotos(args=process.argv.slice(2)){
 if(args.includes('--help')){console.log('node api/scripts/restore-photos.mjs --object-key <chave.dump.enc> --confirm-new-empty-bucket YES --confirm-privacy-reviewed YES');return;}
 if(args.length!==6||args[0]!=='--object-key'||args[2]!=='--confirm-new-empty-bucket'||args[3]!=='YES'||args[4]!=='--confirm-privacy-reviewed'||args[5]!=='YES')throw failure('PHOTO_RESTORE_CONFIRMATION_REQUIRED');
 const prefix=(process.env.BACKUP_STORAGE_PREFIX||'petcore').replace(/^\/+|\/+$/g,''),objectKey=args[1],backupId=/-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.dump\.enc$/i.exec(objectKey)?.[1];
 if(!backupId)throw failure('BACKUP_RETENTION_OBJECT_INVALID');const manifestKey=validateBackupObjectKey(prefix,backupId,objectKey);
 if(!process.env.OBJECT_STORAGE_ENDPOINT||!process.env.OBJECT_STORAGE_BUCKET)throw failure('PHOTO_RESTORE_ACTIVE_STORAGE_IDENTITY_REQUIRED');
 const activeFingerprint=storageFingerprint(process.env.OBJECT_STORAGE_ENDPOINT,process.env.OBJECT_STORAGE_BUCKET);
 const target=photoStorage(Object.fromEntries(['ENDPOINT','BUCKET','REGION','ACCESS_KEY','SECRET_KEY'].map(name=>['OBJECT_STORAGE_'+name,process.env['RESTORE_OBJECT_STORAGE_'+name]])));
 if(!target)throw failure('PHOTO_RESTORE_TARGET_REQUIRED');
 const backup=backupStorage();backup.fingerprint=storageFingerprint(process.env.BACKUP_STORAGE_ENDPOINT,backup.bucket);
 if(target.fingerprint===activeFingerprint||target.fingerprint===backup.fingerprint)throw failure('PHOTO_RESTORE_TARGET_MUST_BE_SEPARATE');
 const key=parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY),directory=await privateTemporary(),abort=new AbortController();let db,guard,locked=false,lost=false,source;
 try{
  if(process.env.RESTORE_RETENTION_PAUSED!=='YES'){
   source=databaseAddress(process.env.DATABASE_DIRECT_URL||process.env.DATABASE_URL);db=new Pool(databaseOptions(source));db.on('error',()=>console.error(JSON.stringify({event:'photo_restore_guard_connection_lost'})));
   guard=await db.connect();guard.on('error',()=>{lost=true;abort.abort();});locked=(await guard.query('SELECT pg_try_advisory_lock_shared($1) AS locked',[BACKUP_RETENTION_LOCK])).rows[0].locked;
   if(!locked)throw failure('RESTORE_RETENTION_RUNNING');
   const record=(await guard.query('SELECT state FROM backup_runs WHERE id=$1',[backupId])).rows[0];if(!record||!['uploaded','verified'].includes(record.state))throw failure('RESTORE_BACKUP_NOT_AVAILABLE');
  }
  const signal=AbortSignal.any([abort.signal,AbortSignal.timeout(30*60*1000)]),encrypted=join(directory,'database-manifest.enc'),plain=join(directory,'database-manifest.json');
  const response=await backup.client.send(new GetObjectCommand({Bucket:backup.bucket,Key:manifestKey}),{abortSignal:signal});
  if(!response.Body||Number(response.ContentLength??0)>5*1024*1024+36)throw failure('RESTORE_MANIFEST_INVALID');let size=0;
  const bounded=new Transform({transform(chunk,_encoding,done){size+=chunk.length;done(size>5*1024*1024+36?failure('RESTORE_MANIFEST_INVALID'):null,chunk);}});
  await pipeline(response.Body,bounded,createWriteStream(encrypted,{flags:'wx',mode:0o600}),{signal});await decryptBackupFile(encrypted,plain,key);
  const manifest=JSON.parse(await readFile(plain,'utf8'));
  if(manifest.format!=='petcore.backup.v1'||manifest.backupId!==backupId||manifest.dumpFile!==posix.basename(objectKey)||manifest.objectsIncluded!==true||manifest.photos?.backupId!==backupId)throw failure('PHOTO_RESTORE_MANIFEST_INVALID');
  if(source&&manifest.sourceFingerprint!==fingerprint(source))throw failure('RESTORE_RETENTION_SOURCE_MISMATCH');
  const result=await restorePhotoSnapshotToEmptyBucket({snapshot:manifest.photos,backup,key,prefix,directory,target,activeSourceFingerprint:activeFingerprint,confirmNewEmptyBucket:true,confirmPrivacyReviewed:true,signal});console.log(JSON.stringify(result));return result;
 }finally{
  if(locked&&!lost)await guard?.query('SELECT pg_advisory_unlock_shared($1)',[BACKUP_RETENTION_LOCK]).catch(()=>{});guard?.release(lost);await db?.end();target.client.destroy();backup.client.destroy();await removeTemporary(directory);
 }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)restorePhotos().catch(error=>{console.error(JSON.stringify({ok:false,code:safeCode(error,'PHOTO_RESTORE_FAILED')}));process.exitCode=1;});
