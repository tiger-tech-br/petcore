// Dedicated *_test database, fabricated subjects and locations, no providers.
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import pg from 'pg';

const address=process.env.TEST_DATABASE_URL;
if(!address||!decodeURIComponent(new URL(address).pathname).endsWith('_test'))throw Error('Tracking privacy requires an isolated TEST_DATABASE_URL ending in _test, migration 025.');
Object.assign(process.env,{DATABASE_URL:address,DATABASE_DIRECT_URL:address,NODE_ENV:'test',SESSION_SECRET:'tracking-privacy-'+randomUUID()+randomUUID(),EMAIL_PROVIDER:'none',EMAIL_API_KEY:'',RESEND_API_KEY:'',SUPPORT_EMAILS_ENABLED:'false',REMINDER_EMAILS_ENABLED:'false',OBJECT_STORAGE_ENDPOINT:'',OBJECT_STORAGE_BUCKET:'',OBJECT_STORAGE_ACCESS_KEY:'',OBJECT_STORAGE_SECRET_KEY:''});
process.env.DATABASE_SSL??=new URL(address).searchParams.has('sslmode')?'true':'false';
const {pool:appPool}=await import('../src/core.js');
const {exportSubject,anonymizeSubject}=await import('../src/privacyService.js');
const {runMaintenanceOnce}=await import('../src/maintenance.js');
const {cancelSale}=await import('../src/businessService.js');
const {assertTenantExportSchema,tenantExportDatasets}=await import('../scripts/export-tenant.mjs');
const db=new pg.Pool({connectionString:address,max:3,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});db.on('error',()=>{});
const companies=[randomUUID(),randomUUID()],users=[randomUUID(),randomUUID()],tutors=[randomUUID(),randomUUID()],drivers=[randomUUID(),randomUUID()],sales=[randomUUID(),randomUUID()],deliveries=[randomUUID(),randomUUID()],sessions=[randomUUID(),randomUUID()],requests=[randomUUID(),randomUUID()],tag=randomUUID();
let prepared=false,external=0;const fetchOriginal=globalThis.fetch;globalThis.fetch=(async()=>{external++;throw Error('Tracking privacy fixtures never call a provider.');}) as typeof fetch;
const hash=(input:string)=>createHash('sha256').update(input).digest('hex');
async function session(company:string,delivery:string,driver:string,user:string,options:{id?:string;started?:number;expires?:number;stopped?:number|null}={}){
 const id=options.id??randomUUID(),at=Date.now(),started=new Date(at+(options.started??0)).toISOString(),expires=new Date(at+(options.expires??12*3600000)).toISOString(),stopped=options.stopped===undefined||options.stopped===null?null:new Date(at+options.stopped).toISOString();
 const sid='privacy-fixture-'+user;await db.query('INSERT INTO "session"(sid,sess,expire) VALUES($1,$2,now()+interval \'1 day\') ON CONFLICT(sid) DO NOTHING',[sid,JSON.stringify({userId:user,tenantId:company,sessionVersion:1})]);
 await db.query(`INSERT INTO transport_tracking_sessions(id,tenant_id,kind,delivery_id,driver_id,user_id,session_version,upload_token_hash,public_token_hash,public_expires_at,auth_session_id,
  started_at,expires_at,stopped_at,latitude,longitude,accuracy,captured_at,received_at,sequence)
  VALUES($1,$2,'delivery',$3,$4,$5,1,$6,$7,$8,$11,$9,$8,$10,-23.661111,-46.532222,9,now(),now(),1)`,[id,company,delivery,driver,user,hash('UPLOAD_'+id),hash('PUBLIC_'+id),expires,started,stopped,sid]);return id;
}
before(async()=>{
 const setup=await db.connect();await setup.query('BEGIN');try{
  for(const [i,company]of companies.entries()){
   await setup.query('INSERT INTO tenants(id,name,tracking_enabled,delivery_enabled,shop_address,shop_latitude,shop_longitude) VALUES($1,$2,true,true,$3,-23.6,-46.5)',[company,'GPS privacy '+i+' '+tag,'Shop address '+tag]);
   await setup.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[users[i],'Driver subject '+i+' '+tag,`${users[i]}@example.test`,'NOT-A-LOGIN-HASH']);
   await setup.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",[company,users[i]]);
   await setup.query('INSERT INTO tutors(id,tenant_id,name,phone) VALUES($1,$2,$3,$4)',[tutors[i],company,'Tutor subject '+i+' '+tag,'11900000000']);
   await setup.query('INSERT INTO taxi_drivers(id,tenant_id,name,user_id) VALUES($1,$2,$3,$4)',[drivers[i],company,'Driver '+i+' '+tag,users[i]]);
   await setup.query('INSERT INTO business_sales(id,tenant_id,tutor_id,subtotal_cents,total_cents,due_date,created_by) VALUES($1,$2,$3,1500,1500,current_date,$4)',[sales[i],company,tutors[i],users[i]]);
   await setup.query("INSERT INTO business_delivery_orders(id,tenant_id,sale_id,driver_id,status,address,phone,created_by,updated_by,out_for_delivery_at) VALUES($1,$2,$3,$4,'out_for_delivery',$5,'11900000000',$6,$6,now())",[deliveries[i],company,sales[i],drivers[i],'Delivery address '+i+' '+tag,users[i]]);
  }
  for(const [i,kind]of ['access','anonymization'].entries())await setup.query(`INSERT INTO privacy_requests(id,tenant_id,tutor_id,kind,description,identity_verified,verification_method,identity_verified_by,identity_verified_at,created_by)
   VALUES($1,$2,$3,$4,'Verified fixture',true,'in_person',$5,now(),$5)`,[requests[i],companies[0],tutors[0],kind,users[0]]);
  await setup.query('COMMIT');prepared=true;
 }catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
 for(const [i,company]of companies.entries())await session(company,deliveries[i],drivers[i],users[i],{id:sessions[i]});
});
after(async()=>{
 try{if(prepared){const cleanup=await db.connect();await cleanup.query('BEGIN');try{
  await cleanup.query('DELETE FROM "session" WHERE sess::jsonb->>\'userId\'=ANY($1::text[])',[users]);
  for(const table of ['transport_tracking_sessions','audit_events','privacy_request_events','privacy_requests','business_delivery_events','business_delivery_orders','business_operations','business_stock_movements','business_ledger','business_sale_items','business_sales','taxi_drivers','tutor_email_reminder_consent_events','tutors','memberships'])await cleanup.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[companies]);
  await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await cleanup.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[companies]);await cleanup.query('COMMIT');
 }catch(error){await cleanup.query('ROLLBACK');throw error;}finally{cleanup.release();}}}
 finally{globalThis.fetch=fetchOriginal;await Promise.all([db.end(),appPool.end()]);}assert.equal(external,0);
});

