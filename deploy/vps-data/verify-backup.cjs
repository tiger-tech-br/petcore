// Creates one current encrypted copy and restores it into a new empty test DB.
const fs=require('node:fs'),cp=require('node:child_process');
const {Pool}=require('/app/node_modules/pg');
async function main(){
 const config=JSON.parse(fs.readFileSync('/private/jobs/backup.json','utf8'));
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 Object.assign(process.env,config);delete process.env.DATABASE_DIRECT_URL;
 if(fs.existsSync('/private/VPS-BACKUP-VERIFIED.json'))throw Error('BACKUP_PROOF_ALREADY_COMPLETE');
 try{
  // Run the unchanged rehearsal with bounded, non-sensitive SDK diagnostics.
  let rehearsal=fs.readFileSync('/app/api/scripts/photo-recovery-smoke.mjs','utf8');
  rehearsal=rehearsal.replace("result.errorCode=safeCode(error,'PHOTO_SMOKE_FAILED');","result.errorCode=safeCode(error,'PHOTO_SMOKE_FAILED');result.sdkErrorName=/^[A-Za-z0-9_]{1,80}$/.test(error.name||'')?error.name:null;result.httpStatus=error?.$metadata?.httpStatusCode||null;");
  rehearsal=rehearsal.replaceAll("from '../dist/","from '/app/api/dist/").replaceAll("from './backup.mjs'","from '/app/api/scripts/backup.mjs'");
  rehearsal=rehearsal.replaceAll("from '@aws-sdk/client-s3'","from '"+require.resolve('/app/node_modules/@aws-sdk/client-s3')+"'").replaceAll("from 'sharp'","from '"+require.resolve('/app/node_modules/sharp')+"'");
  rehearsal=rehearsal.replace('await source.client.send(new PutObjectCommand',"result.stage='source_upload';await source.client.send(new PutObjectCommand").replace('const snapshot=await createPhotoSnapshot',"result.stage='snapshot';const snapshot=await createPhotoSnapshot").replace('const wrong=join',"result.stage='wrong_key';const wrong=join").replace('const destination=join',"result.stage='restore';const destination=join");
  fs.writeFileSync('/tmp/petcore-photo-smoke.mjs',rehearsal,{mode:0o600});
  const output=cp.execFileSync('node',['/tmp/petcore-photo-smoke.mjs','--confirm-isolated-test'],{env:{...process.env,NODE_PATH:'/app/node_modules'},stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:1024*1024}).toString();
  const proof=output.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(row=>row?.event==='photo_recovery_smoke');
  if(!proof?.ok||!proof.cleanupComplete||!proof.overwriteRejected||!proof.wrongKeyRejected||proof.photosVerified!==1)throw Error('BACKUP_PHOTO_REHEARSAL_FAILED');
  fs.writeFileSync('/private/PHOTO-RECOVERY-VERIFIED.json',JSON.stringify(proof),{mode:0o600});console.log(JSON.stringify(proof));
 }catch(error){
  const lines=String(error.stdout||'').trim().split('\n');
  for(const line of lines){try{const value=JSON.parse(line);if(value.event==='photo_recovery_smoke')console.log(JSON.stringify(value));}catch{}}
  console.log(JSON.stringify({event:'photo_rehearsal_child_exit',status:Number.isInteger(error.status)?error.status:null,diagnosticCodes:[...new Set(String(error.stderr||'').match(/\b(?:ERR_[A-Z_]+|[A-Za-z]+Error)\b/g)||[])]}));
  throw Object.assign(Error('BACKUP_PHOTO_REHEARSAL_FAILED'),{code:'BACKUP_PHOTO_REHEARSAL_FAILED'});
 }
 const {runBackup}=await import('/app/api/scripts/backup.mjs');
 const manifest=await runBackup([]);
 const source=new Pool({connectionString:config.DATABASE_URL,max:1,connectionTimeoutMillis:15000});source.on('error',()=>{});
 const adminUrl=new URL(config.DATABASE_URL);adminUrl.username='postgres';adminUrl.password=state.PG_ADMIN_PASSWORD;adminUrl.pathname='/postgres';
 const admin=new Pool({connectionString:adminUrl.href,max:1,connectionTimeoutMillis:15000});admin.on('error',()=>{});
 try{
  const record=(await source.query("SELECT object_key,sha256 FROM backup_runs WHERE id=$1 AND state='uploaded' AND retention_scope='active'",[manifest.backupId])).rows[0];
  if(!record||record.sha256!==manifest.dumpSha256)throw Error('BACKUP_PROOF_RECORD_MISSING');
  const target='petcore_vps_20261120_restore_test';
  if((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[target])).rowCount)throw Error('BACKUP_PROOF_TARGET_EXISTS');
  await admin.query('CREATE DATABASE '+target+' OWNER petcore_schema_owner');
  await admin.query('REVOKE ALL ON DATABASE '+target+' FROM PUBLIC');
  await admin.query('GRANT CONNECT ON DATABASE '+target+' TO petcore_schema_owner');
  const targetUrl=new URL(config.DATABASE_URL);targetUrl.username='petcore_schema_owner';targetUrl.password=state.PG_OWNER_PASSWORD;targetUrl.pathname='/'+target;
  process.env.RESTORE_DATABASE_URL=targetUrl.href;
  const {checkRestore}=await import('/app/api/scripts/restore-check.mjs');
  const restored=await checkRestore(['--object-key',record.object_key,'--record']);
  if(!restored?.ok||restored.tablesVerified!==50||!restored.recorded)throw Error('BACKUP_PROOF_RESTORE_FAILED');
  const receipt={ok:true,event:'petcore_vps_backup_verified',backupId:manifest.backupId,tablesVerified:50,objectsIncluded:manifest.objectsIncluded,photosVerified:restored.photosVerified,sha256:manifest.dumpSha256,sizeBytes:manifest.dumpBytes,isolatedRestore:true,recorded:true};
  fs.writeFileSync('/private/VPS-BACKUP-VERIFIED.json',JSON.stringify(receipt),{flag:'wx',mode:0o600});console.log(JSON.stringify(receipt));
 }finally{await source.end();await admin.end();}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^BACKUP_[A-Z_]+$/.test(error.code||error.message||'')?error.code||error.message:'BACKUP_PROOF_FAILED'}));process.exitCode=1;});
