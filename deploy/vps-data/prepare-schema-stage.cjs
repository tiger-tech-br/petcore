const fs=require('node:fs'),cp=require('node:child_process');
const {Pool}=require('/app/node_modules/pg');
async function main(){
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const url=new URL('postgresql://petcore_schema_owner@petcore-db:5432/petcore_migration_20261120_restore_test');url.password=state.PG_OWNER_PASSWORD;url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert','/run/petcore-ca/ca.crt');
 const env={...process.env,DATABASE_URL:url.href,DATABASE_DIRECT_URL:url.href,DATABASE_SSL:'true'};
 try{cp.execFileSync('node',['/app/api/scripts/migrate.mjs'],{env,stdio:['ignore','pipe','pipe'],timeout:120000});}catch{throw Error('SCHEMA_MIGRATION_FAILED');}
 const db=new Pool({connectionString:url.href,max:1,connectionTimeoutMillis:15000});db.on('error',()=>{});
 try{
  const migrations=(await db.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename')).rows;
  const expected={'018_backup_retention.sql':'d62d821bde6c9250bbcc9d1e4cd7f62a044b5f7732fcfb284ff7dd32dc49e8ad','019_launch_policy_drafts.sql':'0e0f0555ffbe150c1fd74c7b5488070e7c71fa11b5e21686c5c4de5f8e32b5bc','020_backup_legacy_scope.sql':'bdf19081df2b221b5d40dc9a6c3956056f8b39c7f210f5fd584f6942deae1f46'};
  if(migrations.length!==19||migrations.some(m=>m.filename.startsWith('016_'))||Object.entries(expected).some(([name,checksum])=>migrations.find(m=>m.filename===name)?.checksum!==checksum))throw Error('SCHEMA_HISTORY_MISMATCH');
  const tables=Number((await db.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname='public'")).rows[0].count);
  if(tables!==50)throw Error('SCHEMA_TABLE_COUNT_MISMATCH');
  const result={ok:true,event:'petcore_staged_schema_ready',migrations:19,tables,historicalChecksumsPreserved:true,unrelated016Absent:true,promoted:false};
  fs.writeFileSync('/private/SCHEMA-COMPLETE.json',JSON.stringify(result),{mode:0o600});console.log(JSON.stringify(result));
 }finally{await db.end();}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^SCHEMA_[A-Z_]+$/.test(error.message||'')?error.message:'SCHEMA_PREPARATION_FAILED'}));process.exitCode=1;});
