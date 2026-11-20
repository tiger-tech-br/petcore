// Authenticates the encrypted local archive without exposing its encryption key.
import {readFile} from 'node:fs/promises';
import {inspectStorageArchive} from './inspect-storage-archive.mjs';
import {parseBackupKey} from '../api/dist/backupCrypto.js';
try{
 if(process.argv.length!==5)throw Error('INSPECT_HOSTINGER_ARGUMENTS_REQUIRED');
 const saved=JSON.parse(await readFile(new URL('../deploy/private/source-restore-20261120.json',import.meta.url),'utf8'));
 const key=parseBackupKey(saved.BACKUP_ENCRYPTION_KEY);
 try{console.log(JSON.stringify(await inspectStorageArchive({archive:process.argv[2],backupId:process.argv[3],output:process.argv[4],key})));}finally{key.fill(0);}
}catch(error){console.error(JSON.stringify({ok:false,code:/^[A-Z_]{2,80}$/.test(error.code||error.message||'')?error.code||error.message:'INSPECT_HOSTINGER_FAILED'}));process.exitCode=1;}
