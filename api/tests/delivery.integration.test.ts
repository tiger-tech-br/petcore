// Real HTTP/PostgreSQL fixtures. Dedicated *_test database only; no .env or providers.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const address=process.env.TEST_DATABASE_URL;
if(!address||!decodeURIComponent(new URL(address).pathname).endsWith('_test'))throw Error('Delivery: configure an isolated TEST_DATABASE_URL ending in _test with migration 023 applied.');
Object.assign(process.env,{DATABASE_URL:address,NODE_ENV:'test',SESSION_SECRET:'delivery-isolated-'+randomUUID()+randomUUID(),EMAIL_PROVIDER:'none',EMAIL_API_KEY:'',EMAIL_FROM:'',RESEND_API_KEY:'',RESEND_FROM_EMAIL:'',REMINDER_EMAILS_ENABLED:'false',REMINDER_EMAILS_CONFIRM_SEND:'NO',SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO',APP_ORIGIN:'https://delivery.example.test'});
process.env.DATABASE_SSL??=new URL(address).searchParams.has('sslmode')?'true':'false';
let base='',externalCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=(async(...args:Parameters<typeof fetch>)=>{
 const destination=new URL(args[0] instanceof Request?args[0].url:String(args[0]));
 if(!base||destination.origin!==base){externalCalls++;throw Error('External calls are forbidden in delivery fixtures.');}
 return originalFetch(...args);
}) as typeof fetch;
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:address,max:3,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
db.on('error',()=>{});
const run=randomUUID(),tenants=[randomUUID(),randomUUID()],users=Array.from({length:4},()=>randomUUID());
const tutors=[randomUUID(),randomUUID(),randomUUID()],password='Delivery-fixture-'+randomUUID(),rateKeys=new Set<string>();
const day=new Date().toISOString().slice(0,10),email=(who:string)=>`${who}-${run}@example.test`;
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,prepared=false,owner='',foreign='',inventory='',finance='',ipSerial=0;
type Reply={code:number;data:any;headers:Headers};
async function call(path:string,method='GET',payload?:unknown,cookie=owner):Promise<Reply>{
 const ip=`2001:db8:${run.slice(0,4)}:${run.slice(4,8)}::${(++ipSerial).toString(16)}`;
 if(path==='/auth/login')rateKeys.add(createHash('sha256').update('/login:'+ip).digest('hex'));
 const response=await fetch(base+'/api'+path,{method,headers:{Origin:process.env.APP_ORIGIN!,'X-PetCore-Request':'1','X-Forwarded-For':ip,'Content-Type':'application/json',Cookie:cookie},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 return{code:response.status,data:await response.json(),headers:response.headers};
}
async function newProduct(stock=5,cookie=owner){
 const reply=await call('/business/products','POST',{name:'Delivery product '+randomUUID(),sku:'DEL-'+randomUUID(),unit:'saco',price_cents:1500,cost_cents:600,min_stock:1,initial_stock:stock,idempotency_key:randomUUID()},cookie);
 assert.equal(reply.code,201,JSON.stringify(reply.data));return reply.data;
}
const input=(product:string,extra:Record<string,unknown>={})=>({tutor_id:tutors[0],address:'Rua das Entregas, 123, Centro',phone:'11987654321',reference:'Portão azul',notes:'Pedido recebido por telefone',items:[{product_id:product,quantity:1}],delivery_fee_cents:450,due_date:day,idempotency_key:randomUUID(),...extra});
async function create(product:string,extra:Record<string,unknown>={},cookie=owner){const reply=await call('/deliveries','POST',input(product,extra),cookie);assert.equal(reply.code,201,JSON.stringify(reply.data));return reply.data;}
const status=(id:string,value:string,extra:Record<string,unknown>={},cookie=owner)=>call(`/deliveries/${id}/status`,'POST',{status:value,reason:'',idempotency_key:randomUUID(),...extra},cookie);
async function stock(id:string){return(await db.query('SELECT stock_quantity FROM business_products WHERE tenant_id=$1 AND id=$2',[tenants[0],id])).rows[0]?.stock_quantity;}
async function counts(){return(await db.query(`SELECT
 (SELECT count(*)::int FROM business_delivery_orders WHERE tenant_id=$1) AS deliveries,
 (SELECT count(*)::int FROM business_sales WHERE tenant_id=$1) AS sales,
 (SELECT count(*)::int FROM business_sale_items WHERE tenant_id=$1) AS items,
 (SELECT count(*)::int FROM business_stock_movements WHERE tenant_id=$1) AS movements,
 (SELECT count(*)::int FROM business_ledger WHERE tenant_id=$1) AS ledger,
 (SELECT count(*)::int FROM business_operations WHERE tenant_id=$1) AS operations`,[tenants[0]])).rows[0];}

describe('Internal delivery: commercial consistency, status and tenant isolation',{concurrency:false},()=>{
 before(async()=>{
  assert.equal((await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0]?.published,false,'Use an unpublished, dedicated test configuration.');
  const hash=await argon2.hash(password,{type:argon2.argon2id}),setup=await db.connect();await setup.query('BEGIN');
  try{
   await setup.query("INSERT INTO tenants(id,name,timezone,delivery_enabled) VALUES($1,$2,'UTC',true),($3,$4,'UTC',true)",[tenants[0],'Delivery A '+run,tenants[1],'Delivery B '+run]);
   for(const [index,who]of ['owner','foreign','inventory','finance'].entries())await setup.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[users[index],who+' '+run,email(who),hash]);
   await setup.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($3,$4,'admin','{}'),($1,$5,'employee',ARRAY['inventory']),($1,$6,'employee',ARRAY['finance'])",[tenants[0],users[0],tenants[1],users[1],users[2],users[3]]);
   for(const company of tenants)await setup.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[company]);
   await setup.query('INSERT INTO tutors(id,tenant_id,name,phone) VALUES($1,$2,$3,$4),($5,$6,$7,$8),($9,$2,$10,$4)',[tutors[0],tenants[0],'Delivery client '+run,'11987654321',tutors[1],tenants[1],'Foreign client '+run,'11911112222',tutors[2],'Anonymized client '+run]);
   await setup.query('UPDATE tutors SET anonymized_at=now() WHERE tenant_id=$1 AND id=$2',[tenants[0],tutors[2]]);
   await setup.query('COMMIT');prepared=true;
  }catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
  const listening=server.address();assert.ok(listening&&typeof listening!=='string');base=`http://127.0.0.1:${listening.port}`;
  const login=async(who:string)=>{const reply=await call('/auth/login','POST',{email:email(who),password},'');assert.equal(reply.code,200,JSON.stringify(reply.data));return(reply.headers.get('set-cookie')??'').split(';')[0];};
  owner=await login('owner');foreign=await login('foreign');inventory=await login('inventory');finance=await login('finance');
 });
 after(async()=>{
  try{
   if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
   if(prepared){
    const cleanup=await db.connect();await cleanup.query('BEGIN');try{
     await cleanup.query('DELETE FROM "session" WHERE sess::jsonb->>\'userId\'=ANY($1::text[])',[users]);
     for(const table of ['audit_events','business_operations','business_delivery_events','business_delivery_orders','business_stock_movements','business_ledger','business_sale_items','business_expenses','business_sales','business_cash_sessions','business_products','tutor_email_reminder_consent_events','tutors','tenant_subscriptions','memberships'])await cleanup.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[tenants]);
     await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await cleanup.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);
     await cleanup.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[[...rateKeys]]);await cleanup.query('COMMIT');
    }catch(error){await cleanup.query('ROLLBACK');throw error;}finally{cleanup.release();}
   }
  }finally{globalThis.fetch=originalFetch;await Promise.all([db.end(),appPool.end()]);}
  assert.equal(externalCalls,0,'No email, payment, storage or routing provider may be contacted.');
 });

 test('finance permission manages deliveries while inventory alone cannot access them',async()=>{
  const product=await newProduct(),otherProduct=await newProduct(3,foreign),inactive=await newProduct();
  assert.equal((await call(`/business/products/${inactive.id}`,'PATCH',{active:false})).code,200);
  assert.equal((await call('/deliveries/options','GET',undefined,'')).code,401);
  assert.equal((await call('/deliveries/options','GET',undefined,inventory)).code,403);
  assert.equal((await call('/deliveries','GET',undefined,inventory)).code,403);
  assert.equal((await call('/deliveries','POST',input(product.id),inventory)).code,403);
  const options=await call('/deliveries/options','GET',undefined,finance);assert.equal(options.code,200,JSON.stringify(options.data));assert.equal(options.data.timezone,'UTC');
  assert.ok(options.data.tutors.some((row:any)=>row.id===tutors[0]&&row.phone==='11987654321'));
  assert.ok(!options.data.tutors.some((row:any)=>[tutors[1],tutors[2]].includes(row.id)));
  assert.ok(options.data.products.some((row:any)=>row.id===product.id&&row.unit==='saco'&&row.stock_quantity===5));
  assert.ok(!options.data.products.some((row:any)=>[otherProduct.id,inactive.id].includes(row.id)));
  assert.ok(options.data.products.every((row:any)=>!('cost_cents' in row)));
  assert.equal((await call('/deliveries','GET',undefined,finance)).code,200);
 });

 test('one request creates the same financial sale with server prices, delivery fee and one stock exit',async()=>{
  const product=await newProduct(),order=await create(product.id,{items:[{product_id:product.id,quantity:2}]},finance);
  assert.equal(order.status,'preparing');assert.equal(order.tutor_id,tutors[0]);assert.equal(order.subtotal_cents,3000);assert.equal(order.delivery_fee_cents,450);assert.equal(order.total_cents,3450);assert.equal(order.balance_cents,3450);assert.equal(order.paid_cents,0);assert.equal(order.sale_status,'open');assert.equal(order.items.length,1);assert.equal(order.items[0].unit_price_cents,1500);assert.equal(order.items[0].quantity,2);
  assert.equal(await stock(product.id),3);
  const financial=await call(`/business/sales/${order.sale_id}`,'GET',undefined,finance);assert.equal(financial.code,200);assert.equal(financial.data.sale.id,order.sale_id);assert.equal(financial.data.sale.total_cents,3450);assert.equal(financial.data.sale.delivery_fee_cents,450);assert.equal(financial.data.items[0].id,order.items[0].id);
  const movement=await db.query("SELECT quantity_delta FROM business_stock_movements WHERE tenant_id=$1 AND product_id=$2 AND sale_id=$3 AND reason='sale'",[tenants[0],product.id,order.sale_id]);assert.deepEqual(movement.rows,[{quantity_delta:-2}]);
  const tutor=(await db.query('SELECT email_reminders_opt_in FROM tutors WHERE tenant_id=$1 AND id=$2',[tenants[0],tutors[0]])).rows[0];assert.equal(tutor.email_reminders_opt_in,false);
  assert.equal((await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0].published,false);
 });

 test('concurrent retries create one order and sale without charging the fee or stock twice',async()=>{
  const product=await newProduct(4),payload=input(product.id),before=await counts();
  const replies=await Promise.all([call('/deliveries','POST',payload),call('/deliveries','POST',payload)]);assert.ok(replies.every(reply=>reply.code===201),JSON.stringify(replies.map(reply=>reply.data)));assert.equal(replies[0].data.id,replies[1].data.id);assert.equal(replies[0].data.sale_id,replies[1].data.sale_id);
  const after=await counts();assert.equal(after.deliveries,before.deliveries+1);assert.equal(after.sales,before.sales+1);assert.equal(after.items,before.items+1);assert.equal(after.movements,before.movements+1);assert.equal(after.ledger,before.ledger);assert.equal(await stock(product.id),3);assert.equal(replies[0].data.total_cents,1950);
  assert.equal((await call('/deliveries','POST',{...payload,delivery_fee_cents:451})).code,409);assert.deepEqual(await counts(),after);
 });

 test('two distinct orders cannot sell the same final unit concurrently',async()=>{
  const product=await newProduct(1),before=await counts();
  const replies=await Promise.all([call('/deliveries','POST',input(product.id)),call('/deliveries','POST',input(product.id))]);assert.deepEqual(replies.map(reply=>reply.code).sort(),[201,409],JSON.stringify(replies.map(reply=>reply.data)));
  const after=await counts();assert.equal(after.deliveries,before.deliveries+1);assert.equal(after.sales,before.sales+1);assert.equal(after.movements,before.movements+1);assert.equal(await stock(product.id),0);
 });

 test('an insufficient second item rolls back the entire delivery, sale and stock change',async()=>{
  const available=await newProduct(3),empty=await newProduct(0),before=await counts();
  const reply=await call('/deliveries','POST',input(available.id,{items:[{product_id:available.id,quantity:1},{product_id:empty.id,quantity:1}]}));assert.equal(reply.code,409,JSON.stringify(reply.data));
  assert.deepEqual(await counts(),before);assert.equal(await stock(available.id),3);assert.equal(await stock(empty.id),0);
 });

 test('strict input rejects forged prices, invalid items, foreign references and anonymized clients',async()=>{
  const product=await newProduct(),otherProduct=await newProduct(3,foreign),inactive=await newProduct();assert.equal((await call(`/business/products/${inactive.id}`,'PATCH',{active:false})).code,200);
  const before=await counts();
  for(const extra of [{tenant_id:tenants[1]},{items:[{product_id:product.id,quantity:1,unit_price_cents:1}]},{items:[]},{items:[{product_id:product.id,quantity:0}]},{items:[{product_id:product.id,quantity:1},{product_id:product.id,quantity:1}]},{delivery_fee_cents:-1},{phone:''},{address:''}])assert.equal((await call('/deliveries','POST',input(product.id,extra))).code,422,JSON.stringify(extra));
  assert.equal((await call('/deliveries','POST',input(inactive.id))).code,422);
  assert.equal((await call('/deliveries','POST',input(otherProduct.id))).code,404);
  assert.equal((await call('/deliveries','POST',input(product.id,{tutor_id:tutors[1]}))).code,404);
  assert.equal((await call('/deliveries','POST',input(product.id,{tutor_id:tutors[2]}))).code,409);
  assert.deepEqual(await counts(),before);assert.equal(await stock(product.id),5);
 });

 test('delivery details, status mutations and list results remain isolated by company',async()=>{
  const product=await newProduct(),order=await create(product.id);
  assert.equal((await call(`/deliveries/${order.id}`,'GET',undefined,foreign)).code,404);
  assert.equal((await status(order.id,'out_for_delivery',{},foreign)).code,404);
  const list=await call('/deliveries?status=all','GET',undefined,foreign);assert.equal(list.code,200);assert.equal(list.data.total,0);assert.deepEqual(list.data.items,[]);
  const own=await call(`/deliveries/${order.id}`);assert.equal(own.code,200);assert.equal(own.data.status,'preparing');assert.equal(own.data.sale_id,order.sale_id);
 });

 test('delivery transitions preserve contact snapshots and never mark an unpaid sale as paid',async()=>{
  const product=await newProduct(),order=await create(product.id),before=await counts();
  assert.equal((await status(order.id,'delivered')).code,409);
  const sent=await status(order.id,'out_for_delivery');assert.equal(sent.code,200,JSON.stringify(sent.data));assert.equal(sent.data.status,'out_for_delivery');
  const delivered=await status(order.id,'delivered');assert.equal(delivered.code,200,JSON.stringify(delivered.data));assert.equal(delivered.data.status,'delivered');assert.ok(delivered.data.delivered_at);assert.equal(delivered.data.sale_status,'open');assert.equal(delivered.data.paid_cents,0);assert.equal(delivered.data.balance_cents,1950);
  assert.equal((await status(order.id,'out_for_delivery')).code,409);assert.equal((await status(order.id,'cancelled',{reason:'Not a permitted return'})).code,409);
  await db.query('UPDATE tutors SET phone=$3 WHERE tenant_id=$1 AND id=$2',[tenants[0],tutors[0],'11999990000']);
  try{const detail=await call(`/deliveries/${order.id}`);assert.equal(detail.code,200);assert.equal(detail.data.phone,'11987654321');assert.equal(detail.data.address,'Rua das Entregas, 123, Centro');assert.equal(detail.data.reference,'Portão azul');}
  finally{await db.query('UPDATE tutors SET phone=$3 WHERE tenant_id=$1 AND id=$2',[tenants[0],tutors[0],'11987654321']);}
  assert.equal((await counts()).ledger,before.ledger);assert.equal(await stock(product.id),4);
 });

 test('cancellation reuses the financial refund and restores stock exactly once across retries',async()=>{
  const product=await newProduct(5),order=await create(product.id,{items:[{product_id:product.id,quantity:2}]});
  const paid=await call(`/business/sales/${order.sale_id}/payments`,'POST',{amount_cents:500,payment_method:'pix',idempotency_key:randomUUID()});assert.equal(paid.code,201,JSON.stringify(paid.data));
  const payload={status:'cancelled',reason:'Cliente desistiu antes da saída',idempotency_key:randomUUID()},url=`/deliveries/${order.id}/status`;
  const replies=await Promise.all([call(url,'POST',payload),call(url,'POST',payload)]);assert.ok(replies.every(reply=>reply.code===200),JSON.stringify(replies.map(reply=>reply.data)));assert.ok(replies.every(reply=>reply.data.status==='cancelled'&&reply.data.sale_status==='cancelled'));assert.equal(await stock(product.id),5);
  const financial=await call(`/business/sales/${order.sale_id}`);assert.equal(financial.code,200);assert.equal(financial.data.sale.status,'cancelled');assert.equal(financial.data.sale.paid_cents,0);assert.equal(financial.data.sale.balance_cents,0);assert.equal(financial.data.payments.filter((entry:any)=>entry.kind==='sale_refund').length,1);assert.equal(financial.data.payments.find((entry:any)=>entry.kind==='sale_refund').amount_cents,500);
  assert.deepEqual((await db.query("SELECT quantity_delta FROM business_stock_movements WHERE tenant_id=$1 AND sale_id=$2 AND reason='sale_cancel'",[tenants[0],order.sale_id])).rows,[{quantity_delta:2}]);
  assert.equal((await call(`/business/sales/${order.sale_id}/cancel`,'POST',{reason:'Repetição pelo financeiro',idempotency_key:randomUUID()})).code,200);assert.equal(await stock(product.id),5);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM business_ledger WHERE tenant_id=$1 AND sale_id=$2 AND kind='sale_refund'",[tenants[0],order.sale_id])).rows[0].n,1);
 });

 test('an order already out for delivery can be cancelled with the original sale compensated',async()=>{
  const product=await newProduct(2),order=await create(product.id);assert.equal((await status(order.id,'out_for_delivery')).code,200);
  assert.equal((await status(order.id,'cancelled',{reason:'Produto devolvido ao pet shop'})).code,200);
  const detail=await call(`/deliveries/${order.id}`);assert.equal(detail.data.status,'cancelled');assert.equal(detail.data.sale_status,'cancelled');assert.ok(detail.data.cancelled_at);assert.equal(await stock(product.id),2);
  assert.equal((await status(order.id,'delivered')).code,409);
 });

 test('subscription write protection blocks a new delivery without hiding existing records',async()=>{
  const product=await newProduct(),order=await create(product.id),before=await counts();await db.query("UPDATE tenant_subscriptions SET status='suspended' WHERE tenant_id=$1",[tenants[0]]);
  try{
   assert.equal((await call('/deliveries','POST',input(product.id))).code,402);assert.equal((await status(order.id,'out_for_delivery')).code,402);
   const detail=await call(`/deliveries/${order.id}`);assert.equal(detail.code,200);assert.equal(detail.data.status,'preparing');assert.deepEqual(await counts(),before);assert.equal(await stock(product.id),4);
  }finally{await db.query("UPDATE tenant_subscriptions SET status='trial' WHERE tenant_id=$1",[tenants[0]]);}
 });

 test('cancelling the financial sale also closes preparing and outbound deliveries exactly once',async()=>{
  for(const stage of ['preparing','out_for_delivery']){
   const product=await newProduct(3),order=await create(product.id);
   if(stage==='out_for_delivery')assert.equal((await status(order.id,'out_for_delivery')).code,200);
   assert.equal((await call(`/business/sales/${order.sale_id}/payments`,'POST',{amount_cents:500,payment_method:'pix',idempotency_key:randomUUID()})).code,201);
   const reason=`Cancelamento financeiro durante ${stage}`,payload={reason,idempotency_key:randomUUID()},url=`/business/sales/${order.sale_id}/cancel`;
   const cancelled=await call(url,'POST',payload);assert.equal(cancelled.code,200,JSON.stringify(cancelled.data));assert.equal(cancelled.data.status,'cancelled');
   assert.equal((await call(url,'POST',payload)).code,200);assert.equal((await call(url,'POST',{reason,idempotency_key:randomUUID()})).code,200);
   const detail=await call(`/deliveries/${order.id}`);assert.equal(detail.code,200);assert.equal(detail.data.status,'cancelled');assert.equal(detail.data.sale_status,'cancelled');assert.equal(detail.data.cancellation_reason,reason);assert.ok(detail.data.cancelled_at);assert.equal(await stock(product.id),3);
   const events=await db.query("SELECT old_status,new_status,reason FROM business_delivery_events WHERE tenant_id=$1 AND delivery_id=$2 AND new_status='cancelled'",[tenants[0],order.id]);assert.deepEqual(events.rows,[{old_status:stage,new_status:'cancelled',reason}]);
   assert.deepEqual((await db.query("SELECT quantity_delta FROM business_stock_movements WHERE tenant_id=$1 AND sale_id=$2 AND reason='sale_cancel'",[tenants[0],order.sale_id])).rows,[{quantity_delta:1}]);
   assert.deepEqual((await db.query("SELECT amount_cents FROM business_ledger WHERE tenant_id=$1 AND sale_id=$2 AND kind='sale_refund'",[tenants[0],order.sale_id])).rows,[{amount_cents:500}]);
  }
 });

 test('financial cancellation preserves the completed delivery status and completion timestamp',async()=>{
  const product=await newProduct(3),order=await create(product.id);assert.equal((await status(order.id,'out_for_delivery')).code,200);
  const delivered=await status(order.id,'delivered');assert.equal(delivered.code,200);assert.equal(delivered.data.status,'delivered');assert.ok(delivered.data.delivered_at);
  const beforeEvents=(await db.query('SELECT * FROM business_delivery_events WHERE tenant_id=$1 AND delivery_id=$2 ORDER BY id',[tenants[0],order.id])).rows;
  const cancelled=await call(`/business/sales/${order.sale_id}/cancel`,'POST',{reason:'Ajuste financeiro após a entrega',idempotency_key:randomUUID()});assert.equal(cancelled.code,200,JSON.stringify(cancelled.data));assert.equal(cancelled.data.status,'cancelled');
  const detail=await call(`/deliveries/${order.id}`);assert.equal(detail.code,200);assert.equal(detail.data.status,'delivered');assert.equal(detail.data.sale_status,'cancelled');assert.equal(detail.data.delivered_at,delivered.data.delivered_at);assert.equal(detail.data.cancelled_at,null);assert.equal(detail.data.balance_cents,0);
  assert.deepEqual((await db.query('SELECT * FROM business_delivery_events WHERE tenant_id=$1 AND delivery_id=$2 ORDER BY id',[tenants[0],order.id])).rows,beforeEvents);assert.equal(await stock(product.id),3);
 });

 test('disabled delivery or essential mode blocks reads and writes while financial cancellation remains available',async()=>{
  const product=await newProduct(3),order=await create(product.id),legacyProduct=await newProduct(2),legacy=await create(legacyProduct.id);let before=await counts();
  try{
   for(const [enabled,mode]of [[false,'complete'],[true,'essential']] as const){
    await db.query('UPDATE tenants SET delivery_enabled=$2,operation_mode=$3 WHERE id=$1',[tenants[0],enabled,mode]);
    assert.equal((await call('/deliveries/options')).code,404);assert.equal((await call('/deliveries')).code,404);assert.equal((await call(`/deliveries/${order.id}`)).code,404);
    assert.equal((await call('/deliveries','POST',input(product.id))).code,404);assert.equal((await status(order.id,'out_for_delivery')).code,404);assert.deepEqual(await counts(),before);assert.equal(await stock(product.id),2);
    if(!enabled){
     const cancelled=await call(`/business/sales/${legacy.sale_id}/cancel`,'POST',{reason:'Cancelar venda anterior com entregas desativadas',idempotency_key:randomUUID()});assert.equal(cancelled.code,200,JSON.stringify(cancelled.data));assert.equal(cancelled.data.status,'cancelled');assert.equal(await stock(legacyProduct.id),2);
     assert.equal((await db.query('SELECT status FROM business_delivery_orders WHERE tenant_id=$1 AND id=$2',[tenants[0],legacy.id])).rows[0].status,'cancelled');before=await counts();
    }
   }
  }finally{await db.query("UPDATE tenants SET delivery_enabled=true,operation_mode='complete' WHERE id=$1",[tenants[0]]);}
  const detail=await call(`/deliveries/${order.id}`);assert.equal(detail.code,200);assert.equal(detail.data.status,'preparing');
 });
});
