import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';
import {parseBackupKey} from '../dist/backupCrypto.js';
import {BACKUP_RETENTION_LOCK,expireBackups} from '../dist/backupRetention.js';
import {storageFingerprint} from '../dist/photoBackup.js';
import {backupStorage,databaseAddress,databaseOptions,failure,fingerprint,privateTemporary,removeTemporary,safeCode} from './backup.mjs';

export async function pruneBackups(args=process.argv.slice(2)){
 if(args.includes('--help')){console.log('node api/scripts/prune-backups.mjs [--apply --confirm-delete YES]');return;}
 const apply=args.includes('--apply');
 if(args.length&&JSON.stringify(args)!==JSON.stringify(['--apply','--confirm-delete','YES']))throw failure('BACKUP_RETENTION_ARGUMENT_INVALID');
 if(process.env.BACKUP_RETENTION_DAYS&&process.env.BACKUP_RETENTION_DAYS!=='30')throw failure('BACKUP_RETENTION_POLICY_REVIEW_REQUIRED');
 const source=databaseAddress(process.env.DATABASE_DIRECT_URL||process.env.DATABASE_URL),db=new Pool(databaseOptions(source));
 const backup=backupStorage();backup.fingerprint=storageFingerprint(process.env.BACKUP_STORAGE_ENDPOINT,backup.bucket);
 const key=parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY),directory=await privateTemporary();let client,locked=false,schemaLocked=false,lost=false;
 const abort=new AbortController();db.on('error',()=>console.error(JSON.stringify({event:'backup_retention_idle_connection_lost'})));
 try{
  client=await db.connect();client.on('error',()=>{lost=true;abort.abort();});
  schemaLocked=(await client.query('SELECT pg_try_advisory_lock_shared(719381000) AS locked')).rows[0].locked;if(!schemaLocked)throw failure('BACKUP_SCHEMA_CHANGE_RUNNING');
  locked=(await client.query('SELECT pg_try_advisory_lock($1) AS locked',[BACKUP_RETENTION_LOCK])).rows[0].locked;if(!locked)throw failure('BACKUP_RETENTION_OR_RESTORE_RUNNING');
  const result=await expireBackups({db:client,backup,key,prefix:(process.env.BACKUP_STORAGE_PREFIX||'petcore').replace(/^\/+|\/+$/g,''),sourceFingerprint:fingerprint(source),directory,apply,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30*60*1000)])});
  console.log(JSON.stringify(result));if(!result.ok)throw failure('BACKUP_RETENTION_REQUIRES_ATTENTION');return result;
 }finally{
  if(locked&&!lost)await client?.query('SELECT pg_advisory_unlock($1)',[BACKUP_RETENTION_LOCK]).catch(()=>{});
  if(schemaLocked&&!lost)await client?.query('SELECT pg_advisory_unlock_shared(719381000)').catch(()=>{});
  client?.release(lost);await db.end();backup.client.destroy();await removeTemporary(directory);
 }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)pruneBackups().catch(error=>{console.error(JSON.stringify({ok:false,code:safeCode(error,'BACKUP_RETENTION_FAILED')}));process.exitCode=1;});
