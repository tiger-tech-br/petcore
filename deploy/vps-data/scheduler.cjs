// One container per job. Mount its private JSON config read-only and a private
// writable /state volume owned by the same unprivileged UID as this process.
// No shell, arbitrary command, immediate run, catch-up loop, or provider calls.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const JOBS=Object.freeze({
 maintenance:{args:['/app/api/dist/maintenance.js','--once'],period:15*60*1000,timeout:10*60*1000},
 reminders:{args:['/app/api/dist/reminderDispatcher.js','--run-once'],period:5*60*1000,timeout:10*60*1000},
 backup:{args:['/app/api/scripts/backup-cycle.mjs'],timeout:90*60*1000},
});
const COMMON=['DATABASE_URL','DATABASE_DIRECT_URL','DATABASE_SSL','SESSION_SECRET'];
const PHOTOS=['OBJECT_STORAGE_ENDPOINT','OBJECT_STORAGE_REGION','OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_ACCESS_KEY','OBJECT_STORAGE_SECRET_KEY'];
const ALLOWED={
 maintenance:new Set([...COMMON,...PHOTOS]),
 reminders:new Set([...COMMON,'RESEND_API_KEY','RESEND_FROM_EMAIL','REMINDER_EMAILS_ENABLED','REMINDER_EMAILS_CONFIRM_SEND']),
 backup:new Set([...COMMON,...PHOTOS,'BACKUP_STORAGE_ENDPOINT','BACKUP_STORAGE_REGION','BACKUP_STORAGE_BUCKET','BACKUP_STORAGE_ACCESS_KEY','BACKUP_STORAGE_SECRET_KEY','BACKUP_STORAGE_PREFIX','BACKUP_ENCRYPTION_KEY','BACKUP_KEY_ID','BACKUP_RETENTION_ENABLED','BACKUP_RETENTION_CONFIRM_DELETE','BACKUP_RETENTION_DAYS']),
};
const localClock=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function fail(code){throw Object.assign(new Error(code),{code});}
function log(event,fields={}){console.log(JSON.stringify({event,...fields,at:new Date().toISOString()}));}
function localParts(timestamp){return Object.fromEntries(localClock.formatToParts(new Date(timestamp)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));}
function atLocalThree(year,month,day){
 const wall=Date.UTC(year,month-1,day,3);let guess=wall;
 for(let i=0;i<4;i++){
  const p=localParts(guess),seen=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),adjustment=wall-seen;
  guess+=adjustment;if(!adjustment)break;
 }
 const p=localParts(guess);
 if(p.year!==year||p.month!==month||p.day!==day||p.hour!==3||p.minute!==0)fail('SCHEDULER_TIMEZONE_INVALID');
 return guess;
}
function nextSchedule(job,now,previousKey=null,startup=false){
 if(!Object.hasOwn(JOBS,job)||!Number.isFinite(now))fail('SCHEDULER_JOB_INVALID');
 const minimum=now+(startup?30000:1),period=JOBS[job].period;
 if(period){
  if(previousKey!==null&&(!/^\d{1,16}$/.test(previousKey)||!Number.isSafeInteger(Number(previousKey))))fail('SCHEDULER_STATE_INVALID');
  let at=(Math.floor(minimum/period)+1)*period;
  if(previousKey!==null&&at<=Number(previousKey))at=Number(previousKey)+period;
  return {at,key:String(at)};
 }
 if(previousKey!==null&&!/^\d{4}-\d{2}-\d{2}$/.test(previousKey))fail('SCHEDULER_STATE_INVALID');
 const p=localParts(now),base=Date.UTC(p.year,p.month-1,p.day);
 for(let day=0;day<370;day++){
  const date=new Date(base+day*86400000),y=date.getUTCFullYear(),m=date.getUTCMonth()+1,d=date.getUTCDate();
  const key=[y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-'),at=atLocalThree(y,m,d);
  if(at>=minimum&&(previousKey===null||key>previousKey))return {at,key};
 }
 fail('SCHEDULER_DATE_INVALID');
}
function privateFile(file,maximum){
 const info=fs.lstatSync(file);
 if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077)||info.size>maximum||typeof process.getuid==='function'&&info.uid!==process.getuid())fail('SCHEDULER_PRIVATE_FILE_INVALID');
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function childEnvironment(job){
 const config=privateFile(`/private/jobs/${job}.json`,65536);
 if(!config||typeof config!=='object'||Array.isArray(config))fail('SCHEDULER_CONFIG_INVALID');
 const env={NODE_ENV:'production',NODE_EXTRA_CA_CERTS:'/run/petcore-ca/ca.crt',TZ:'America/Sao_Paulo'};
 for(const name of ['PATH','LANG','LC_ALL'])if(process.env[name])env[name]=process.env[name];
 for(const [name,value]of Object.entries(config)){
  if(!ALLOWED[job].has(name)||typeof value!=='string'||value.includes('\0'))fail('SCHEDULER_CONFIG_INVALID');
  env[name]=value;
 }
 if(!env.DATABASE_URL||env.DATABASE_SSL!=='true'||(job!=='backup'&&(!env.SESSION_SECRET||env.SESSION_SECRET.length<40)))fail('SCHEDULER_CONFIG_INVALID');
 if(job==='reminders'&&(env.REMINDER_EMAILS_ENABLED!=='true'||env.REMINDER_EMAILS_CONFIRM_SEND!=='YES'||!env.RESEND_API_KEY||!env.RESEND_FROM_EMAIL))fail('SCHEDULER_REMINDERS_DISABLED');
 return env;
}
function readState(job){
 const folder=fs.lstatSync('/state');
 if(!folder.isDirectory()||folder.isSymbolicLink()||(folder.mode&0o077)||typeof process.getuid==='function'&&folder.uid!==process.getuid())fail('SCHEDULER_STATE_DIRECTORY_INVALID');
 const file=`/state/${job}.json`;
 if(!fs.existsSync(file))return null;
 const old=privateFile(file,4096);
 if(old.format!=='petcore.scheduler.v1'||old.job!==job||typeof old.key!=='string'||old.key.length>32)fail('SCHEDULER_STATE_INVALID');
 return old.key;
}
function reserve(job,slot){
 const target=`/state/${job}.json`,temporary=target+'.new';
 // A crash before rename leaves .new, which must be reviewed instead of
 // silently replaying an uncertain daily backup attempt.
 const descriptor=fs.openSync(temporary,'wx',0o600);
 try{fs.writeFileSync(descriptor,JSON.stringify({format:'petcore.scheduler.v1',job,key:slot.key,reservedAt:new Date().toISOString()}));fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}
 fs.renameSync(temporary,target);
 const directory=fs.openSync(path.dirname(target),'r');try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
}
async function main(){
 const job=process.env.PETCORE_JOB;
 if(process.argv.length!==2||!Object.hasOwn(JOBS,job||''))fail('SCHEDULER_JOB_INVALID');
 if(typeof process.getuid==='function'&&process.getuid()===0)fail('SCHEDULER_ROOT_REFUSED');
 childEnvironment(job);let previous=readState(job),stopping=false,wake=null,child=null,forceTimer=null;
 const terminate=signal=>{
  if(!child?.pid)return;
  try{process.kill(process.platform==='win32'?child.pid:-child.pid,signal);}catch(error){if(error.code!=='ESRCH')log('scheduler_signal_failed',{job});}
 };
 const requestStop=()=>{
  if(stopping)return;stopping=true;wake?.();
  if(child){terminate('SIGTERM');forceTimer=setTimeout(()=>terminate('SIGKILL'),30000);forceTimer.unref();}
 };
 process.once('SIGTERM',requestStop);process.once('SIGINT',requestStop);
 try{
  let slot=nextSchedule(job,Date.now(),previous,true);
  log('scheduler_started',{job,nextAt:new Date(slot.at).toISOString(),timezone:'America/Sao_Paulo'});
  while(!stopping){
   await new Promise(resolve=>{const timer=setTimeout(()=>{wake=null;resolve();},Math.min(Math.max(0,slot.at-Date.now()),60000));wake=()=>{clearTimeout(timer);wake=null;resolve();};});
   if(stopping)break;
   if(Date.now()<slot.at)continue;
   // A clock jump or long pause skips stale slots rather than bulk backfill.
   if(Date.now()-slot.at>60000){slot=nextSchedule(job,Date.now(),previous);continue;}
   const env=childEnvironment(job);reserve(job,slot);previous=slot.key;
   const started=Date.now();let timedOut=false,runTimer=null,killTimer=null;
   log('scheduler_job_started',{job});
   const result=await new Promise(resolve=>{
    child=spawn(process.execPath,JOBS[job].args,{cwd:'/app',env,stdio:'ignore',shell:false,detached:process.platform!=='win32',windowsHide:true});
    runTimer=setTimeout(()=>{timedOut=true;terminate('SIGTERM');killTimer=setTimeout(()=>terminate('SIGKILL'),30000);killTimer.unref();},JOBS[job].timeout);runTimer.unref();
    child.once('error',()=>resolve({ok:false,code:'SCHEDULER_SPAWN_FAILED'}));
    child.once('close',(code,signal)=>resolve({ok:code===0&&!timedOut,exitCode:Number.isInteger(code)?code:null,interrupted:Boolean(signal),timedOut}));
   });
   clearTimeout(runTimer);clearTimeout(killTimer);clearTimeout(forceTimer);forceTimer=null;child=null;
   log('scheduler_job_finished',{job,...result,durationMs:Date.now()-started});
   if(!stopping){slot=nextSchedule(job,Date.now(),previous);log('scheduler_waiting',{job,nextAt:new Date(slot.at).toISOString()});}
  }
 }finally{clearTimeout(forceTimer);process.removeListener('SIGTERM',requestStop);process.removeListener('SIGINT',requestStop);log('scheduler_stopped',{job});}
}
module.exports={nextSchedule,localParts,atLocalThree,main};
if(require.main===module)main().catch(error=>{log('scheduler_failed',{code:/^SCHEDULER_[A-Z_]+$/.test(error.code||'')?error.code:'SCHEDULER_FAILED'});process.exitCode=1;});
