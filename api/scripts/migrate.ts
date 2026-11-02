import { config } from 'dotenv';
config({path:new URL('../../.env',import.meta.url)});
if(process.argv.includes('--test')){if(!process.env.TEST_DATABASE_URL||!new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test'))throw Error('TEST_DATABASE_URL deve terminar em _test');process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;}
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
const db = new Pool({connectionString:process.env.DATABASE_URL});
const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sql');
try {
 await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 for (const file of (await readdir(folder)).filter(f=>/^\d+_.*\.sql$/.test(f)).sort()) {
  const client=await db.connect();
  try { await client.query('BEGIN');
   const applied=await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1',[file]);
   if (!applied.rowCount) {await client.query(await readFile(path.join(folder,file),'utf8'));await client.query('INSERT INTO schema_migrations(filename) VALUES($1)',[file]); console.log('Migration:',file);}
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
}finally{await db.end();}
