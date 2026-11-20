'use strict';
// Explicit isolated-database check. Does not load .env or construct a real S3 client.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const {existsSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {resolve,join,dirname,basename}=require('node:path');
const {pathToFileURL}=require('node:url');
const {createRequire}=require('node:module');

const fail=code=>{throw Object.assign(new Error(code),{code});};
const must=(condition,code)=>{if(!condition)fail(code);};
function target(){
 let address;
 try{address=new URL(process.env.TEST_DATABASE_URL||'');}catch{fail('LEGACY_CHECK_TEST_DATABASE_REQUIRED');}
 must(['postgres:','postgresql:'].includes(address.protocol)&&Boolean(address.hostname)
  &&decodeURIComponent(address.pathname.slice(1)).endsWith('_test'),'LEGACY_CHECK_ISOLATED_DATABASE_REQUIRED');
 return address;
}

async function main(){
 const address=target();
 const appRoot=existsSync('/app/api/package.json')?'/app':resolve(__dirname,'../..');
 const appRequire=createRequire(join(appRoot,'api/package.json'));
 const {Client}=appRequire('pg');
 const {GetObjectCommand,DeleteObjectCommand}=appRequire('@aws-sdk/client-s3');
 const {expireBackups,BACKUP_RETENTION_LOCK}=await import(pathToFileURL(join(appRoot,'api/dist/backupRetention.js')).href);
 const db=new Client({connectionString:address.toString(),connectionTimeoutMillis:10000,statement_timeout:15000,
  ...(process.env.DATABASE_SSL==='true'?{ssl:{rejectUnauthorized:true}}:{})});
 const ids={legacy:randomUUID(),active:randomUUID()},prefix='legacy-retention-check';
 const objectKey=id=>prefix+'/petcore-2000-01-01T00-00-00-000Z-'+id+'.dump.enc';
 const manifestKey=id=>objectKey(id).replace(/\.dump\.enc$/,'.manifest.enc');
 const reads=[],deletes=[];let transaction=false,directory,result;
 try{
  await db.connect();
  const database=(await db.query('SELECT current_database() AS name')).rows[0].name;
  must(database===decodeURIComponent(address.pathname.slice(1))&&database.endsWith('_test'),'LEGACY_CHECK_DATABASE_MISMATCH');
  const columns=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='backup_runs' AND column_name=ANY($1::text[])",[['retention_scope','legacy_archived_at','legacy_archive_sha256']])).rows;
  must(columns.length===3,'LEGACY_CHECK_MIGRATION_020_REQUIRED');
  must(Number((await db.query('SELECT count(*)::int AS count FROM public.backup_runs WHERE id=ANY($1::uuid[])',[Object.values(ids)])).rows[0].count)===0,'LEGACY_CHECK_FIXTURE_COLLISION');
  await db.query('BEGIN');transaction=true;
  must((await db.query('SELECT pg_try_advisory_xact_lock($1) AS locked',[BACKUP_RETENTION_LOCK])).rows[0].locked===true,'LEGACY_CHECK_RETENTION_RUNNING');
  // PostgreSQL copies the actual constraints/defaults; only this session sees fixtures.
  await db.query('CREATE TEMP TABLE backup_runs (LIKE public.backup_runs INCLUDING ALL) ON COMMIT DROP');
  await db.query("INSERT INTO backup_runs(id,state,started_at,finished_at,object_key,sha256,size_bytes) VALUES($1,'uploaded','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z',$2,$3,40)",[ids.active,objectKey(ids.active),'c'.repeat(64)]);
  await db.query("INSERT INTO backup_runs(id,state,started_at,finished_at,object_key,sha256,size_bytes,retention_scope,legacy_archived_at,legacy_archive_sha256) VALUES($1,'uploaded','2000-01-01T00:00:00Z','2000-01-01T00:00:00Z',$2,$3,40,'legacy',now(),$4)",[ids.legacy,objectKey(ids.legacy),'c'.repeat(64),'d'.repeat(64)]);
  must((await db.query('SELECT retention_scope FROM backup_runs WHERE id=$1',[ids.active])).rows[0].retention_scope==='active','LEGACY_CHECK_ACTIVE_DEFAULT_FAILED');

  let rejected=0;
  async function rejects(sql,parameters,code='23514'){
   await db.query('SAVEPOINT legacy_constraint_check');
   let actual=null;
   try{await db.query(sql,parameters);}catch(error){actual=error.code;}
   await db.query('ROLLBACK TO SAVEPOINT legacy_constraint_check');
   await db.query('RELEASE SAVEPOINT legacy_constraint_check');
   must(actual===code,'LEGACY_CHECK_CONSTRAINT_REJECTION_FAILED');rejected++;
  }
  await rejects("UPDATE backup_runs SET retention_scope='foreign' WHERE id=$1",[ids.active]);
  await rejects('UPDATE backup_runs SET retention_scope=NULL WHERE id=$1',[ids.active],'23502');
  await rejects("UPDATE backup_runs SET retention_scope='legacy' WHERE id=$1",[ids.active]);
  await rejects('UPDATE backup_runs SET legacy_archived_at=NULL WHERE id=$1',[ids.legacy]);
  await rejects('UPDATE backup_runs SET legacy_archive_sha256=NULL WHERE id=$1',[ids.legacy]);
  await rejects("UPDATE backup_runs SET legacy_archive_sha256='invalid' WHERE id=$1",[ids.legacy]);
  await rejects('UPDATE backup_runs SET legacy_archived_at=now() WHERE id=$1',[ids.active]);
  await rejects('UPDATE backup_runs SET legacy_archive_sha256=$2 WHERE id=$1',[ids.active,'e'.repeat(64)]);

  directory=await fs.mkdtemp(join(tmpdir(),'petcore-legacy-retention-check-'));
  const backup={bucket:'fictional-test-bucket',fingerprint:'b'.repeat(64),client:{send:async command=>{
   if(command instanceof DeleteObjectCommand){deletes.push(command.input?.Key);fail('LEGACY_CHECK_DELETE_FORBIDDEN');}
   must(command instanceof GetObjectCommand,'LEGACY_CHECK_UNEXPECTED_STORAGE_COMMAND');
   reads.push(command.input?.Key);
   must(command.input?.Key===manifestKey(ids.active),'LEGACY_CHECK_LEGACY_STORAGE_ACCESS');
   // A sentinel proves the real code tried reading the active manifest. No I/O occurs.
   throw Object.assign(new Error('Fictional active manifest sentinel'),{code:'LEGACY_CHECK_ACTIVE_READ'});
  }}};
  const options={db,backup,key:Buffer.alloc(32,7),prefix,sourceFingerprint:'a'.repeat(64),directory,apply:false};
  const uploaded=await expireBackups(options);
  must(uploaded.due===1&&uploaded.failures.length===1&&uploaded.failures[0].backupId===ids.active
   &&uploaded.failures[0].code==='LEGACY_CHECK_ACTIVE_READ'&&reads.length===1&&deletes.length===0,'LEGACY_CHECK_UPLOADED_SCOPE_FAILED');

  const plan=id=>JSON.stringify([objectKey(id),manifestKey(id)]);
  await db.query("UPDATE backup_runs SET state='expiring',expiration_started_at=now(),expiration_objects=$2::jsonb,expiration_bucket_fingerprint=$3 WHERE id=$1",[ids.legacy,plan(ids.legacy),backup.fingerprint]);
  const legacyExpiring=await expireBackups(options);
  must(legacyExpiring.due===1&&legacyExpiring.validated===0&&legacyExpiring.failures.length===1
   &&legacyExpiring.failures[0].backupId===ids.active&&reads.length===2&&deletes.length===0,'LEGACY_CHECK_EXPIRING_LEGACY_SCOPE_FAILED');

  await db.query("UPDATE backup_runs SET state='expiring',expiration_started_at=now(),expiration_objects=$2::jsonb,expiration_bucket_fingerprint=$3 WHERE id=$1",[ids.active,plan(ids.active),backup.fingerprint]);
  const activeExpiring=await expireBackups(options);
  must(activeExpiring.ok===true&&activeExpiring.due===1&&activeExpiring.validated===1
   &&activeExpiring.expired===0&&reads.length===2&&deletes.length===0,'LEGACY_CHECK_EXPIRING_ACTIVE_SCOPE_FAILED');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM backup_runs')).rows[0].count,2);

  await db.query('ROLLBACK');transaction=false;
  must((await db.query("SELECT to_regclass('pg_temp.backup_runs') IS NULL AS absent")).rows[0].absent===true,'LEGACY_CHECK_TEMPORARY_TABLE_REMAINED');
  const remaining=Number((await db.query('SELECT count(*)::int AS count FROM public.backup_runs WHERE id=ANY($1::uuid[])',[Object.values(ids)])).rows[0].count);
  must(remaining===0,'LEGACY_CHECK_PUBLIC_FIXTURES_REMAINED');
  result={ok:true,event:'legacy_retention_scope_verified',fixtureRows:2,constraintRejections:rejected,
   uploadedActiveOnly:true,legacyExpiringExcluded:true,activeExpiringSelected:true,
   s3ReadsActive:reads.length,s3ReadsLegacy:0,s3DeleteAttempts:deletes.length,rolledBack:true,publicFixturesRemaining:remaining};
 }finally{
  if(transaction)await db.query('ROLLBACK').catch(()=>{});
  await db.end().catch(()=>{});
  if(directory){
   const resolved=resolve(directory);
   must(dirname(resolved)===resolve(tmpdir())&&basename(resolved).startsWith('petcore-legacy-retention-check-'),'LEGACY_CHECK_CLEANUP_PATH_REFUSED');
   must(!(await fs.lstat(resolved)).isSymbolicLink(),'LEGACY_CHECK_CLEANUP_LINK_REFUSED');
   await fs.rm(resolved,{recursive:true,force:true});
  }
 }
 console.log(JSON.stringify(result));
}
main().catch(error=>{
 const code=typeof error?.code==='string'&&/^[A-Z0-9_]{2,80}$/.test(error.code)?error.code:'LEGACY_CHECK_FAILED';
 console.error(JSON.stringify({ok:false,code}));process.exitCode=1;
});
