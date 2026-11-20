import {createWriteStream} from 'node:fs';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join,posix} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import type {PoolClient} from 'pg';
import {DeleteObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {decryptBackupFile} from './backupCrypto.js';
import {photoSnapshotRoot,readPhotoSnapshot,type PhotoStorage} from './photoBackup.js';

export const BACKUP_RETENTION_LOCK=719381012;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=/^[a-f0-9]{64}$/;
const failure=(code:string)=>Object.assign(new Error(code),{code});
type BackupRow={id:string;state:string;object_key:string;sha256:string;size_bytes:string|number;expiration_objects:string[]|null;expiration_bucket_fingerprint:string|null;retention_cursor?:string};
type Options={db:Pick<PoolClient,'query'>;backup:PhotoStorage;key:Buffer;prefix:string;sourceFingerprint:string;directory:string;apply?:boolean;limit?:number;scanLimit?:number;signal?:AbortSignal};
export function validateBackupObjectKey(prefix:string,id:string,key:string){
 photoSnapshotRoot(prefix,id);
 if(!key.startsWith(prefix+'/')||key.slice(prefix.length+1).includes('/')||!new RegExp('^petcore-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z-'+id+'\\.dump\\.enc$','i').test(posix.basename(key)))throw failure('BACKUP_RETENTION_OBJECT_INVALID');
 return key.replace(/\.dump\.enc$/,'.manifest.enc');
}
export function validateExpirationPlan(prefix:string,row:BackupRow,fingerprint:string){
 const manifest=validateBackupObjectKey(prefix,row.id,row.object_key),root=photoSnapshotRoot(prefix,row.id),objects=row.expiration_objects;
 if(row.expiration_bucket_fingerprint!==fingerprint||!Array.isArray(objects)||objects.length<2||objects.length>10003||new Set(objects).size!==objects.length||!objects.includes(row.object_key)||!objects.includes(manifest))throw failure('BACKUP_RETENTION_PLAN_INVALID');
 for(const key of objects){
  if(key===row.object_key||key===manifest||key===root+'/manifest.enc')continue;
  if(typeof key!=='string'||!key.startsWith(root+'/')||!/^(?:0|[1-9][0-9]{0,3})\.webp\.enc$/.test(key.slice(root.length+1))||!objects.includes(root+'/manifest.enc'))throw failure('BACKUP_RETENTION_PLAN_INVALID');
 }
 return objects;
}
async function authenticatedPlan(options:Options,row:BackupRow,directory:string,signal:AbortSignal){
 const manifestKey=validateBackupObjectKey(options.prefix,row.id,row.object_key);
 if(!uuid.test(row.id)||!hash.test(row.sha256)||!hash.test(options.sourceFingerprint))throw failure('BACKUP_RETENTION_RECORD_INVALID');
 const response=await options.backup.client.send(new GetObjectCommand({Bucket:options.backup.bucket,Key:manifestKey}),{abortSignal:signal});
 if(!response.Body||Number(response.ContentLength??0)>5*1024*1024+36)throw failure('BACKUP_RETENTION_MANIFEST_INVALID');
 const encrypted=join(directory,'backup-manifest.enc'),plain=join(directory,'backup-manifest.json');let bytes=0;
 const bounded=new Transform({transform(chunk,_encoding,done){bytes+=chunk.length;done(bytes>5*1024*1024+36?failure('BACKUP_RETENTION_MANIFEST_INVALID'):null,chunk);}});
 await pipeline(response.Body as NodeJS.ReadableStream,bounded,createWriteStream(encrypted,{flags:'wx',mode:0o600}),{signal});
 await decryptBackupFile(encrypted,plain,options.key);
 let manifest:any;try{manifest=JSON.parse(await readFile(plain,'utf8'));}catch{throw failure('BACKUP_RETENTION_MANIFEST_INVALID');}
 if(manifest.format!=='petcore.backup.v1'||manifest.backupId!==row.id||manifest.sourceFingerprint!==options.sourceFingerprint||manifest.dumpSha256!==row.sha256||manifest.dumpBytes!==Number(row.size_bytes)||manifest.dumpFile!==posix.basename(row.object_key)||!Number.isFinite(Date.parse(manifest.createdAt)))throw failure('BACKUP_RETENTION_MANIFEST_INVALID');
 const objects=[row.object_key];
 if(manifest.objectsIncluded===true){
  if(!manifest.photos||manifest.photos.backupId!==row.id)throw failure('BACKUP_RETENTION_MANIFEST_INVALID');
  const photos=await readPhotoSnapshot({snapshot:manifest.photos,backup:options.backup,key:options.key,prefix:options.prefix,directory,signal});
  objects.push(...photos.entries.map(entry=>entry.objectKey),manifest.photos.manifestObjectKey);
 }else if(manifest.objectsIncluded!==false&&manifest.objectsIncluded!==undefined)throw failure('BACKUP_RETENTION_MANIFEST_INVALID');
 objects.push(manifestKey);
 validateExpirationPlan(options.prefix,{...row,expiration_objects:objects,expiration_bucket_fingerprint:options.backup.fingerprint},options.backup.fingerprint);
 return objects;
}

// Caller holds BACKUP_RETENTION_LOCK exclusively and the schema lock shared.
// A durable, validated object list permits safe resume after a partial delete.
export async function expireBackups(options:Options){
 const signal=options.signal??AbortSignal.timeout(30*60*1000),limit=options.limit??20,scanLimit=options.scanLimit??5000;
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(scanLimit)||scanLimit<1||scanLimit>5000||!hash.test(options.backup.fingerprint))throw failure('BACKUP_RETENTION_OPTIONS_INVALID');
 const result={ok:true,event:'backup_retention',mode:options.apply?'apply':'dry-run',retentionDays:30,due:0,validated:0,expired:0,scanLimit,scanLimitReached:false,limitReached:false,aborted:false,code:null as string|null,failures:[] as {backupId:string;code:string}[]};
 // Keep PostgreSQL's exact timestamp text: converting it to a JS Date would lose
 // microseconds and could repeat/skip rows at a page boundary. NULL dates sort last.
 let cursor:string|null=null,cursorId:string|null=null;
 const page=(size:number)=>options.db.query<BackupRow>(`SELECT id,state,object_key,sha256,size_bytes,expiration_objects,expiration_bucket_fingerprint,
  COALESCE(finished_at,'infinity'::timestamptz)::text AS retention_cursor FROM backup_runs
  WHERE retention_scope='active'
   AND (state='expiring' OR (state IN ('uploaded','verified') AND finished_at<now()-interval '30 days'))
   AND ($2::timestamptz IS NULL OR (COALESCE(finished_at,'infinity'::timestamptz),id)>($2::timestamptz,$3::uuid))
  ORDER BY COALESCE(finished_at,'infinity'::timestamptz),id LIMIT $1`,[size,cursor,cursorId]);
 const aborted=()=>{if(!signal.aborted)return false;result.ok=false;result.aborted=true;result.code='BACKUP_RETENTION_ABORTED';return true;};
 while(result.due<scanLimit&&result.validated<limit){
  if(aborted())return result;
  const rows=await page(Math.min(20,scanLimit-result.due));
  if(aborted())return result;
  if(!rows.rows.length)return result;
  for(const row of rows.rows){
   if(aborted())return result;
   cursor=row.retention_cursor!;cursorId=row.id;result.due++;
  try{
   const directory=await mkdtemp(join(options.directory,'retention-'));
   const objects=row.state==='expiring'?validateExpirationPlan(options.prefix,row,options.backup.fingerprint):await authenticatedPlan(options,row,directory,signal);
   result.validated++;
   if(options.apply){
    if(row.state!=='expiring'){
    const started=await options.db.query(`UPDATE backup_runs SET state='expiring',expiration_started_at=now(),expiration_objects=$2::jsonb,expiration_bucket_fingerprint=$3,error_code=NULL
     WHERE id=$1 AND state IN ('uploaded','verified') AND finished_at<now()-interval '30 days' RETURNING id`,[row.id,JSON.stringify(objects),options.backup.fingerprint]);
    if(!started.rowCount)throw failure('BACKUP_RETENTION_RECORD_CHANGED');
    }
    for(const key of objects)await options.backup.client.send(new DeleteObjectCommand({Bucket:options.backup.bucket,Key:key}),{abortSignal:signal});
    await options.db.query("UPDATE backup_runs SET state='expired',expired_at=now(),expiration_objects=NULL,error_code=NULL WHERE id=$1 AND state='expiring'",[row.id]);result.expired++;
   }
  }catch(error){
   result.ok=false;const code=typeof(error as {code?:unknown}).code==='string'&&/^[A-Z0-9_]{2,80}$/.test((error as {code:string}).code)?(error as {code:string}).code:'BACKUP_RETENTION_FAILED';
   result.failures.push({backupId:row.id,code});
   if(options.apply)await options.db.query("UPDATE backup_runs SET error_code=$2 WHERE id=$1 AND state='expiring'",[row.id,code]).catch(()=>{});
  }
   if(aborted())return result;
   if(result.validated>=limit){result.limitReached=true;return result;}
  }
 }
 if(aborted())return result;
 if(result.due>=scanLimit){
  const remaining=await page(1);if(aborted())return result;
  if(remaining.rowCount){result.ok=false;result.scanLimitReached=true;result.code='BACKUP_RETENTION_SCAN_LIMIT_REACHED';}
 }
 return result;
}
