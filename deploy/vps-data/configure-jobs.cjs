// Receives only the existing mail settings and backup key through private env.
const fs=require('node:fs'),crypto=require('node:crypto');
const {Pool}=require('/app/node_modules/pg');
async function main(){
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const runtime=JSON.parse(fs.readFileSync('/private/app/runtime.json','utf8'));
 if(!fs.existsSync('/private/PROMOTION-COMPLETE.json'))throw Error('JOBS_PROMOTION_REQUIRED');
 for(const name of ['EMAIL_API_KEY','EMAIL_FROM','RESEND_API_KEY','RESEND_FROM_EMAIL','BACKUP_ENCRYPTION_KEY','BACKUP_KEY_ID'])if(!process.env[name]||process.env[name].includes('\0'))throw Error('JOBS_CONFIGURATION_MISSING');
 const pool=new Pool({connectionString:runtime.DATABASE_URL,max:1,connectionTimeoutMillis:15000});pool.on('error',()=>{});
 let queuedSupport;
 try{queuedSupport=Number((await pool.query("SELECT count(*)::int AS n FROM support_email_notifications WHERE state IN ('queued','sending')")).rows[0].n);}finally{await pool.end();}
 Object.assign(runtime,{EMAIL_PROVIDER:'resend',EMAIL_API_KEY:process.env.EMAIL_API_KEY,EMAIL_FROM:process.env.EMAIL_FROM,SUPPORT_EMAILS_ENABLED:queuedSupport===0?'true':'false',SUPPORT_EMAILS_CONFIRM_SEND:queuedSupport===0?'YES':'NO'});
 fs.writeFileSync('/private/app/runtime.json',JSON.stringify(runtime),{mode:0o600});fs.chownSync('/private/app/runtime.json',1000,1000);
 const common={DATABASE_URL:runtime.DATABASE_URL,DATABASE_SSL:'true',SESSION_SECRET:crypto.randomBytes(48).toString('base64url')};
 const photo=Object.fromEntries(Object.entries(runtime).filter(([k])=>k.startsWith('OBJECT_STORAGE_')));
 const settings={
  maintenance:{...common,...photo},
  reminders:{...common,RESEND_API_KEY:process.env.RESEND_API_KEY,RESEND_FROM_EMAIL:process.env.RESEND_FROM_EMAIL,REMINDER_EMAILS_ENABLED:'true',REMINDER_EMAILS_CONFIRM_SEND:'YES'},
  backup:{...common,...photo,BACKUP_STORAGE_ENDPOINT:'https://petcore.tigertech.dev.br',BACKUP_STORAGE_REGION:'us-east-1',BACKUP_STORAGE_BUCKET:'petcore-backups',BACKUP_STORAGE_ACCESS_KEY:'petcore-backup',BACKUP_STORAGE_SECRET_KEY:state.STORAGE_BACKUP_SECRET_KEY,BACKUP_STORAGE_PREFIX:'petcore',BACKUP_ENCRYPTION_KEY:process.env.BACKUP_ENCRYPTION_KEY,BACKUP_KEY_ID:process.env.BACKUP_KEY_ID,BACKUP_RETENTION_ENABLED:'true',BACKUP_RETENTION_CONFIRM_DELETE:'YES',BACKUP_RETENTION_DAYS:'30'}
 };
 fs.mkdirSync('/private/jobs',{recursive:true,mode:0o700});fs.chownSync('/private/jobs',1000,1000);fs.chmodSync('/private/jobs',0o700);
 for(const [job,config]of Object.entries(settings)){const file='/private/jobs/'+job+'.json';fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});fs.chownSync(file,1000,1000);fs.chmodSync(file,0o600);}
 for(const job of Object.keys(settings)){const dir='/scheduler-state/'+job;fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chownSync(dir,1000,1000);fs.chmodSync(dir,0o700);}
 const record={ok:true,event:'petcore_private_jobs_configured',mailPreserved:true,queuedSupport,supportEnabled:queuedSupport===0,remindersRequireConsent:true,backupRetentionDays:30,secretsPrinted:false};
 fs.writeFileSync('/private/JOBS-CONFIGURED.json',JSON.stringify(record),{mode:0o600});console.log(JSON.stringify(record));
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^JOBS_[A-Z_]+$/.test(error.message||'')?error.message:'JOBS_CONFIGURATION_FAILED',systemCode:/^E[A-Z]{2,30}$/.test(error.code||'')?error.code:null}));process.exitCode=1;});
