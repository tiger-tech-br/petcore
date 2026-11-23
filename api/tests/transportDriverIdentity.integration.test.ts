import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const address=process.env.TEST_DATABASE_URL;
if(!address||!decodeURIComponent(new URL(address).pathname).endsWith('_test'))
 throw Error('Use a dedicated TEST_DATABASE_URL ending in _test with migration 025 applied.');

test('driver identity is tenant-bound, unique, nullable and tracking starts disabled',async()=>{
 const pool=new pg.Pool({connectionString:address,max:1,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
 try{
  const db=await pool.connect();
  try{
   await db.query('BEGIN');
   const a=randomUUID(),b=randomUUID(),u=randomUUID(),v=randomUUID(),driver=randomUUID(),other=randomUUID();
   await db.query('INSERT INTO tenants(id,name) VALUES($1,$2),($3,$4)',[a,'Tracking fixture A',b,'Tracking fixture B']);
   for(const id of [u,v])await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'Tracking fixture',id+'@example.test','not-a-login-hash']);
   await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'employee'),($3,$4,'employee')",[a,u,b,v]);
   await db.query('INSERT INTO taxi_drivers(id,tenant_id,name) VALUES($1,$2,$3),($4,$2,$5)',[driver,a,'Motorista A',other,'Motorista B']);
   const settings=await db.query('SELECT transport_tracking_enabled FROM tenants WHERE id=$1',[a]);
   assert.equal(settings.rows[0].transport_tracking_enabled,false);
   assert.equal((await db.query('SELECT user_id FROM taxi_drivers WHERE id=$1',[driver])).rows[0].user_id,null);
   await db.query('UPDATE taxi_drivers SET user_id=$2 WHERE id=$1',[driver,u]);
   async function rejectsSql(sql:string,params:string[],code:string){
    await db.query('SAVEPOINT tracking_invalid');
    try{await assert.rejects(db.query(sql,params),{code});}
    finally{await db.query('ROLLBACK TO SAVEPOINT tracking_invalid');await db.query('RELEASE SAVEPOINT tracking_invalid');}
   }
   await rejectsSql('UPDATE taxi_drivers SET user_id=$2 WHERE id=$1',[other,v],'23503');
   await rejectsSql('UPDATE taxi_drivers SET user_id=$2 WHERE id=$1',[other,u],'23505');
   await db.query('UPDATE taxi_drivers SET user_id=NULL WHERE id=$1',[driver]);
   await db.query('UPDATE taxi_drivers SET user_id=$2 WHERE id=$1',[other,u]);
   const fk=await db.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='business_delivery_orders'::regclass AND conname='business_delivery_driver_fk'`);
   assert.match(fk.rows[0]?.definition??'',/FOREIGN KEY \\(tenant_id, driver_id\\) REFERENCES taxi_drivers\\(tenant_id, id\\)/);
   const column=await db.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='business_delivery_orders' AND column_name='driver_id'");
   assert.equal(column.rows[0]?.is_nullable,'YES');
  }finally{try{await db.query('ROLLBACK');}finally{db.release();}}
 }finally{await pool.end();}
});
