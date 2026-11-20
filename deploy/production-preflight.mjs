// Local configuration review only: no network, SQL, process execution or writes.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PRIVATE=resolve(ROOT,'deploy/private');
const ORIGIN='https://petcore.tigertech.dev.br';
const PREVIEW_HOST='ep-damp-tree-b6h5kkhc.c-2.sa-east-1.aws.neon.tech';
const FILES=['app','migration','maintenance','reminders','backup'];
const fail=code=>{throw Object.assign(new Error(),{code});};
function inside(base,path){const rel=relative(base,path);return rel===''||(!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));}
function privateDirectory(value){const path=resolve(ROOT,value);if(!inside(PRIVATE,path))fail('PREFLIGHT_PRIVATE_DIRECTORY_REQUIRED');return path;}
function rawEnv(text){
 if(text.includes('\0'))fail('PREFLIGHT_RAW_ENV_INVALID');
 const env={};
 for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
  if(!line.trim()||line.trimStart().startsWith('#'))continue;
  const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
  if(!match||Object.hasOwn(env,match[1]))fail('PREFLIGHT_RAW_ENV_INVALID');
  env[match[1]]=match[2]; // format: raw; no shell expansion or quote removal.
 }
 return env;
}
function database(env){
 try{
  const url=new URL(env.DATABASE_URL||env.DATABASE_DIRECT_URL||'');
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password||url.pathname.length<2||url.hash)return null;
  const host=url.hostname.endsWith('.neon.tech')?url.hostname.replace(/-pooler(?=\.)/,''):url.hostname;
  return {url,host,target:[host,url.port||'5432',decodeURIComponent(url.pathname)].join('\n'),user:decodeURIComponent(url.username)};
 }catch{return null;}
}
function storage(env,prefix){
 try{
  const url=new URL(env[prefix+'_ENDPOINT']||'');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!env[prefix+'_BUCKET']||!env[prefix+'_ACCESS_KEY']||!env[prefix+'_SECRET_KEY'])return null;
  return url.href.replace(/\/+$/,'')+'\n'+env[prefix+'_BUCKET'];
 }catch{return null;}
}
const pair=(env,prefix)=>env[prefix+'_ENABLED']==='false'&&env[prefix+'_CONFIRM_SEND']==='NO'||env[prefix+'_ENABLED']==='true'&&env[prefix+'_CONFIRM_SEND']==='YES';
const disabled=(env,prefix)=>env[prefix+'_ENABLED']==='false'&&env[prefix+'_CONFIRM_SEND']==='NO';
const from=value=>typeof value==='string'&&value.includes('@')&&value.length<=200&&!/[\r\n]/.test(value);
function inspect(mode,configs,expectedHost,jobsOwner){
 const checks=[];const check=(name,ok)=>checks.push({name,ok:ok===true});
 const app=configs.app||{},appDb=database(app);
 check('app_origin',app.APP_ORIGIN===ORIGIN);
 check('app_session_secret',typeof app.SESSION_SECRET==='string'&&app.SESSION_SECRET.length>=40);
 check('app_database_tls',Boolean(appDb)&&app.DATABASE_SSL==='true'&&appDb.url.searchParams.get('sslmode')==='verify-full'&&!appDb.url.searchParams.has('uselibpqcompat'));
 check('runtime_not_named_as_known_owner',Boolean(appDb)&&!/(?:^postgres$|_owner$|^neon_superuser$)/i.test(appDb.user));
 if(app.DATABASE_DIRECT_URL){const direct=database({DATABASE_DIRECT_URL:app.DATABASE_DIRECT_URL});check('app_direct_connection_same_role_and_target',Boolean(appDb&&direct)&&appDb.target===direct.target&&appDb.user===direct.user&&!/-pooler\./.test(direct.url.hostname)&&direct.url.port!=='6432'&&direct.url.searchParams.get('sslmode')==='verify-full'&&!direct.url.searchParams.has('uselibpqcompat'));}
 if(mode==='preview'){
  check('preview_database',appDb?.host===PREVIEW_HOST&&appDb.url.pathname==='/neondb');
  check('preview_mail_disabled',app.EMAIL_PROVIDER==='none'&&disabled(app,'SUPPORT_EMAILS')&&disabled(app,'REMINDER_EMAILS'));
  check('preview_provider_credentials_absent',['EMAIL_API_KEY','RESEND_API_KEY','OBJECT_STORAGE_ENDPOINT','OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_ACCESS_KEY','OBJECT_STORAGE_SECRET_KEY','BACKUP_STORAGE_ACCESS_KEY','BACKUP_STORAGE_SECRET_KEY'].every(key=>!app[key]));
 }else{
  check('explicit_database_target',Boolean(appDb)&&appDb.host===expectedHost);
  check('single_jobs_owner_declared',['none','railway','hostinger'].includes(jobsOwner));
  check('password_recovery_configured',app.EMAIL_PROVIDER==='resend'&&Boolean(app.EMAIL_API_KEY)&&from(app.EMAIL_FROM));
  check('support_send_confirmation_pair',pair(app,'SUPPORT_EMAILS'));
  check('seed_credentials_absent',FILES.every(name=>!configs[name]?.SEED_ADMIN_PASSWORD&&!configs[name]?.SEED_DEMO_OWNER_PASSWORD));
  for(const name of FILES.slice(1)){
   const env=configs[name]||{},db=database(env);
   check(name+'_same_database',Boolean(appDb&&db)&&appDb.target===db.target);
   check(name+'_verified_tls',Boolean(db)&&env.DATABASE_SSL==='true'&&db.url.searchParams.get('sslmode')==='verify-full'&&!db.url.searchParams.has('uselibpqcompat'));
   if(['migration','backup'].includes(name))check(name+'_direct_database',Boolean(db)&&!/-pooler\./.test(db.url.hostname)&&db.url.port!=='6432');
   if(['maintenance','reminders'].includes(name))check(name+'_session_configured',typeof env.SESSION_SECRET==='string'&&env.SESSION_SECRET.length>=40);
   if(env.DATABASE_DIRECT_URL){const direct=database({DATABASE_DIRECT_URL:env.DATABASE_DIRECT_URL});check(name+'_direct_reference_matches',Boolean(db&&direct)&&db.target===direct.target&&db.user===direct.user&&!/-pooler\./.test(direct.url.hostname)&&direct.url.port!=='6432'&&direct.url.searchParams.get('sslmode')==='verify-full'&&!direct.url.searchParams.has('uselibpqcompat'));}
  }
  const photos=storage(app,'OBJECT_STORAGE'),backup=configs.backup||{},backups=storage(backup,'BACKUP_STORAGE'),reminders=configs.reminders||{};
  check('private_photo_destination_configured',Boolean(photos));
  check('maintenance_photo_destination_matches',Boolean(photos)&&storage(configs.maintenance||{},'OBJECT_STORAGE')===photos);
  check('backup_photo_destination_matches',Boolean(photos)&&storage(backup,'OBJECT_STORAGE')===photos);
  check('backup_destination_separate',Boolean(backups)&&backups!==photos);
  check('backup_encryption_key_format',/^[a-fA-F0-9]{64}$/.test(backup.BACKUP_ENCRYPTION_KEY||''));
  check('backup_retention_confirmation_pair',backup.BACKUP_RETENTION_ENABLED==='false'&&backup.BACKUP_RETENTION_CONFIRM_DELETE==='NO'||backup.BACKUP_RETENTION_ENABLED==='true'&&backup.BACKUP_RETENTION_CONFIRM_DELETE==='YES');
  check('reminder_send_confirmation_pair',pair(reminders,'REMINDER_EMAILS'));
  check('reminder_provider_when_enabled',reminders.REMINDER_EMAILS_ENABLED!=='true'||Boolean(reminders.RESEND_API_KEY)&&from(reminders.RESEND_FROM_EMAIL));
  check('reminder_activation_has_hostinger_owner',jobsOwner==='hostinger'||disabled(reminders,'REMINDER_EMAILS'));
  check('retention_activation_has_hostinger_owner',jobsOwner==='hostinger'||backup.BACKUP_RETENTION_ENABLED==='false'&&backup.BACKUP_RETENTION_CONFIRM_DELETE==='NO');
 }
 return {mode,configurationPassed:checks.every(item=>item.ok),checks,knownPreviewDatabase:appDb?.host===PREVIEW_HOST,networkVerified:false,activated:false,
  externalChecksRequired:mode==='production'?['target_and_test_data_review','actual_runtime_permissions','single_active_writer_and_scheduler','storage_access_and_restore','email_delivery_and_reset_link','recoverable_keys_outside_server','contracts_and_legal_publication']:[]};
}
async function selfTest(){
 const host='ep-future-approved.c-2.sa-east-1.aws.neon.tech';
 const db=(user='runtime',hostname=host)=>'postgresql://'+user+':fictional-password@'+hostname+'/neondb?sslmode=verify-full';
 const photo={OBJECT_STORAGE_ENDPOINT:'https://photos.example.test',OBJECT_STORAGE_BUCKET:'photos',OBJECT_STORAGE_ACCESS_KEY:'fictional-access',OBJECT_STORAGE_SECRET_KEY:'fictional-secret'};
 const cfg={app:{APP_ORIGIN:ORIGIN,SESSION_SECRET:'s'.repeat(48),DATABASE_URL:db(),DATABASE_SSL:'true',EMAIL_PROVIDER:'resend',EMAIL_API_KEY:'fictional-mail',EMAIL_FROM:'PetCore <petcore@example.test>',SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO',...photo},migration:{DATABASE_DIRECT_URL:db('migration'),DATABASE_SSL:'true'},maintenance:{DATABASE_URL:db(),DATABASE_SSL:'true',SESSION_SECRET:'s'.repeat(48),...photo},reminders:{DATABASE_URL:db(),DATABASE_SSL:'true',SESSION_SECRET:'s'.repeat(48),REMINDER_EMAILS_ENABLED:'false',REMINDER_EMAILS_CONFIRM_SEND:'NO'},backup:{DATABASE_URL:db(),DATABASE_SSL:'true',...photo,BACKUP_STORAGE_ENDPOINT:'https://backups.example.test',BACKUP_STORAGE_BUCKET:'copies',BACKUP_STORAGE_ACCESS_KEY:'fictional-access',BACKUP_STORAGE_SECRET_KEY:'fictional-secret',BACKUP_ENCRYPTION_KEY:'a'.repeat(64),BACKUP_RETENTION_ENABLED:'false',BACKUP_RETENTION_CONFIRM_DELETE:'NO'}};
 assert.equal(inspect('production',cfg,host,'none').configurationPassed,true);
 const altered=(file,changes)=>({...cfg,[file]:{...cfg[file],...changes}});
 assert.equal(inspect('production',altered('backup',{DATABASE_URL:db('runtime','ep-other.neon.tech')}),host,'none').configurationPassed,false);
 assert.equal(inspect('production',altered('app',{DATABASE_URL:db().replace('verify-full','disable')}),host,'none').configurationPassed,false);
 assert.equal(inspect('production',altered('backup',{BACKUP_STORAGE_ENDPOINT:'https://photos.example.test/',BACKUP_STORAGE_BUCKET:'photos'}),host,'none').configurationPassed,false);
 assert.equal(inspect('production',altered('reminders',{REMINDER_EMAILS_ENABLED:'true',REMINDER_EMAILS_CONFIRM_SEND:'YES',RESEND_API_KEY:'fictional',RESEND_FROM_EMAIL:'petcore@example.test'}),host,'railway').configurationPassed,false);
 assert.equal(inspect('production',altered('maintenance',{DATABASE_DIRECT_URL:db('different')}),host,'none').configurationPassed,false);
 assert.equal(inspect('production',altered('migration',{DATABASE_URL:db('migration'),DATABASE_DIRECT_URL:db('migration').replace('verify-full','disable')}),host,'none').configurationPassed,false);
 assert.throws(()=>rawEnv('TOKEN=one\nTOKEN=two'));
 assert.throws(()=>rawEnv('export TOKEN=one'));
 assert.throws(()=>rawEnv('TOKEN=one\0two'));
 assert.equal(rawEnv('TOKEN="${DO_NOT_EXPAND}"').TOKEN,'"${DO_NOT_EXPAND}"');
 assert.throws(()=>privateDirectory('../outside'));
 assert.equal(JSON.stringify(inspect('production',cfg,host,'none')).includes('fictional-secret'),false);
 console.log(JSON.stringify({ok:true,event:'production_preflight_guards_verified',networkUsed:false,credentialsUsed:false}));
}
try{
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--self-test')await selfTest();
 else{
  const options={};while(args.length){const key=args.shift();if(!['--mode','--directory','--expected-db-host','--jobs-owner'].includes(key)||Object.hasOwn(options,key)||!args.length)fail('PREFLIGHT_ARGUMENT_INVALID');options[key]=args.shift();}
  if(!['preview','production'].includes(options['--mode'])||!options['--directory'])fail('PREFLIGHT_MODE_AND_DIRECTORY_REQUIRED');
  const mode=options['--mode'],expected=options['--expected-db-host']?.replace(/-pooler(?=\.)/,'').toLowerCase();
  if(mode==='production'&&(!expected||!/^[a-z0-9.-]+$/.test(expected)||!['none','railway','hostinger'].includes(options['--jobs-owner'])))fail('PREFLIGHT_EXPLICIT_TARGET_AND_JOBS_OWNER_REQUIRED');
  const directory=privateDirectory(options['--directory']),actualPrivate=await realpath(PRIVATE),actualDirectory=await realpath(directory);
  if(!inside(actualPrivate,actualDirectory)||(await lstat(directory)).isSymbolicLink())fail('PREFLIGHT_DIRECTORY_LINK_REFUSED');
  const configs={};
  for(const name of mode==='preview'?['app']:FILES){
   const path=resolve(directory,name+'.env'),info=await lstat(path);
   if(!info.isFile()||info.isSymbolicLink()||info.size>65536||dirname(await realpath(path))!==actualDirectory)fail('PREFLIGHT_FILE_INVALID');
   if(process.platform!=='win32'&&(info.mode&0o077)!==0)fail('PREFLIGHT_PRIVATE_MODE_REQUIRED');
   configs[name]=rawEnv(await readFile(path,'utf8'));
  }
  const result=inspect(mode,configs,expected,options['--jobs-owner']);
  console.log(JSON.stringify(result));if(!result.configurationPassed)process.exitCode=1;
 }
}catch(error){console.error(JSON.stringify({configurationPassed:false,code:/^PREFLIGHT_[A-Z_]+$/.test(error?.code||'')?error.code:'PREFLIGHT_INPUT_UNAVAILABLE',networkVerified:false,activated:false}));process.exitCode=1;}
