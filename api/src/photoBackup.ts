import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,unlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {S3Client,GetObjectCommand,PutObjectCommand,HeadObjectCommand,DeleteObjectCommand,ListObjectsV2Command} from '@aws-sdk/client-s3';
import type {PoolClient} from 'pg';
import {decryptBackupFile,encryptBackupFile,hashBackupFile} from './backupCrypto.js';
import {readStorageMetadata} from './storageMetadata.js';

export const PHOTO_BACKUP_LOCK=719381011;
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',uuid=new RegExp('^'+UUID+'$','i'),hash=/^[a-f0-9]{64}$/;
const MAX_PHOTOS=10000,MAX_PHOTO_BYTES=8*1024*1024,MAX_MANIFEST_BYTES=5*1024*1024;
const failure=(code:string)=>Object.assign(new Error(code),{code});
export type PhotoStorage={client:S3Client;bucket:string;fingerprint:string};
export type PhotoSnapshot={format:'petcore.photos.v1';backupId:string;manifestObjectKey:string;manifestSha256:string;photoCount:number;plaintextBytes:number;attemptId?:string};
type Entry={tenantId:string;petId:string;sourceKey:string;objectKey:string;sha256:string;bytes:number;plaintextSha256:string;plaintextBytes:number};
type Manifest={format:'petcore.photos.v1';backupId:string;createdAt:string;sourceFingerprint:string|null;entries:Entry[]};
export function storageFingerprint(endpoint:string,bucket:string){
 let address:URL;try{address=new URL(endpoint);}catch{throw failure('PHOTO_STORAGE_ENDPOINT_INVALID');}
 if(address.protocol!=='https:'||address.username||address.password||address.search||address.hash)throw failure('PHOTO_STORAGE_ENDPOINT_INVALID');
 // Normalize hostname case and the implicit HTTPS port so an alias cannot
 // bypass the guard separating active, backup and recovery buckets.
 return createHash('sha256').update(address.href.replace(/\/+$/,'')+'\n'+bucket).digest('hex');
}
export function photoStorage(env:NodeJS.ProcessEnv=process.env):PhotoStorage|null{
 const names=['OBJECT_STORAGE_ENDPOINT','OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_ACCESS_KEY','OBJECT_STORAGE_SECRET_KEY'];
 if(names.every(name=>!env[name]))return null;
 if(!names.every(name=>env[name]))throw failure('PHOTO_STORAGE_MISSING');
 let address:URL;try{address=new URL(env.OBJECT_STORAGE_ENDPOINT!);}catch{throw failure('PHOTO_STORAGE_ENDPOINT_INVALID');}
 if(address.protocol!=='https:'||address.username||address.password||address.search||address.hash)throw failure('PHOTO_STORAGE_ENDPOINT_INVALID');
 return {bucket:env.OBJECT_STORAGE_BUCKET!,fingerprint:storageFingerprint(address.href,env.OBJECT_STORAGE_BUCKET!),client:new S3Client({endpoint:address.href,region:env.OBJECT_STORAGE_REGION||'auto',forcePathStyle:true,credentials:{accessKeyId:env.OBJECT_STORAGE_ACCESS_KEY!,secretAccessKey:env.OBJECT_STORAGE_SECRET_KEY!}})};
}
export function photoSnapshotRoot(prefix:string,backupId:string){
 if(!/^[a-zA-Z0-9/_-]{1,200}$/.test(prefix)||prefix.startsWith('/')||prefix.endsWith('/')||prefix.split('/').includes('..')||!uuid.test(backupId))throw failure('PHOTO_BACKUP_PREFIX_INVALID');
 return `${prefix}/photo-snapshots/${backupId}`;
}
export function validatePhotoKey(tenantId:string,petId:string,key:string){
 if(!uuid.test(tenantId)||!uuid.test(petId)||!new RegExp(`^tenants/${tenantId}/pets/${petId}/${UUID}\\.webp$`,'i').test(key))throw failure('PHOTO_BACKUP_SOURCE_KEY_INVALID');
}
async function download(storage:PhotoStorage,key:string,path:string,maximum:number,signal:AbortSignal){
 const response=await storage.client.send(new GetObjectCommand({Bucket:storage.bucket,Key:key}),{abortSignal:signal});
 if(!response.Body||Number(response.ContentLength??0)>maximum)throw failure('PHOTO_BACKUP_OBJECT_TOO_LARGE');
 let bytes=0;const limit=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>maximum?failure('PHOTO_BACKUP_OBJECT_TOO_LARGE'):null,chunk);}});
 await pipeline(response.Body as NodeJS.ReadableStream,limit,createWriteStream(path,{flags:'wx',mode:0o600}),{signal});
}
async function upload(storage:PhotoStorage,key:string,path:string,bytes:number,signal:AbortSignal,contentType='application/octet-stream',metadata:Record<string,string>={}){
 await storage.client.send(new PutObjectCommand({Bucket:storage.bucket,Key:key,Body:createReadStream(path),ContentLength:bytes,ContentType:contentType,IfNoneMatch:'*',Metadata:metadata}),{abortSignal:signal});
}

