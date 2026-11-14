import {runBackup,safeCode} from './backup.mjs';
import {pruneBackups} from './prune-backups.mjs';
try{
 if(process.argv.slice(2).length)throw Object.assign(new Error(),{code:'BACKUP_CYCLE_ARGUMENT_INVALID'});
 await runBackup();
 const enabled=process.env.BACKUP_RETENTION_ENABLED==='true'&&process.env.BACKUP_RETENTION_CONFIRM_DELETE==='YES';
 await pruneBackups(enabled?['--apply','--confirm-delete','YES']:[]);
}catch(error){console.error(JSON.stringify({ok:false,code:safeCode(error,'BACKUP_CYCLE_FAILED')}));process.exitCode=1;}