test('private tenant archive explicitly covers GPS operations while excluding grants and reusable token hashes',async()=>{
 const tables=await assertTenantExportSchema(db);assert.ok(tables.includes('transport_tracking_sessions'));
 const fields=tenantExportDatasets.find((item:any)=>item.table==='transport_tracking_sessions')!.columns;
 for(const field of ['latitude','longitude','accuracy','captured_at','received_at','driver_id','user_id','delivery_id'])assert.ok(fields.includes(field));
 for(const field of ['upload_token_hash','public_token_hash','session_version','auth_session_id'])assert.ok(!fields.includes(field));
 assert.ok(tenantExportDatasets.find((item:any)=>item.table==='taxi_drivers')!.columns.includes('user_id'));
 assert.ok(tenantExportDatasets.find((item:any)=>item.table==='business_delivery_orders')!.columns.includes('driver_id'));
});
test('tutor export omits the driver location and credentials, even for an actively shared delivery',async()=>{
 const data=await exportSubject(companies[0],requests[0],users[0]);assert.equal(data.deliveries.orders.length,1);assert.equal(data.deliveries.orders[0].id,deliveries[0]);
 const serialized=JSON.stringify(data);assert.doesNotMatch(serialized,/latitude|longitude|captured_at|received_at|upload_token_hash|public_token_hash|session_version|auth_session_id/);
 assert.ok(!serialized.includes(sessions[0]));assert.ok(!serialized.includes(sessions[1]));assert.ok(!serialized.includes('Tutor subject 1 '+tag));
});
test('active fulfillment blocks anonymization before removing or changing its tracking record',async()=>{
 const before=(await db.query('SELECT * FROM transport_tracking_sessions WHERE id=$1',[sessions[0]])).rows[0];
 await assert.rejects(anonymizeSubject(companies[0],requests[1],users[0],'subject_request'),{status:409});
 assert.deepEqual((await db.query('SELECT * FROM transport_tracking_sessions WHERE id=$1',[sessions[0]])).rows[0],before);
 assert.equal((await db.query('SELECT anonymized_at FROM tutors WHERE id=$1',[tutors[0]])).rows[0].anonymized_at,null);
});
test('financial cancellation immediately revokes GPS while retaining normal stock and accounting behavior',async()=>{
 const client=await db.connect();await client.query('BEGIN');try{await cancelSale(client,companies[0],users[0],sales[0],'Fixture cancellation');await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 const row=(await db.query('SELECT latitude,upload_token_hash,public_token_hash,stopped_at FROM transport_tracking_sessions WHERE id=$1',[sessions[0]])).rows[0];
 for(const field of ['latitude','upload_token_hash','public_token_hash'])assert.equal(row[field],null);assert.ok(row.stopped_at);
 assert.equal((await db.query('SELECT status FROM business_delivery_orders WHERE id=$1',[deliveries[0]])).rows[0].status,'cancelled');
 assert.equal((await db.query('SELECT status,total_cents FROM business_sales WHERE id=$1',[sales[0]])).rows[0].total_cents,1500);
 assert.equal((await db.query('SELECT latitude FROM transport_tracking_sessions WHERE id=$1',[sessions[1]])).rows[0].latitude,-23.661111);
});
test('anonymization removes only source-linked tracking and preserves another company and financial history',async()=>{
 const foreign=(await db.query('SELECT * FROM transport_tracking_sessions WHERE id=$1',[sessions[1]])).rows[0];
 await anonymizeSubject(companies[0],requests[1],users[0],'subject_request');
 assert.equal((await db.query('SELECT 1 FROM transport_tracking_sessions WHERE id=$1',[sessions[0]])).rowCount,0);
 assert.deepEqual((await db.query('SELECT * FROM transport_tracking_sessions WHERE id=$1',[sessions[1]])).rows[0],foreign);
 assert.equal((await db.query('SELECT status,total_cents FROM business_sales WHERE id=$1',[sales[0]])).rows[0].total_cents,1500);
});
test('maintenance clears expired fixes and grants, deletes 24-hour retired metadata and preserves active fixes',async()=>{
 const owner=companies[1],user=users[1],hour=3600000;
 async function isolatedDriver(){return(await db.query('INSERT INTO taxi_drivers(tenant_id,name) VALUES($1,$2) RETURNING id',[owner,'TTL driver '+randomUUID()])).rows[0].id;}
 async function isolatedSession(options:{started:number;expires:number;stopped?:number}){
  const driver=await isolatedDriver(),sale=(await db.query('INSERT INTO business_sales(tenant_id,tutor_id,subtotal_cents,total_cents,due_date,created_by) VALUES($1,$2,1500,1500,current_date,$3) RETURNING id',[owner,tutors[1],user])).rows[0].id;
  const source=(await db.query("INSERT INTO business_delivery_orders(tenant_id,sale_id,driver_id,status,address,phone,created_by,updated_by,out_for_delivery_at,delivered_at) VALUES($1,$2,$3,'delivered','TTL fixture','11900000000',$4,$4,now(),now()) RETURNING id",[owner,sale,driver,user])).rows[0].id;
  return session(owner,source,driver,user,options);
 }
 const expired=await isolatedSession({started:-14*hour,expires:-2*hour});
 const retired=await isolatedSession({started:-26*hour,expires:-14*hour,stopped:-25*hour});
 const longExpired=await isolatedSession({started:-40*hour,expires:-28*hour});
 const result=await runMaintenanceOnce({files:false});assert.equal(result.ok,true);assert.ok(result.pruned.expiredTrackingSessions>=2);assert.ok(result.pruned.retiredTrackingSessions>=2);
 const expiredRow=(await db.query('SELECT * FROM transport_tracking_sessions WHERE id=$1',[expired])).rows[0];assert.ok(expiredRow);assert.equal(expiredRow.latitude,null);assert.equal(expiredRow.upload_token_hash,null);assert.equal(expiredRow.public_token_hash,null);assert.ok(expiredRow.stopped_at);
 for(const id of [retired,longExpired])assert.equal((await db.query('SELECT 1 FROM transport_tracking_sessions WHERE id=$1',[id])).rowCount,0);
 const active=(await db.query('SELECT * FROM transport_tracking_sessions WHERE id=$1',[sessions[1]])).rows[0];assert.equal(active.latitude,-23.661111);assert.ok(active.upload_token_hash);assert.equal(active.stopped_at,null);
});
