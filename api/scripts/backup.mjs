import {config} from 'dotenv';
import {createHash,randomUUID} from 'node:crypto';
import {constants,createReadStream} from 'node:fs';
import {chmod,copyFile,lstat,mkdir,mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {encryptBackupFile,hashBackupFile,parseBackupKey} from '../dist/backupCrypto.js';
config({path:new URL('../../.env',import.meta.url)});

export function failure(code){return Object.assign(new Error(code),{code});}
export function safeCode(error,fallback='BACKUP_FAILED'){return typeof error?.code==='string'&&/^[A-Z0-9_]{2,80}$/.test(error.code)?error.code:fallback;}
export function databaseAddress(raw){
 if(!raw)throw failure('BACKUP_DATABASE_MISSING');
 let url;try{url=new URL(raw);}catch{throw failure('BACKUP_DATABASE_INVALID');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||decodeURIComponent(url.pathname).length<2)throw failure('BACKUP_DATABASE_INVALID');
 if(url.hostname.endsWith('.neon.tech'))url.hostname=url.hostname.replace(/-pooler(?=\.)/,'');
 const local=['localhost','127.0.0.1','[::1]','::1'].includes(url.hostname);
 const secure=url.hostname.endsWith('.neon.tech')||process.env.DATABASE_SSL==='true'||(process.env.NODE_ENV==='production'&&!local)||Boolean(url.searchParams.get('sslmode')&&url.searchParams.get('sslmode')!=='disable');
 if(secure){url.searchParams.set('sslmode','verify-full');url.searchParams.delete('uselibpqcompat');}
 return url;
}
export function databaseOptions(url){return{connectionString:url.toString(),max:3,connectionTimeoutMillis:15000,application_name:'petcore-backup',ssl:url.searchParams.get('sslmode')==='verify-full'?{rejectUnauthorized:true}:undefined};}
export function fingerprint(url){return createHash('sha256').update(`${url.hostname.toLowerCase()}:${url.port||'5432'}/${decodeURIComponent(url.pathname.slice(1))}`).digest('hex');}
export function programEnvironment(url){
 const env={};for(const name of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','LANG','LC_ALL','LD_LIBRARY_PATH'])if(process.env[name])env[name]=process.env[name];
 env.PGHOST=url.hostname.replace(/^\[|\]$/g,'');env.PGPORT=url.port||'5432';env.PGUSER=decodeURIComponent(url.username);env.PGDATABASE=decodeURIComponent(url.pathname.slice(1));
 if(url.password)env.PGPASSWORD=decodeURIComponent(url.password);
 env.PGCONNECT_TIMEOUT='15';env.PGCLIENTENCODING='UTF8';env.PGSSLMODE=url.searchParams.get('sslmode')||'disable';
 if(env.PGSSLMODE==='verify-full')env.PGSSLROOTCERT=url.searchParams.get('sslrootcert')||'system';
 for(const [parameter,name] of [['sslcert','PGSSLCERT'],['sslkey','PGSSLKEY'],['sslrootcert','PGSSLROOTCERT'],['sslcrl','PGSSLCRL']])if(url.searchParams.get(parameter))env[name]=url.searchParams.get(parameter);
 return env;
}
export async function runProgram(program,args,env,timeout=30*60*1000){
 return new Promise((resolvePromise,reject)=>{
  const child=spawn(program,args,{env,stdio:['ignore','pipe','pipe'],shell:false,windowsHide:true});let output='',settled=false;
  const timer=setTimeout(()=>{child.kill();if(!settled){settled=true;reject(failure('POSTGRES_PROGRAM_TIMEOUT'));}},timeout);timer.unref();
  child.stdout.on('data',chunk=>{if(output.length<65536)output+=chunk.toString('utf8');});
  // Não imprime stderr do libpq: mensagens podem conter detalhes da conexão.
  child.stderr.on('data',()=>{});
  child.on('error',()=>{clearTimeout(timer);if(!settled){settled=true;reject(failure('POSTGRES_PROGRAM_UNAVAILABLE'));}});
  child.on('close',code=>{clearTimeout(timer);if(settled)return;settled=true;if(code===0)resolvePromise(output.trim());else reject(failure('POSTGRES_PROGRAM_FAILED'));});
 });
}
export async function rowCounts(db){
 const names=await db.query(`SELECT n.nspname AS schema,c.relname AS table FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
   AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') ORDER BY n.nspname,c.relname`);
 const quote=value=>'"'+value.replaceAll('"','""')+'"',counts=[];
 for(const item of names.rows){const result=await db.query(`SELECT count(*)::text AS rows FROM ${quote(item.schema)}.${quote(item.table)}`);counts.push({...item,rows:result.rows[0].rows});}
 return counts;
}
export async function privateTemporary(){const directory=await mkdtemp(join(tmpdir(),'petcore-backup-'));await chmod(directory,0o700);return directory;}
export async function removeTemporary(directory){
 const parent=await realpath(tmpdir()),target=await realpath(directory),info=await lstat(directory);
 if(info.isSymbolicLink()||dirname(target)!==parent||!basename(target).startsWith('petcore-backup-'))throw failure('BACKUP_CLEANUP_PATH_INVALID');
 await rm(target,{recursive:true,force:true});
}
export function backupStorage(){
 const endpoint=process.env.BACKUP_STORAGE_ENDPOINT,bucket=process.env.BACKUP_STORAGE_BUCKET,access=process.env.BACKUP_STORAGE_ACCESS_KEY,secret=process.env.BACKUP_STORAGE_SECRET_KEY;
 if(!endpoint||!bucket||!access||!secret)throw failure('BACKUP_STORAGE_MISSING');
 const address=new URL(endpoint);if(address.protocol!=='https:'||address.username||address.password)throw failure('BACKUP_STORAGE_ENDPOINT_INVALID');
 if(bucket===process.env.OBJECT_STORAGE_BUCKET&&endpoint.replace(/\/+$/,'')===(process.env.OBJECT_STORAGE_ENDPOINT||'').replace(/\/+$/,''))throw failure('BACKUP_STORAGE_MUST_BE_SEPARATE');
 return{bucket,client:new S3Client({endpoint,region:process.env.BACKUP_STORAGE_REGION||'auto',forcePathStyle:true,credentials:{accessKeyId:access,secretAccessKey:secret}})};
}

export async function runBackup(args=process.argv.slice(2)){
 if(args.includes('--help')){console.log('node api/scripts/backup.mjs [--local --output <diretorio>]');return;}
 const local=args.includes('--local'),outputAt=args.indexOf('--output');
 if(args.some((arg,index)=>!['--local','--output'].includes(arg)&&!(outputAt>=0&&index===outputAt+1)))throw failure('BACKUP_ARGUMENT_INVALID');
 if(local&&(outputAt<0||!args[outputAt+1]))throw failure('BACKUP_LOCAL_OUTPUT_REQUIRED');
 if(!local&&outputAt>=0)throw failure('BACKUP_LOCAL_FLAG_REQUIRED');
 const source=databaseAddress(process.env.DATABASE_DIRECT_URL||process.env.DATABASE_URL);
 if(local&&!decodeURIComponent(source.pathname).endsWith('_test'))throw failure('BACKUP_LOCAL_TEST_DATABASE_REQUIRED');
 const key=parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY),storage=local?null:backupStorage();
 const db=new Pool(databaseOptions(source));let client,temp,backupId,transaction=false,locked=false,schemaLocked=false;
 try{
  client=await db.connect();locked=(await client.query('SELECT pg_try_advisory_lock(719381009) AS locked')).rows[0].locked;
  if(!locked)throw failure('BACKUP_ALREADY_RUNNING');
  schemaLocked=(await client.query('SELECT pg_try_advisory_lock_shared(719381000) AS locked')).rows[0].locked;
  if(!schemaLocked)throw failure('BACKUP_SCHEMA_CHANGE_RUNNING');
  const dumpPath=process.env.PG_DUMP_PATH||'pg_dump';
  const version=await runProgram(dumpPath,['--version'],programEnvironment(source));
  const match=/\b(\d+)(?:\.\d+)?\b/.exec(version);if(!match||Number(match[1])!==18)throw failure('BACKUP_CLIENT_18_REQUIRED');
  backupId=randomUUID();await client.query("INSERT INTO backup_runs(id,state) VALUES($1,'started')",[backupId]);
  temp=await privateTemporary();const plain=join(temp,'source.dump'),manifestPlain=join(temp,'manifest.json');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
  const snapshot=(await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
  const counts=await rowCounts(client),serverVersion=(await client.query('SHOW server_version')).rows[0].server_version;
  await runProgram(dumpPath,['--format=custom','--compress=6','--no-owner','--no-acl','--snapshot='+snapshot,'--file='+plain],programEnvironment(source));
  await client.query('COMMIT');transaction=false;
  const plaintext=await hashBackupFile(plain),stamp=new Date().toISOString().replace(/[:.]/g,'-'),name=`petcore-${stamp}-${backupId}`;
  const encrypted=join(temp,name+'.dump.enc'),manifestEncrypted=join(temp,name+'.manifest.enc');
  const ciphertext=await encryptBackupFile(plain,encrypted,key);
  const manifest={format:'petcore.backup.v1',backupId,createdAt:new Date().toISOString(),sourceFingerprint:fingerprint(source),serverVersion,clientVersion:version,
   encryption:'aes-256-gcm',keyId:process.env.BACKUP_KEY_ID||'primary',dumpFile:name+'.dump.enc',dumpSha256:ciphertext.sha256,dumpBytes:ciphertext.sizeBytes,
   plaintextSha256:plaintext.sha256,plaintextBytes:plaintext.sizeBytes,tables:counts,scope:'database-only',objectsIncluded:false};
  await writeFile(manifestPlain,JSON.stringify(manifest),{mode:0o600,flag:'wx'});const manifestCipher=await encryptBackupFile(manifestPlain,manifestEncrypted,key);
  let objectKey;
  if(local){
   const output=resolve(args[outputAt+1]);await mkdir(output,{recursive:true,mode:0o700});
   await copyFile(encrypted,join(output,basename(encrypted)),constants.COPYFILE_EXCL);await copyFile(manifestEncrypted,join(output,basename(manifestEncrypted)),constants.COPYFILE_EXCL);objectKey='local:'+basename(encrypted);
   console.log(JSON.stringify({event:'backup_local_files',backupId,dumpFile:join(output,basename(encrypted)),manifestFile:join(output,basename(manifestEncrypted))}));
  }else{
   const prefix=(process.env.BACKUP_STORAGE_PREFIX||'petcore').replace(/^\/+|\/+$/g,'');
   if(!/^[a-zA-Z0-9/_-]{1,200}$/.test(prefix)||prefix.split('/').includes('..'))throw failure('BACKUP_STORAGE_PREFIX_INVALID');
   objectKey=`${prefix}/${name}.dump.enc`;
   for(const [file,path,metadata] of [[encrypted,objectKey,ciphertext],[manifestEncrypted,`${prefix}/${name}.manifest.enc`,manifestCipher]]){
    await storage.client.send(new PutObjectCommand({Bucket:storage.bucket,Key:path,Body:createReadStream(file),ContentLength:metadata.sizeBytes,ContentType:'application/octet-stream',Metadata:{sha256:metadata.sha256,backup_id:backupId}}),{abortSignal:AbortSignal.timeout(15*60*1000)});
   }
  }
  await client.query("UPDATE backup_runs SET state='uploaded',finished_at=now(),object_key=$2,sha256=$3,size_bytes=$4,error_code=NULL WHERE id=$1",[backupId,objectKey,ciphertext.sha256,ciphertext.sizeBytes]);
  console.log(JSON.stringify({ok:true,event:'backup_created',backupId,mode:local?'local-test':'private-storage',sha256:ciphertext.sha256,sizeBytes:ciphertext.sizeBytes,restorationVerified:false}));
  return manifest;
 }catch(error){
  if(transaction)await client?.query('ROLLBACK').catch(()=>{});
  if(backupId)await client?.query("UPDATE backup_runs SET state='failed',finished_at=now(),error_code=$2 WHERE id=$1",[backupId,safeCode(error)]).catch(()=>{});
  throw error;
 }finally{
  if(schemaLocked)await client?.query('SELECT pg_advisory_unlock_shared(719381000)').catch(()=>{});
  if(locked)await client?.query('SELECT pg_advisory_unlock(719381009)').catch(()=>{});
  client?.release();await db.end();if(temp)await removeTemporary(temp);
 }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 runBackup().catch(error=>{console.error(JSON.stringify({ok:false,code:safeCode(error)}));process.exitCode=1;});
}