// The caller holds PHOTO_BACKUP_LOCK shared from before the database snapshot.
// Object names are immutable UUIDs; replacement queues the old name for deletion.
export async function createPhotoSnapshot(options:{db:Pick<PoolClient,'query'>;source:PhotoStorage|null;backup:PhotoStorage;key:Buffer;backupId:string;prefix:string;directory:string;signal?:AbortSignal}):Promise<PhotoSnapshot>{
 const root=photoSnapshotRoot(options.prefix,options.backupId),signal=options.signal??AbortSignal.timeout(30*60*1000);
 const rows=await options.db.query<{tenant_id:string;id:string;photo_key:string}>('SELECT tenant_id,id,photo_key FROM pets WHERE photo_key IS NOT NULL ORDER BY tenant_id,id LIMIT 10001');
 if(rows.rows.length>MAX_PHOTOS)throw failure('PHOTO_BACKUP_REQUIRES_BATCH_REVIEW');
 if(rows.rows.length&&!options.source)throw failure('PHOTO_STORAGE_MISSING');
 if(options.source?.fingerprint===options.backup.fingerprint)throw failure('PHOTO_BACKUP_STORAGE_MUST_BE_SEPARATE');
 const directory=join(options.directory,'photos');await mkdir(directory,{mode:0o700});const entries:Entry[]=[],attemptId=randomUUID(),attemptedKeys:string[]=[];
 const ownership={'petcore-backup-id':options.backupId,'petcore-snapshot-attempt':attemptId};
 try{
 for(const [index,row] of rows.rows.entries()){
  validatePhotoKey(row.tenant_id,row.id,row.photo_key);
  const plain=join(directory,index+'.webp'),encrypted=join(directory,index+'.enc');
  await download(options.source!,row.photo_key,plain,MAX_PHOTO_BYTES,signal);
  const original=await hashBackupFile(plain),cipher=await encryptBackupFile(plain,encrypted,options.key);await unlink(plain);
  const objectKey=`${root}/${index}.webp.enc`;attemptedKeys.push(objectKey);await upload(options.backup,objectKey,encrypted,cipher.sizeBytes,signal,'application/octet-stream',ownership);await unlink(encrypted);
  entries.push({tenantId:row.tenant_id,petId:row.id,sourceKey:row.photo_key,objectKey,sha256:cipher.sha256,bytes:cipher.sizeBytes,plaintextSha256:original.sha256,plaintextBytes:original.sizeBytes});
 }
 const manifest:Manifest={format:'petcore.photos.v1',backupId:options.backupId,createdAt:new Date().toISOString(),sourceFingerprint:options.source?.fingerprint??null,entries};
 const content=JSON.stringify(manifest);if(Buffer.byteLength(content)>MAX_MANIFEST_BYTES)throw failure('PHOTO_BACKUP_MANIFEST_TOO_LARGE');
 const plain=join(directory,'manifest.json'),encrypted=join(directory,'manifest.enc');await writeFile(plain,content,{flag:'wx',mode:0o600});
 const cipher=await encryptBackupFile(plain,encrypted,options.key);await unlink(plain);const manifestObjectKey=`${root}/manifest.enc`;
 attemptedKeys.push(manifestObjectKey);await upload(options.backup,manifestObjectKey,encrypted,cipher.sizeBytes,signal,'application/octet-stream',ownership);await unlink(encrypted);
 return {format:'petcore.photos.v1',backupId:options.backupId,manifestObjectKey,manifestSha256:cipher.sha256,photoCount:entries.length,plaintextBytes:entries.reduce((sum,entry)=>sum+entry.plaintextBytes,0),attemptId};
 }catch(error){
  let cleanupFailed=false;const cleanupSignal=AbortSignal.timeout(60000);
  for(const objectKey of attemptedKeys){
   if(cleanupSignal.aborted){cleanupFailed=true;break;}
   try{
    const head=await options.backup.client.send(new HeadObjectCommand({Bucket:options.backup.bucket,Key:objectKey}),{abortSignal:AbortSignal.any([cleanupSignal,AbortSignal.timeout(15000)])});
    // A previous snapshot with the same backup UUID must never be removed by
    // a failed overwrite attempt. Only this call's random ownership nonce wins.
    if(readStorageMetadata(head.Metadata,'petcore-snapshot-attempt')!==attemptId||readStorageMetadata(head.Metadata,'petcore-backup-id')!==options.backupId)continue;
    await options.backup.client.send(new DeleteObjectCommand({Bucket:options.backup.bucket,Key:objectKey}),{abortSignal:AbortSignal.any([cleanupSignal,AbortSignal.timeout(15000)])});
   }catch(cleanup){const issue=cleanup as {name?:string;$metadata?:{httpStatusCode?:number}};if(issue.$metadata?.httpStatusCode!==404&&!['NoSuchKey','NotFound'].includes(issue.name??''))cleanupFailed=true;}
  }
  if(cleanupFailed)throw failure('PHOTO_BACKUP_PARTIAL_CLEANUP_REQUIRED');
  throw error;
 }
}

