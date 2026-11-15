import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parse} from 'dotenv';
import {Client} from 'pg';

// Somente leitura: conferência da credencial de operação da homologação.
// Não usa o .env raiz nem imprime URL, senha ou mensagens do driver.
const expectedHost='ep-damp-tree-b6h5kkhc-pooler.c-2.sa-east-1.aws.neon.tech';
const expectedRole='petcore_hostinger_runtime';
let db;
try{
 const args=process.argv.slice(2);
 if(args.length!==1)throw Error('RUNTIME_CHECK_ENV_FILE_REQUIRED');
 const env=args[0]==='--environment'?process.env:parse(await readFile(resolve(args[0])));
 const address=new URL(env.DATABASE_URL||'');
 if(!['postgres:','postgresql:'].includes(address.protocol)||address.hostname!==expectedHost||address.pathname!=='/neondb'||decodeURIComponent(address.username)!==expectedRole)throw Error('RUNTIME_CHECK_TARGET_REFUSED');
 address.searchParams.set('sslmode','verify-full');address.searchParams.delete('uselibpqcompat');
 db=new Client({connectionString:address.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:12000,statement_timeout:15000,application_name:'petcore-runtime-role-check'});
 await db.connect();
 const role=(await db.query(`SELECT current_database() AS database_name,current_user AS role_name,
  rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,
  pg_has_role(current_user,'neon_superuser','MEMBER') AS neon_admin,
  has_schema_privilege(current_user,'public','CREATE') AS schema_create
  FROM pg_roles WHERE rolname=current_user`)).rows[0];
 const permissions=(await db.query(`SELECT count(*)::int AS tables,
  bool_and(has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'SELECT')
   AND has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'INSERT')
   AND has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'UPDATE')
   AND has_table_privilege(current_user,format('%I.%I',schemaname,tablename),'DELETE')) AS data_access,
  bool_and(tableowner<>current_user) AS owns_no_tables
  FROM pg_tables WHERE schemaname='public'`)).rows[0];
 const sequencePermissions=(await db.query(`SELECT coalesce(bool_and(has_sequence_privilege(current_user,c.oid,'USAGE')),true) AS sequence_access
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'`)).rows[0];
 const migrations=(await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count;
 const sessionTable=(await db.query("SELECT to_regclass('public.session') IS NOT NULL AS present")).rows[0].present;
 const tls=db.connection.stream;
 const checks={expectedRole:role.role_name===expectedRole,expectedDatabase:role.database_name==='neondb',
  noAdministrativePrivileges:![role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolbypassrls,role.neon_admin,role.schema_create].some(Boolean),
  ownsNoTables:permissions.owns_no_tables,dataAccess:permissions.data_access,sequenceAccess:sequencePermissions.sequence_access,
  expectedTables:permissions.tables===50,expectedMigrations:migrations===18,sessionTable,
  verifiedTLS:tls.encrypted===true&&tls.authorized===true};
 const ok=Object.values(checks).every(value=>value===true);
 console.log(JSON.stringify({ok,event:'runtime_role_verified',role:expectedRole,checks}));
 if(!ok)process.exitCode=1;
}catch(error){
 const code=/^RUNTIME_CHECK_[A-Z_]+$/.test(error?.message||'')?error.message:
  /^[A-Z0-9_]{2,64}$/.test(error?.code||'')?error.code:'RUNTIME_CHECK_FAILED';
 console.error(JSON.stringify({ok:false,code}));process.exitCode=1;
}finally{await db?.end().catch(()=>{});}

