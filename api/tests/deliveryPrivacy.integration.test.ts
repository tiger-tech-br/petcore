// Real PostgreSQL checks with UUID-owned fixtures in a dedicated *_test database.
// Privacy services are called directly; HTTP authorization is covered separately.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const address=process.env.TEST_DATABASE_URL;
if(!address||!decodeURIComponent(new URL(address).pathname).endsWith('_test'))throw Error('Delivery privacy: configure an isolated TEST_DATABASE_URL ending in _test with migrations 023/024.');
Object.assign(process.env,{DATABASE_URL:address,DATABASE_DIRECT_URL:address,NODE_ENV:'test',SESSION_SECRET:'delivery-privacy-'+randomUUID()+randomUUID(),EMAIL_PROVIDER:'none',EMAIL_API_KEY:'',RESEND_API_KEY:'',REMINDER_EMAILS_ENABLED:'false',SUPPORT_EMAILS_ENABLED:'false',OBJECT_STORAGE_ENDPOINT:'',OBJECT_STORAGE_BUCKET:'',OBJECT_STORAGE_ACCESS_KEY:'',OBJECT_STORAGE_SECRET_KEY:''});
process.env.DATABASE_SSL??=new URL(address).searchParams.has('sslmode')?'true':'false';
let externalCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=(async()=>{externalCalls++;throw Error('Providers are forbidden in delivery privacy tests.');}) as typeof fetch;
const {exportSubject,anonymizeSubject}=await import('../src/privacyService.js');
const {runMaintenanceOnce}=await import('../src/maintenance.js');
const {pool:appPool}=await import('../src/core.js');
const {tenantExportDatasets,assertTenantExportSchema}=await import('../scripts/export-tenant.mjs');
const db=new pg.Pool({connectionString:address,max:3,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
db.on('error',()=>{});
const keys=['company','foreignCompany','user','foreignUser','tutor','foreignTutor','product','foreignProduct','sale','foreignSale','delivery','foreignDelivery','event','foreignEvent','payment','foreignPayment','confirmed','unlinked','foreignRequest','access','anonymization'] as const;
const ids=Object.fromEntries(keys.map(key=>[key,randomUUID()])) as Record<typeof keys[number],string>;
const tenants=[ids.company,ids.foreignCompany],users=[ids.user,ids.foreignUser],tag=randomUUID();
const personal='PRIVATE-DELIVERY-'+tag,foreign='FOREIGN-DELIVERY-'+tag,contact='11976543210';
let prepared=false;
async function publicRequest(company:string,name:string,status:'pending'|'confirmed'|'rejected'='pending',delivery?:string,created='now()',reviewed='now()'){
 const row=await db.query(`INSERT INTO public_delivery_requests(tenant_id,idempotency_key,payload_hash,status,customer_name,phone,address,reference,notes,subtotal_cents,quoted_delivery_fee_cents,delivery_order_id,reviewed_by,reviewed_at,rejection_reason,created_at)
  VALUES($1,$2,'fixture-fingerprint',$3,$4,$5,$6,$7,$7,1500,500,$8,$9,${status==='pending'?'NULL':reviewed},$10,${created}) RETURNING id`,
  [company,randomUUID(),status,name,contact,'Rua de teste, 123 '+name,name,delivery??null,status==='pending'?null:company===ids.company?ids.user:ids.foreignUser,status==='rejected'?name:'']);
 return row.rows[0].id as string;
}

describe('Delivery contacts: explicit subject scope, anonymization and transient retention',{concurrency:false},()=>{
 before(async()=>{
  const setup=await db.connect();await setup.query('BEGIN');try{
   for(const [company,user,tutor,product,sale,delivery,event,payment,secret] of [
    [ids.company,ids.user,ids.tutor,ids.product,ids.sale,ids.delivery,ids.event,ids.payment,personal],
    [ids.foreignCompany,ids.foreignUser,ids.foreignTutor,ids.foreignProduct,ids.foreignSale,ids.foreignDelivery,ids.foreignEvent,ids.foreignPayment,foreign]
   ]){
    await setup.query('INSERT INTO tenants(id,name,delivery_enabled) VALUES($1,$2,true)',[company,'Delivery privacy '+secret]);
    await setup.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Fixture '+secret,`${user}@example.test`,'NOT-A-LOGIN-HASH']);
    await setup.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",[company,user]);
    await setup.query('INSERT INTO tutors(id,tenant_id,name,phone,notes) VALUES($1,$2,$3,$4,$3)',[tutor,company,secret,contact]);
    await setup.query("INSERT INTO business_products(id,tenant_id,name,unit,price_cents,stock_quantity) VALUES($1,$2,'Ração de teste','saco',1500,4)",[product,company]);
    await setup.query("INSERT INTO business_sales(id,tenant_id,tutor_id,status,subtotal_cents,delivery_fee_cents,total_cents,due_date,notes,created_by) VALUES($1,$2,$3,'paid',1500,500,2000,current_date,$4,$5)",[sale,company,tutor,secret,user]);
    await setup.query("INSERT INTO business_sale_items(tenant_id,sale_id,kind,product_id,description,quantity,unit_price_cents,total_cents) VALUES($1,$2,'product',$3,'Ração de teste',1,1500,1500)",[company,sale,product]);
    await setup.query("INSERT INTO business_ledger(id,tenant_id,sale_id,kind,amount_cents,payment_method,created_by) VALUES($1,$2,$3,'sale_payment',2000,'pix',$4)",[payment,company,sale,user]);
    await setup.query('INSERT INTO business_delivery_orders(id,tenant_id,sale_id,address,phone,reference,notes,cancellation_reason,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$4,$4,$4,$6,$6)',[delivery,company,sale,'Rua da entrega, 100 '+secret,contact,user]);
    await setup.query("INSERT INTO business_delivery_events(id,tenant_id,delivery_id,new_status,reason,actor_user_id) VALUES($1,$2,$3,'preparing',$4,$5)",[event,company,delivery,secret,user]);
    await setup.query('INSERT INTO public_delivery_settings(tenant_id,enabled,coverage_note,notice,updated_by) VALUES($1,true,$2,$2,$3)',[company,'Área de teste '+secret,user]);
   }
   for(const [id,kind] of [[ids.access,'access'],[ids.anonymization,'anonymization']])await setup.query(`INSERT INTO privacy_requests(id,tenant_id,tutor_id,kind,description,identity_verified,verification_method,identity_verified_by,identity_verified_at,created_by)
    VALUES($1,$2,$3,$4,'Solicitação de teste verificada',true,'in_person',$5,now(),$5)`,[id,ids.company,ids.tutor,kind,ids.user]);
   await setup.query('COMMIT');prepared=true;
  }catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
  ids.confirmed=await publicRequest(ids.company,personal,'confirmed',ids.delivery);
  ids.unlinked=await publicRequest(ids.company,personal+'-UNLINKED');
  ids.foreignRequest=await publicRequest(ids.foreignCompany,foreign,'confirmed',ids.foreignDelivery);
  await db.query('INSERT INTO public_delivery_request_items(tenant_id,request_id,product_id,position,name,unit,quantity,unit_price_cents) VALUES($1,$2,$3,1,$4,$5,1,1500)',[ids.company,ids.confirmed,ids.product,'Ração de teste','saco']);
 });
 after(async()=>{
  try{if(prepared){
   const cleanup=await db.connect();await cleanup.query('BEGIN');try{
    for(const table of ['public_delivery_request_items','public_delivery_requests','public_delivery_settings','audit_events','privacy_request_events','privacy_requests','business_delivery_events','business_delivery_orders','business_operations','business_stock_movements','business_ledger','business_sale_items','business_sales','business_products','tutor_email_reminder_consent_events','tutors','tenant_subscriptions','memberships'])await cleanup.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[tenants]);
    await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await cleanup.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);await cleanup.query('COMMIT');
   }catch(error){await cleanup.query('ROLLBACK');throw error;}finally{cleanup.release();}
  }}finally{globalThis.fetch=originalFetch;await Promise.all([db.end(),appPool.end()]);}
  assert.equal(externalCalls,0,'No mail, payment, storage or routing provider was contacted.');
 });

 test('subject export includes delivery and confirmed snapshots without inferring identity by matching contact',async()=>{
  const result=await exportSubject(ids.company,ids.access,ids.user);
  assert.equal(result.deliveries.orders.length,1);assert.equal(result.deliveries.orders[0].id,ids.delivery);
  assert.equal(result.deliveries.orders[0].phone,contact);assert.match(result.deliveries.orders[0].address,new RegExp(personal));
  assert.equal(result.deliveries.events.length,1);assert.equal(result.deliveries.events[0].id,ids.event);
  assert.equal(result.deliveries.public_requests.length,1);assert.equal(result.deliveries.public_requests[0].id,ids.confirmed);
  assert.equal(result.deliveries.public_requests[0].items[0].quantity,1);
  assert.equal(result.sales[0].financial_record.delivery_fee_cents,500);
  const serialized=JSON.stringify(result);assert.ok(!serialized.includes(foreign));assert.ok(!serialized.includes(personal+'-UNLINKED'));
  assert.ok(!serialized.includes('payload_hash'));assert.ok(!serialized.includes('idempotency_key'));assert.ok(!serialized.includes('public_token'));
 });

 test('active delivery prevents anonymization before any contact or financial change',async()=>{
  const initial=(await db.query('SELECT * FROM business_delivery_orders WHERE tenant_id=$1 AND id=$2',[ids.company,ids.delivery])).rows[0];
  await assert.rejects(anonymizeSubject(ids.company,ids.anonymization,ids.user,'subject_request'),{status:409,message:/entregas de produtos/});
  assert.deepEqual((await db.query('SELECT * FROM business_delivery_orders WHERE tenant_id=$1 AND id=$2',[ids.company,ids.delivery])).rows[0],initial);
  await db.query("UPDATE business_delivery_orders SET status='out_for_delivery',out_for_delivery_at=now() WHERE tenant_id=$1 AND id=$2",[ids.company,ids.delivery]);
  await assert.rejects(anonymizeSubject(ids.company,ids.anonymization,ids.user,'subject_request'),{status:409,message:/entregas de produtos/});
  assert.equal((await db.query('SELECT anonymized_at FROM tutors WHERE tenant_id=$1 AND id=$2',[ids.company,ids.tutor])).rows[0].anonymized_at,null);
  assert.equal((await db.query('SELECT status FROM privacy_requests WHERE tenant_id=$1 AND id=$2',[ids.company,ids.anonymization])).rows[0].status,'open');
 });

 test('ended delivery clears fulfillment contacts and event text while retaining accounting and other identities',async()=>{
  await db.query("UPDATE business_delivery_orders SET status='delivered',delivered_at=now() WHERE tenant_id=$1 AND id=$2",[ids.company,ids.delivery]);
  const ledger=(await db.query('SELECT * FROM business_ledger WHERE tenant_id=$1 AND id=$2',[ids.company,ids.payment])).rows[0];
  const foreignOrder=(await db.query('SELECT * FROM business_delivery_orders WHERE tenant_id=$1 AND id=$2',[ids.foreignCompany,ids.foreignDelivery])).rows[0];
  await anonymizeSubject(ids.company,ids.anonymization,ids.user,'subject_request');
  const order=(await db.query('SELECT * FROM business_delivery_orders WHERE tenant_id=$1 AND id=$2',[ids.company,ids.delivery])).rows[0];
  assert.equal(order.status,'delivered');for(const field of ['address','phone','reference','notes','cancellation_reason'])assert.equal(order[field],'');
  assert.equal((await db.query('SELECT reason FROM business_delivery_events WHERE tenant_id=$1 AND id=$2',[ids.company,ids.event])).rows[0].reason,'');
  assert.equal((await db.query('SELECT 1 FROM public_delivery_requests WHERE tenant_id=$1 AND id=$2',[ids.company,ids.confirmed])).rowCount,0);
  assert.equal((await db.query('SELECT 1 FROM public_delivery_request_items WHERE tenant_id=$1 AND request_id=$2',[ids.company,ids.confirmed])).rowCount,0);
  assert.equal((await db.query('SELECT 1 FROM public_delivery_requests WHERE tenant_id=$1 AND id=$2',[ids.company,ids.unlinked])).rowCount,1);
  assert.equal((await db.query('SELECT 1 FROM public_delivery_requests WHERE tenant_id=$1 AND id=$2',[ids.foreignCompany,ids.foreignRequest])).rowCount,1);
  assert.deepEqual((await db.query('SELECT * FROM business_delivery_orders WHERE tenant_id=$1 AND id=$2',[ids.foreignCompany,ids.foreignDelivery])).rows[0],foreignOrder);
  assert.deepEqual((await db.query('SELECT * FROM business_ledger WHERE tenant_id=$1 AND id=$2',[ids.company,ids.payment])).rows[0],ledger);
  assert.deepEqual((await db.query('SELECT status,subtotal_cents,delivery_fee_cents,total_cents FROM business_sales WHERE tenant_id=$1 AND id=$2',[ids.company,ids.sale])).rows[0],{status:'paid',subtotal_cents:1500,delivery_fee_cents:500,total_cents:2000});
 });

 test('tenant archive schema explicitly covers every delivery table while hiding reusable access and replay secrets',async()=>{
  const covered=await assertTenantExportSchema(db);
  for(const table of ['business_delivery_orders','business_delivery_events','public_delivery_settings','public_delivery_requests','public_delivery_request_items'])assert.ok(covered.includes(table));
  const dataset=(name:string)=>tenantExportDatasets.find((row:any)=>row.name===name)!;
  assert.ok(dataset('business_sales').columns.includes('delivery_fee_cents'));
  assert.ok(!dataset('public_delivery_settings').columns.includes('public_token'));
  assert.ok(!dataset('public_delivery_requests').columns.includes('payload_hash'));
  assert.ok(!dataset('public_delivery_requests').columns.includes('idempotency_key'));
 });

 test('maintenance removes only expired public snapshots and preserves delivery sales and recently reviewed requests',async()=>{
  const oldPending=await publicRequest(ids.company,'Expired pending','pending',undefined,"now()-interval '31 days'");
  const oldRejected=await publicRequest(ids.company,'Expired rejected','rejected',undefined,"now()-interval '40 days'","now()-interval '31 days'");
  const recentlyReviewed=await publicRequest(ids.company,'Recent review','rejected',undefined,"now()-interval '40 days'","now()-interval '1 day'");
  const oldConfirmed=await publicRequest(ids.company,'Expired confirmed','confirmed',ids.delivery,"now()-interval '40 days'","now()-interval '31 days'");
  await db.query('INSERT INTO public_delivery_request_items(tenant_id,request_id,product_id,position,name,unit,quantity,unit_price_cents) VALUES($1,$2,$3,1,$4,$5,1,1500)',[ids.company,oldPending,ids.product,'Ração de teste','saco']);
  const result=await runMaintenanceOnce({files:false});assert.equal(result.ok,true);assert.ok(result.pruned.expiredPublicDeliveryRequests>=3);
  const remaining=(await db.query('SELECT id FROM public_delivery_requests WHERE tenant_id=ANY($1::uuid[])',[tenants])).rows.map(row=>row.id);
  for(const id of [oldPending,oldRejected,oldConfirmed])assert.ok(!remaining.includes(id));
  for(const id of [recentlyReviewed,ids.unlinked,ids.foreignRequest])assert.ok(remaining.includes(id));
  assert.equal((await db.query('SELECT 1 FROM public_delivery_request_items WHERE tenant_id=$1 AND request_id=$2',[ids.company,oldPending])).rowCount,0);
  assert.equal((await db.query('SELECT status,total_cents FROM business_sales WHERE tenant_id=$1 AND id=$2',[ids.company,ids.sale])).rows[0].total_cents,2000);
  assert.equal((await db.query('SELECT status FROM business_delivery_orders WHERE tenant_id=$1 AND id=$2',[ids.company,ids.delivery])).rows[0].status,'delivered');
 });
});