export async function readPhotoSnapshot(options:{snapshot:PhotoSnapshot;backup:PhotoStorage;key:Buffer;prefix:string;directory:string;signal?:AbortSignal}):Promise<Manifest>{
 const {snapshot}=options,root=photoSnapshotRoot(options.prefix,snapshot.backupId),signal=options.signal??AbortSignal.timeout(30*60*1000);
 if(snapshot.format!=='petcore.photos.v1'||snapshot.manifestObjectKey!==`${root}/manifest.enc`||!hash.test(snapshot.manifestSha256))throw failure('PHOTO_BACKUP_MANIFEST_INVALID');
 const encrypted=join(options.directory,'photo-manifest.enc'),plain=join(options.directory,'photo-manifest.json');
 await download(options.backup,snapshot.manifestObjectKey,encrypted,MAX_MANIFEST_BYTES+36,signal);await decryptBackupFile(encrypted,plain,options.key,snapshot.manifestSha256);
 let manifest:Manifest;try{manifest=JSON.parse(await readFile(plain,'utf8'));}catch{throw failure('PHOTO_BACKUP_MANIFEST_INVALID');}
 if(manifest.format!=='petcore.photos.v1'||manifest.backupId!==snapshot.backupId||!Array.isArray(manifest.entries)||manifest.entries.length>MAX_PHOTOS||manifest.entries.length!==snapshot.photoCount
  ||!Number.isSafeInteger(snapshot.plaintextBytes)||snapshot.plaintextBytes<0||!(manifest.sourceFingerprint===null||hash.test(manifest.sourceFingerprint))||!Number.isFinite(Date.parse(manifest.createdAt)))throw failure('PHOTO_BACKUP_MANIFEST_INVALID');
 const unique=new Set<string>();
 for(const [index,entry] of manifest.entries.entries()){
  validatePhotoKey(entry.tenantId,entry.petId,entry.sourceKey);
  if(entry.objectKey!==`${root}/${index}.webp.enc`||!hash.test(entry.sha256)||!hash.test(entry.plaintextSha256)||!Number.isSafeInteger(entry.bytes)||!Number.isSafeInteger(entry.plaintextBytes)||entry.plaintextBytes<1||entry.plaintextBytes>MAX_PHOTO_BYTES||entry.bytes!==entry.plaintextBytes+36||unique.has(entry.sourceKey))throw failure('PHOTO_BACKUP_MANIFEST_INVALID');
  unique.add(entry.sourceKey);
 }
 if(manifest.entries.reduce((sum,entry)=>sum+entry.plaintextBytes,0)!==snapshot.plaintextBytes)throw failure('PHOTO_BACKUP_MANIFEST_INVALID');
 return manifest;
}

