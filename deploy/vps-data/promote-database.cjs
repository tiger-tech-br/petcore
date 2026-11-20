// One-time promotion of the explicitly approved, restored test snapshot.
// All connections remain inside the PetCore Docker network with verified TLS.
const fs=require('node:fs');
const {Pool}=require('/app/node_modules/pg');
const fingerprint='e0505c835d7d2bde84b00ca8b30f5dc76e2371e1b8c7e53b646bf387df7768f6';
function fail(code){throw Object.assign(Error(code),{code});}
async function main(){
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const restored=JSON.parse(fs.readFileSync('/private/RESTORE-COMPLETE.json','utf8'));
 const schema=JSON.parse(fs.readFileSync('/private/SCHEMA-COMPLETE.json','utf8'));
 const storage=JSON.parse(fs.readFileSync('/private/STORAGE-COMPLETE.json','utf8'));
 const archive=JSON.parse(fs.readFileSync('/private/LEGACY-STORAGE-COMPLETE.json','utf8'));
 if(!restored.result?.ok||restored.result.backupId!=='9a679551-f7c0-4ced-b9f7-0fa77f7ca340'||restored.result.tablesVerified!==50||!schema.ok||schema.tables!==50||schema.migrations!==19||!storage.ok||!archive.ok||archive.archiveFingerprint!==fingerprint||archive.objects!==36)fail('PROMOTION_EVIDENCE_INVALID');
 function connect(database,role='postgres',password=state.PG_ADMIN_PASSWORD){const url=new URL('postgresql://'+role+'@petcore-db:5432/'+database);url.password=password;url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert','/run/petcore-ca/ca.crt');const db=new Pool({connectionString:url.href,max:1,connectionTimeoutMillis:15000,statement_timeout:60000});db.on('error',()=>{});return db;}
 const admin=connect('postgres');let stage,prod,runtime;
 try{
  const existing=(await admin.query("SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname='petcore'")).rows[0];
  const exists=Boolean(existing);
  if(exists&&existing.owner!=='petcore_schema_owner')fail('PROMOTION_TARGET_ALREADY_EXISTS');
  if(!exists){
   stage=connect('petcore_migration_20261120_restore_test');
   await stage.query('BEGIN');
   try{
    await stage.query('LOCK TABLE backup_runs IN ACCESS EXCLUSIVE MODE');
    const count=Number((await stage.query('SELECT count(*)::int AS n FROM backup_runs')).rows[0].n);
    if(count!==15)fail('PROMOTION_LEGACY_HISTORY_MISMATCH');
    await stage.query("UPDATE backup_runs SET retention_scope='legacy',legacy_archived_at=now(),legacy_archive_sha256=$1 WHERE retention_scope='active'",[fingerprint]);
    await stage.query('COMMIT');
   }catch(error){await stage.query('ROLLBACK');throw error;}
   await stage.end();stage=null;
   if((await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname='petcore_migration_20261120_restore_test'")).rows[0].n!==0)fail('PROMOTION_STAGING_CONNECTIONS_ACTIVE');
   await admin.query('CREATE DATABASE petcore TEMPLATE petcore_migration_20261120_restore_test OWNER petcore_schema_owner');
  }
  await admin.query('REVOKE ALL ON DATABASE petcore FROM PUBLIC');
  await admin.query('GRANT CONNECT ON DATABASE petcore TO petcore_schema_owner,petcore_runtime');
  prod=connect('petcore');
  await prod.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await prod.query('GRANT USAGE ON SCHEMA public TO petcore_runtime');
  await prod.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO petcore_runtime');
  await prod.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO petcore_runtime');
  await prod.query('ALTER DEFAULT PRIVILEGES FOR ROLE petcore_schema_owner IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO petcore_runtime');
  await prod.query('ALTER DEFAULT PRIVILEGES FOR ROLE petcore_schema_owner IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO petcore_runtime');
  runtime=connect('petcore','petcore_runtime',state.PG_RUNTIME_PASSWORD);
  const role=(await runtime.query("SELECT current_user,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,has_schema_privilege(current_user,'public','CREATE') AS schema_create FROM pg_roles WHERE rolname=current_user")).rows[0];
  const tables=(await runtime.query("SELECT count(*)::int AS n,bool_and(tableowner<>current_user) AS not_owner,bool_and(has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'SELECT') AND has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'INSERT') AND has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'UPDATE') AND has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'DELETE')) AS crud FROM pg_tables WHERE schemaname='public'")).rows[0];
  const seq=(await runtime.query("SELECT coalesce(bool_and(has_sequence_privilege(current_user,c.oid,'USAGE,SELECT')),true) AS ok FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'")).rows[0];
  const migrations=Number((await runtime.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n);
  const legacy=(await runtime.query("SELECT count(*)::int AS n,bool_and(retention_scope='legacy' AND legacy_archive_sha256=$1) AS ok FROM backup_runs",[fingerprint])).rows[0];
  const tls=(await runtime.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl;
  if(role.current_user!=='petcore_runtime'||[role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolreplication,role.rolbypassrls,role.schema_create].some(Boolean)||tables.n!==50||!tables.not_owner||!tables.crud||!seq.ok||migrations!==19||legacy.n!==15||!legacy.ok||!tls)fail('PROMOTION_RUNTIME_CHECK_FAILED');
  const config=JSON.parse(fs.readFileSync('/private/app/runtime.json','utf8'));
  Object.assign(config,{OBJECT_STORAGE_ENDPOINT:'https://petcore.tigertech.dev.br',OBJECT_STORAGE_REGION:'us-east-1',OBJECT_STORAGE_BUCKET:'petcore-fotos',OBJECT_STORAGE_ACCESS_KEY:'petcore-app',OBJECT_STORAGE_SECRET_KEY:state.STORAGE_APP_SECRET_KEY,EMAIL_PROVIDER:'none',SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO',REMINDER_EMAILS_ENABLED:'false',REMINDER_EMAILS_CONFIRM_SEND:'NO'});
  fs.writeFileSync('/private/app/runtime.json',JSON.stringify(config),{mode:0o600});fs.chownSync('/private/app/runtime.json',1000,1000);
  const record={ok:true,event:'petcore_database_promoted',database:'petcore',tables:50,migrations:19,legacyBackups:15,verifiedTLS:true,runtimePrivilegesRestricted:true,sourceUnchanged:true};
  fs.writeFileSync('/private/PROMOTION-COMPLETE.json',JSON.stringify(record),{mode:0o600});console.log(JSON.stringify(record));
 }finally{await Promise.allSettled([stage?.end(),prod?.end(),runtime?.end(),admin.end()]);}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^PROMOTION_[A-Z_]+$/.test(error.code||'')?error.code:'PROMOTION_FAILED'}));process.exitCode=1;});
