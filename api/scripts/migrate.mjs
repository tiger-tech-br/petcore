import {config} from 'dotenv';
import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {Pool} from 'pg';
config({path:new URL('../../.env',import.meta.url)});

const args=process.argv.slice(2);
if(args.includes('--help')){console.log('node api/scripts/migrate.mjs [--test]');process.exit(0);}
if(args.some(arg=>arg!=='--test')){console.error(JSON.stringify({ok:false,code:'MIGRATION_ARGUMENT_INVALID'}));process.exit(1);}
let db,client,locked=false,inTransaction=false;
try{
 const testing=args.includes('--test');
 const raw=testing?process.env.TEST_DATABASE_URL:(process.env.DATABASE_DIRECT_URL||process.env.DATABASE_URL);
 if(!raw)throw Object.assign(new Error(),{code:'MIGRATION_DATABASE_MISSING'});
 const address=new URL(raw);
 if(!['postgres:','postgresql:'].includes(address.protocol)||!address.hostname)throw Object.assign(new Error(),{code:'MIGRATION_DATABASE_INVALID'});
 if(testing&&!decodeURIComponent(address.pathname).endsWith('_test'))throw Object.assign(new Error(),{code:'MIGRATION_TEST_DATABASE_REQUIRED'});
 if(address.hostname.endsWith('.neon.tech'))address.hostname=address.hostname.replace(/-pooler(?=\.)/,'');
 const local=['localhost','127.0.0.1','[::1]','::1'].includes(address.hostname);
 const secure=address.hostname.endsWith('.neon.tech')||process.env.DATABASE_SSL==='true'||(process.env.NODE_ENV==='production'&&!local)||Boolean(address.searchParams.get('sslmode')&&address.searchParams.get('sslmode')!=='disable');
 if(secure){address.searchParams.set('sslmode','verify-full');address.searchParams.delete('uselibpqcompat');}
 db=new Pool({connectionString:address.toString(),max:1,connectionTimeoutMillis:12000,application_name:'petcore-migrate',ssl:secure?{rejectUnauthorized:true}:undefined});
 client=await db.connect();
 locked=(await client.query('SELECT pg_try_advisory_lock(719381000) AS locked')).rows[0].locked;
 if(!locked)throw Object.assign(new Error(),{code:'MIGRATION_ALREADY_RUNNING'});
 await client.query("SET lock_timeout='30s'");await client.query("SET statement_timeout='10min'");
 await client.query('BEGIN');inTransaction=true;
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(filename text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now(),checksum text)');
 await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
 await client.query('COMMIT');inTransaction=false;
 const files=(await readdir(new URL('../sql/',import.meta.url))).filter(name=>/^\d+_[a-zA-Z0-9_]+\.sql$/.test(name)).sort();
 const existing=await client.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename');
 if(existing.rows.some(row=>!files.includes(row.filename)))throw Object.assign(new Error(),{code:'MIGRATION_FILE_MISSING'});
 for(const file of files){
  const content=await readFile(new URL('../sql/'+file,import.meta.url)),checksum=createHash('sha256').update(content).digest('hex');
  const previous=existing.rows.find(row=>row.filename===file);
  if(previous?.checksum&&previous.checksum!==checksum)throw Object.assign(new Error(),{code:'MIGRATION_CHECKSUM_MISMATCH'});
  if(previous?.checksum)continue;
  await client.query('BEGIN');inTransaction=true;
  if(previous){
   // Bancos anteriores não tinham checksum. Registrar uma referência daqui para
   // frente não comprova qual arquivo foi aplicado no passado e não reexecuta SQL.
   await client.query('UPDATE schema_migrations SET checksum=$2 WHERE filename=$1 AND checksum IS NULL',[file,checksum]);
   console.log(JSON.stringify({event:'legacy_checksum_baseline',file}));
  }else{
   await client.query(content.toString('utf8').replace(/^\uFEFF/,''));
   await client.query('INSERT INTO schema_migrations(filename,checksum) VALUES($1,$2)',[file,checksum]);
   console.log(JSON.stringify({event:'migration_applied',file}));
  }
  await client.query('COMMIT');inTransaction=false;
 }
 console.log(JSON.stringify({ok:true,event:'migrations_ready'}));
}catch(error){
 if(inTransaction)await client?.query('ROLLBACK').catch(()=>{});
 const code=typeof error?.code==='string'&&/^[A-Z0-9_]{2,80}$/.test(error.code)?error.code:'MIGRATION_FAILED';
 console.error(JSON.stringify({ok:false,code}));process.exitCode=1;
}finally{
 if(locked)await client?.query('SELECT pg_advisory_unlock(719381000)').catch(()=>{});
 client?.release();await db?.end();
}