// Used only when the enclosing database backup did not complete. The random
// attempt nonce prevents a failed retry from removing a previous snapshot.
export async function removeUnpublishedPhotoSnapshot(options:{snapshot:PhotoSnapshot;backup:PhotoStorage;key:Buffer;prefix:string;directory:string;signal?:AbortSignal}){
 if(!options.snapshot.attemptId||!uuid.test(options.snapshot.attemptId))throw failure('PHOTO_BACKUP_CLEANUP_OWNERSHIP_REQUIRED');
 const signal=options.signal??AbortSignal.timeout(60000),manifest=await readPhotoSnapshot({...options,signal});
 for(const objectKey of [...manifest.entries.map(entry=>entry.objectKey),options.snapshot.manifestObjectKey]){
  try{
   const head=await options.backup.client.send(new HeadObjectCommand({Bucket:options.backup.bucket,Key:objectKey}),{abortSignal:signal});
   if(readStorageMetadata(head.Metadata,'petcore-backup-id')!==options.snapshot.backupId||readStorageMetadata(head.Metadata,'petcore-snapshot-attempt')!==options.snapshot.attemptId)throw failure('PHOTO_BACKUP_CLEANUP_OWNERSHIP_REQUIRED');
   await options.backup.client.send(new DeleteObjectCommand({Bucket:options.backup.bucket,Key:objectKey}),{abortSignal:signal});
  }catch(error){const issue=error as {name?:string;$metadata?:{httpStatusCode?:number}};if(issue.$metadata?.httpStatusCode!==404&&!['NoSuchKey','NotFound'].includes(issue.name??''))throw error;}
 }
}

// This rehearsal never writes into tenants/: restoring the live namespace is a
// separate disaster-recovery decision after privacy/revocation reconciliation.
export async function verifyPhotoSnapshot(options:{snapshot:PhotoSnapshot;backup:PhotoStorage;key:Buffer;prefix:string;directory:string;target?:PhotoStorage;recoveryId?:string;signal?:AbortSignal}){
 const signal=options.signal??AbortSignal.timeout(30*60*1000),manifest=await readPhotoSnapshot({...options,signal}),recoveryId=options.recoveryId??randomUUID();
 if(!uuid.test(recoveryId))throw failure('PHOTO_RECOVERY_ID_INVALID');
 const recoveryPrefix=`recovery-tests/${recoveryId}`,restoredKeys:string[]=[];
 for(const [index,entry] of manifest.entries.entries()){
  const encrypted=join(options.directory,index+'.photo.enc'),plain=join(options.directory,index+'.photo.webp');
  await download(options.backup,entry.objectKey,encrypted,MAX_PHOTO_BYTES+36,signal);
  const original=await decryptBackupFile(encrypted,plain,options.key,entry.sha256);
  if(original.sha256!==entry.plaintextSha256||original.sizeBytes!==entry.plaintextBytes)throw failure('PHOTO_BACKUP_CHECKSUM_MISMATCH');
  if(options.target){
   const targetKey=`${recoveryPrefix}/${entry.sourceKey}`;await upload(options.target,targetKey,plain,original.sizeBytes,signal,'image/webp',{'petcore-recovery-id':recoveryId});restoredKeys.push(targetKey);
   const check=join(options.directory,index+'.restored.webp');await download(options.target,targetKey,check,MAX_PHOTO_BYTES,signal);
   const restored=await hashBackupFile(check);if(restored.sha256!==original.sha256||restored.sizeBytes!==original.sizeBytes)throw failure('PHOTO_RECOVERY_CHECKSUM_MISMATCH');
   await unlink(check);
  }
  await unlink(encrypted);await unlink(plain);
 }
 return {ok:true,backupId:manifest.backupId,photosVerified:manifest.entries.length,cloudRestoreVerified:Boolean(options.target),recoveryPrefix:options.target?recoveryPrefix:null,restoredKeys,activeNamespaceModified:false,applicationReady:false};
}

