const fs=require('node:fs');
const {Pool}=require('/app/node_modules/pg');
const database='petcore_migration_20261120_restore_test';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const quoted=value=>"'"+value.replaceAll("'","''")+"'";
async function main(){
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 for(const name of ['PG_ADMIN_PASSWORD','PG_OWNER_PASSWORD','PG_RUNTIME_PASSWORD'])if(!/^[A-Za-z0-9_-]{32,100}$/.test(state[name]||''))fail('POSTGRES_INITIALIZATION_CONFIGURATION_INVALID');
 const address=new URL('postgresql://postgres@petcore-db:5432/postgres');address.password=state.PG_ADMIN_PASSWORD;address.searchParams.set('sslmode','verify-full');address.searchParams.set('sslrootcert','/run/petcore-ca/ca.crt');
 const pool=new Pool({connectionString:address.href,max:1,connectionTimeoutMillis:15000});pool.on('error',()=>{});
 try{
  const tls=(await pool.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0];if(!tls?.ssl)fail('POSTGRES_TLS_REQUIRED');
  for(const [role,password]of [['petcore_schema_owner',state.PG_OWNER_PASSWORD],['petcore_runtime',state.PG_RUNTIME_PASSWORD]]){
   const found=await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=$1',[role]);
   if(!found.rowCount)await pool.query('CREATE ROLE '+role+' LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '+quoted(password));
   else if(Object.values(found.rows[0]).some(Boolean))fail('POSTGRES_ROLE_PRIVILEGES_INVALID');
  }
  const found=await pool.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',[database]);
  if(!found.rowCount)await pool.query('CREATE DATABASE '+database+' OWNER petcore_schema_owner');
  else if(found.rows[0].owner!=='petcore_schema_owner')fail('POSTGRES_DATABASE_OWNER_INVALID');
  await pool.query('REVOKE ALL ON DATABASE '+database+' FROM PUBLIC');
  await pool.query('GRANT CONNECT ON DATABASE '+database+' TO petcore_schema_owner,petcore_runtime');
  console.log(JSON.stringify({ok:true,event:'petcore_postgres_initialized',database,tlsVerified:true,rolesSeparated:true,dataRestored:false}));
 }finally{await pool.end();}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^POSTGRES_[A-Z_]+$/.test(error.code||'')?error.code:'POSTGRES_INITIALIZATION_FAILED'}));process.exitCode=1;});
