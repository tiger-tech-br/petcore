import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pool,tx} from './core.js';
import {processObjectDeletionJobs} from './privacyService.js';

// Não elimina dados de clientes, auditoria, solicitações ou documentos financeiros.
// A retenção desses registros precisa de uma política aprovada e rotina específica.
export async function runMaintenanceOnce(options:{prune?:boolean;files?:boolean}={}){
 const counts:Record<string,number>={};
 if(options.prune!==false)await tx(async db=>{
  const sessionTable=(await db.query("SELECT to_regclass('public.session') AS name")).rows[0].name;
  if(sessionTable)counts.expiredSessions=(await db.query('DELETE FROM "session" WHERE expire<now()')).rowCount??0;
  counts.expiredRateLimits=(await db.query("DELETE FROM auth_rate_limits WHERE window_started<now()-interval '1 day'")).rowCount??0;
  counts.expiredResetTokens=(await db.query('DELETE FROM password_resets WHERE used_at IS NOT NULL OR expires_at<now()')).rowCount??0;
  counts.expiredInvitations=(await db.query("DELETE FROM invitations WHERE expires_at<now()-interval '1 day'")).rowCount??0;
 });
 let files:Record<string,unknown>={enabled:false};
 if(options.files!==false){
  const configured=Boolean(process.env.OBJECT_STORAGE_ENDPOINT&&process.env.OBJECT_STORAGE_BUCKET&&process.env.OBJECT_STORAGE_ACCESS_KEY&&process.env.OBJECT_STORAGE_SECRET_KEY);
  if(configured){try{files={enabled:true,...await processObjectDeletionJobs({limit:10})};}catch{files={enabled:true,errorCode:'OBJECT_CLEANUP_FAILED'};}}
  else files={enabled:false,reason:'OBJECT_STORAGE_NOT_CONFIGURED'};
 }
 return{ok:!files.errorCode,pruned:counts,files};
}

async function main(){
 const args=process.argv.slice(2);
 if(args.includes('--help')){console.log('node api/dist/maintenance.js [--once | --loop] [--prune-only | --files-only]');return;}
 if(args.some(arg=>!['--once','--loop','--prune-only','--files-only'].includes(arg))||(args.includes('--prune-only')&&args.includes('--files-only')))throw Error('MAINTENANCE_ARGUMENT_INVALID');
 const loop=args.includes('--loop'),interval=Number(process.env.MAINTENANCE_INTERVAL_SECONDS||'60');
 if(!Number.isInteger(interval)||interval<10||interval>86400)throw Error('MAINTENANCE_INTERVAL_INVALID');
 let stopping=false,wake:(()=>void)|undefined;
 const stop=()=>{stopping=true;wake?.();};process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{
  do{
   const result=await runMaintenanceOnce({prune:!args.includes('--files-only'),files:!args.includes('--prune-only')});console.log(JSON.stringify({event:'maintenance_cycle',...result}));
   if(!loop){if(!result.ok)process.exitCode=1;break;}
   if(!stopping)await new Promise<void>(resolvePromise=>{const timer=setTimeout(()=>{wake=undefined;resolvePromise();},interval*1000);wake=()=>{clearTimeout(timer);wake=undefined;resolvePromise();};});
  }while(!stopping);
 }finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){main().catch(()=>{console.error(JSON.stringify({ok:false,event:'maintenance_failed'}));process.exitCode=1;}).finally(()=>pool.end());}
