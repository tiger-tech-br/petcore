import {readFile,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Pool} from 'pg';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import {decryptBackupFile,parseBackupKey} from '../dist/backupCrypto.js';
import {backupStorage,databaseAddress,databaseOptions,failure,fingerprint,privateTemporary,programEnvironment,removeTemporary,runProgram,safeCode} from './backup.mjs';

function argumentsFor(args){
 const result={record:false};
 for(let index=0;index<args.length;index++){
  const arg=args[index];
  if(arg==='--record'){result.record=true;continue;}
  if(['--file','--manifest','--object-key'].includes(arg)&&args[index+1]&&!args[index+1].startsWith('--')){result[arg.slice(2)]=args[++index];continue;}
  throw failure('RESTORE_ARGUMENT_INVALID');
 }
 if(Boolean(result.file)===Boolean(result['object-key']))throw failure('RESTORE_BACKUP_SOURCE_REQUIRED');
 if(result.manifest&&!result.file)throw failure('RESTORE_MANIFEST_ARGUMENT_INVALID');
 return result;
}
function manifestIsValid(value){
 return value?.format==='petcore.backup.v1'&&/^[a-fA-F0-9-]{36}$/.test(value.backupId??'')&&/^[a-fA-F0-9]{64}$/.test(value.sourceFingerprint??'')
  &&/^[a-fA-F0-9]{64}$/.test(value.dumpSha256??'')&&/^[a-fA-F0-9]{64}$/.test(value.plaintextSha256??'')
  &&Array.isArray(value.tables)&&value.tables.length<=10000&&value.tables.every(item=>typeof item.schema==='string'&&item.schema.length<=63&&typeof item.table==='string'&&item.table.length<=63&&/^\d+$/.test(item.rows));
}
async function inventory(db){
 const names=await db.query(`SELECT n.nspname AS schema,c.relname AS table FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%'
   AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e') ORDER BY n.nspname,c.relname`);
 const quote=value=>'"'+value.replaceAll('"','""')+'"',result=[];
 for(const item of names.rows){const row=await db.query(`SELECT count(*)::text AS rows FROM ${quote(item.schema)}.${quote(item.table)}`);result.push({...item,rows:row.rows[0].rows});}
 return result;
}