// Real recovery goes only into a separately configured NEW bucket. Original
// immutable names keep the restored DB references usable after operator review.
// Never use this function to fill, merge with or overwrite an active bucket.
export async function restorePhotoSnapshotToEmptyBucket(options:{snapshot:PhotoSnapshot;backup:PhotoStorage;key:Buffer;prefix:string;directory:string;target:PhotoStorage;activeSourceFingerprint:string;confirmNewEmptyBucket:boolean;confirmPrivacyReviewed:boolean;signal?:AbortSignal}){
 if(options.confirmNewEmptyBucket!==true||options.confirmPrivacyReviewed!==true)throw failure('PHOTO_RESTORE_CONFIRMATION_REQUIRED');
 if(!hash.test(options.activeSourceFingerprint)||!hash.test(options.target.fingerprint))throw failure('PHOTO_RESTORE_STORAGE_IDENTITY_REQUIRED');
 if(options.target.fingerprint===options.activeSourceFingerprint||options.target.fingerprint===options.backup.fingerprint)throw failure('PHOTO_RESTORE_TARGET_MUST_BE_SEPARATE');
 const signal=options.signal??AbortSignal.timeout(30*60*1000),manifest=await readPhotoSnapshot({...options,signal});
 if(manifest.sourceFingerprint===options.target.fingerprint)throw failure('PHOTO_RESTORE_TARGET_MUST_BE_SEPARATE');
 const contents=await options.target.client.send(new ListObjectsV2Command({Bucket:options.target.bucket,MaxKeys:1}),{abortSignal:signal});
 if((contents.KeyCount??0)>0||contents.Contents?.length||contents.IsTruncated)throw failure('PHOTO_RESTORE_TARGET_NOT_EMPTY');
 const restorationId=randomUUID();let photosRestored=0;
 for(const [index,entry] of manifest.entries.entries()){
  const encrypted=join(options.directory,index+'.restore.enc'),plain=join(options.directory,index+'.restore.webp');
  await download(options.backup,entry.objectKey,encrypted,MAX_PHOTO_BYTES+36,signal);
  const original=await decryptBackupFile(encrypted,plain,options.key,entry.sha256);
  if(original.sha256!==entry.plaintextSha256||original.sizeBytes!==entry.plaintextBytes)throw failure('PHOTO_BACKUP_CHECKSUM_MISMATCH');
  await upload(options.target,entry.sourceKey,plain,original.sizeBytes,signal,'image/webp',{'petcore-restoration-id':restorationId});
  const check=join(options.directory,index+'.restored-check.webp');await download(options.target,entry.sourceKey,check,MAX_PHOTO_BYTES,signal);
  const restored=await hashBackupFile(check);if(restored.sha256!==original.sha256||restored.sizeBytes!==original.sizeBytes)throw failure('PHOTO_RECOVERY_CHECKSUM_MISMATCH');
  await unlink(check);await unlink(encrypted);await unlink(plain);photosRestored++;
 }
 return {ok:true,event:'photos_restored_to_new_bucket',backupId:manifest.backupId,photosRestored,originalKeysPreserved:true,activeStorageModified:false,applicationReady:false};
}
