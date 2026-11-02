import {config} from 'dotenv';
config({path:new URL('../../.env',import.meta.url)});
import argon2 from 'argon2';
import {Pool} from 'pg';
import {createHash} from 'node:crypto';
const db=new Pool({connectionString:process.env.DATABASE_URL});
if(!process.env.SEED_ADMIN_EMAIL||!process.env.SEED_ADMIN_PASSWORD||process.env.SEED_ADMIN_PASSWORD.length<12)throw Error('Configure SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD (12+ caracteres) no .env.');
if(!process.env.SEED_DEMO_OWNER_PASSWORD||process.env.SEED_DEMO_OWNER_PASSWORD.length<12)throw Error('Configure SEED_DEMO_OWNER_PASSWORD (12+ caracteres).');
const pwd=await argon2.hash(process.env.SEED_ADMIN_PASSWORD,{type:argon2.argon2id});
const ownerPwd=await argon2.hash(process.env.SEED_DEMO_OWNER_PASSWORD,{type:argon2.argon2id});
const client=await db.connect();
try{
 await client.query('BEGIN');
 const email=process.env.SEED_ADMIN_EMAIL.toLowerCase().trim();
 const admin=await client.query(`INSERT INTO users(name,email,password_hash,is_platform_owner) VALUES('Administrador da plataforma',$1,$2,true)
 ON CONFLICT(email) DO UPDATE SET is_platform_owner=true RETURNING id`,[email,pwd]);
 for(let n=1;n<=2;n++){
  const name=`Pet Shop Demonstração ${n}`;
  const tenant=await client.query('SELECT id FROM tenants WHERE name=$1',[name]);
  let company=tenant.rows[0]?.id;
  if(!company){const created=await client.query('INSERT INTO tenants(name) VALUES($1) RETURNING id',[name]);company=created.rows[0].id;}
  const ownerEmail=`demo${n}@petcore.example`;
  const owner=await client.query(`INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET name=excluded.name RETURNING id`,[`Responsável Demo ${n}`,ownerEmail,ownerPwd]);
  await client.query(`INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin') ON CONFLICT DO NOTHING`,[company,owner.rows[0].id]);
  const tutor=await client.query('SELECT id FROM tutors WHERE tenant_id=$1 LIMIT 1',[company]);
  if(!tutor.rowCount){
   const t=await client.query('INSERT INTO tutors(tenant_id,name,phone) VALUES($1,$2,$3) RETURNING id',[company,`Tutor Exemplo ${n}`,'(11) 90000-0000']);
   await client.query('INSERT INTO pets(tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,$4,$5)',[company,t.rows[0].id,`Pet Exemplo ${n}`,'Cão','medio']);
  }
  let profId=(await client.query('SELECT id FROM professionals WHERE tenant_id=$1 LIMIT 1',[company])).rows[0]?.id;
  if(!profId)profId=(await client.query('INSERT INTO professionals(tenant_id,name) VALUES($1,$2) RETURNING id',[company,`Profissional Exemplo ${n}`])).rows[0].id;
  for(let day=1;day<=6;day++)await client.query(`INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time)
 SELECT $1,$2,$3,'08:00','18:00' WHERE NOT EXISTS(SELECT 1 FROM professional_shifts WHERE tenant_id=$1 AND professional_id=$2 AND weekday=$3)`,[company,profId,day]);
  const sv=await client.query('SELECT id FROM services WHERE tenant_id=$1 LIMIT 1',[company]);
  let svcId=sv.rows[0]?.id;
  if(!svcId)svcId=(await client.query('INSERT INTO services(tenant_id,name,price_cents,duration_minutes) VALUES($1,$2,$3,$4) RETURNING id',[company,'Banho demonstrativo',6500,60])).rows[0].id;
  await client.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[company,profId,svcId]);
  console.log(`Empresa demo ${n}: ${ownerEmail} / senha definida em SEED_DEMO_OWNER_PASSWORD`);
 }
 await client.query('COMMIT');console.log('Seed concluído. NÃO use estas empresas demonstrativas com dados reais de clientes.');
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await db.end();}