export async function checkRestore(args=process.argv.slice(2)){
 if(args.includes('--help')){console.log('node api/scripts/restore-check.mjs (--file <dump.enc> [--manifest <manifest.enc>] | --object-key <chave.dump.enc>) [--record]');return;}
 const options=argumentsFor(args);
 if(!process.env.RESTORE_DATABASE_URL)throw failure('RESTORE_DATABASE_MISSING');
 const target=databaseAddress(process.env.RESTORE_DATABASE_URL),databaseName=decodeURIComponent(target.pathname.slice(1));
 if(!databaseName.endsWith('_restore_test'))throw failure('RESTORE_ISOLATED_DATABASE_REQUIRED');
 const key=parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY),temporary=await privateTemporary();
 let targetPool,sourcePool,targetClient;
 try{
  let encryptedFile,manifestFile;
  if(options.file){encryptedFile=resolve(options.file);manifestFile=resolve(options.manifest||options.file.replace(/\.dump\.enc$/,'.manifest.enc'));if(encryptedFile===manifestFile)throw failure('RESTORE_MANIFEST_REQUIRED');}
  else{
   const prefix=(process.env.BACKUP_STORAGE_PREFIX||'petcore').replace(/^\/+|\/+$/g,''),objectKey=options['object-key'];
   if(!/^[a-zA-Z0-9/_-]{1,200}$/.test(prefix)||!objectKey.startsWith(prefix+'/')||objectKey.split('/').includes('..')||!objectKey.endsWith('.dump.enc'))throw failure('RESTORE_OBJECT_KEY_INVALID');
   const storage=backupStorage();encryptedFile=join(temporary,'download.dump.enc');manifestFile=join(temporary,'download.manifest.enc');
   for(const [object,path] of [[objectKey,encryptedFile],[objectKey.replace(/\.dump\.enc$/,'.manifest.enc'),manifestFile]]){
    const response=await storage.client.send(new GetObjectCommand({Bucket:storage.bucket,Key:object}),{abortSignal:AbortSignal.timeout(15*60*1000)});
    if(!response.Body)throw failure('RESTORE_DOWNLOAD_EMPTY');await pipeline(response.Body,createWriteStream(path,{flags:'wx',mode:0o600}));
   }
  }
  if((await stat(manifestFile)).size>5*1024*1024)throw failure('RESTORE_MANIFEST_TOO_LARGE');
  const plainManifest=join(temporary,'manifest.json');await decryptBackupFile(manifestFile,plainManifest,key);
  let manifest;try{manifest=JSON.parse(await readFile(plainManifest,'utf8'));}catch{throw failure('RESTORE_MANIFEST_INVALID');}
  if(!manifestIsValid(manifest))throw failure('RESTORE_MANIFEST_INVALID');
  if(fingerprint(target)===manifest.sourceFingerprint)throw failure('RESTORE_SOURCE_EQUALS_TARGET');
  const plaintext=join(temporary,'restore.dump'),verified=await decryptBackupFile(encryptedFile,plaintext,key,manifest.dumpSha256);
  if(verified.sha256!==manifest.plaintextSha256||verified.sizeBytes!==manifest.plaintextBytes)throw failure('RESTORE_PLAINTEXT_CHECKSUM_MISMATCH');
  const restorePath=process.env.PG_RESTORE_PATH||'pg_restore',version=await runProgram(restorePath,['--version'],programEnvironment(target));
  const major=/\b(\d+)(?:\.\d+)?\b/.exec(version);if(!major||Number(major[1])!==18)throw failure('RESTORE_CLIENT_18_REQUIRED');
  targetPool=new Pool(databaseOptions(target));targetClient=await targetPool.connect();
  const lock=(await targetClient.query('SELECT pg_try_advisory_lock(719381010) AS locked')).rows[0].locked;if(!lock)throw failure('RESTORE_ALREADY_RUNNING');
  const objects=await targetClient.query(`SELECT
   (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r','p','S','v','m','f'))+
   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%') AS objects`);
  if(Number(objects.rows[0].objects)!==0)throw failure('RESTORE_TARGET_NOT_EMPTY');
  const targetVersion=(await targetClient.query('SHOW server_version_num')).rows[0].server_version_num;
  const sourceMajor=Number(/^\d+/.exec(manifest.serverVersion??'')?.[0]??0);
  if(sourceMajor&&Math.floor(Number(targetVersion)/10000)<sourceMajor)throw failure('RESTORE_SERVER_TOO_OLD');
  // Sem DROP, --clean ou sobrescrita: só um banco separado, vazio e previamente nomeado.
  await runProgram(restorePath,['--exit-on-error','--single-transaction','--no-owner','--no-acl','--dbname='+databaseName,plaintext],programEnvironment(target));
  const actual=await inventory(targetClient),expected=[...manifest.tables].sort((a,b)=>a.schema.localeCompare(b.schema)||a.table.localeCompare(b.table));
  const actualSorted=[...actual].sort((a,b)=>a.schema.localeCompare(b.schema)||a.table.localeCompare(b.table));
  if(JSON.stringify(actualSorted)!==JSON.stringify(expected))throw failure('RESTORE_ROW_COUNTS_MISMATCH');
  let recorded=false;
  if(options.record){
   const source=databaseAddress(process.env.DATABASE_DIRECT_URL||process.env.DATABASE_URL);
   if(fingerprint(source)!==manifest.sourceFingerprint)throw failure('RESTORE_RECORD_SOURCE_MISMATCH');
   sourcePool=new Pool(databaseOptions(source));
   const result=await sourcePool.query("UPDATE backup_runs SET state='verified',verified_at=now(),error_code=NULL WHERE id=$1 AND sha256=$2 AND state IN ('uploaded','verified') RETURNING id",[manifest.backupId,manifest.dumpSha256]);
   if(!result.rowCount)throw failure('RESTORE_BACKUP_RECORD_MISSING');recorded=true;
  }
  const result={ok:true,event:'restore_verified',backupId:manifest.backupId,tablesVerified:actual.length,recorded,objectsIncluded:false,applicationReady:false};console.log(JSON.stringify(result));return result;
 }finally{
  if(targetClient){await targetClient.query('SELECT pg_advisory_unlock(719381010)').catch(()=>{});targetClient.release();}
  await targetPool?.end();await sourcePool?.end();await removeTemporary(temporary);
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){checkRestore().catch(error=>{console.error(JSON.stringify({ok:false,code:safeCode(error,'RESTORE_FAILED')}));process.exitCode=1;});}
