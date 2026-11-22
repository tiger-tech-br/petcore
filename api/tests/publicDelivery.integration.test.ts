// Real HTTP/PostgreSQL fixtures. Never fall back to .env or a live database.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const address=process.env.TEST_DATABASE_URL;
if(!address||!decodeURIComponent(new URL(address).pathname).endsWith('_test'))throw Error('Public delivery: use an isolated TEST_DATABASE_URL ending in _test with migrations 023 and 024.');
Object.assign(process.env,{DATABASE_URL:address,NODE_ENV:'test',SESSION_SECRET:'public-delivery-fixtures-'+randomUUID()+randomUUID(),EMAIL_PROVIDER:'none',EMAIL_API_KEY:'',RESEND_API_KEY:'',REMINDER_EMAILS_ENABLED:'false',SUPPORT_EMAILS_ENABLED:'false',APP_ORIGIN:'https://public-delivery.example.test'});
process.env.DATABASE_SSL??=new URL(address).searchParams.has('sslmode')?'true':'false';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:address,max:5,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
db.on('error',()=>{});
const run=randomUUID(),tenants=[randomUUID(),randomUUID()],users=Array.from({length:4},()=>randomUUID()),tutors=[randomUUID(),randomUUID()];
const password='Public-delivery-'+randomUUID(),ips=new Set<string>(),email=(label:string)=>`${label}-${run}@example.test`;
const keyed=(value:string)=>createHmac('sha256',process.env.SESSION_SECRET!).update(value).digest('hex');
let base='',owner='',foreign='',finance='',inventory='',token='',foreignToken='',serial=0,externalCalls=0,prepared=false;
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;
const originalFetch=globalThis.fetch;
globalThis.fetch=(async(...args:Parameters<typeof fetch>)=>{const url=new URL(args[0] instanceof Request?args[0].url:String(args[0]));if(!base||url.origin!==base){externalCalls++;throw Error('External provider calls are forbidden by public delivery fixtures.');}return originalFetch(...args);}) as typeof fetch;
type Reply={code:number;data:any;headers:Headers};
function nextIp(){return `2001:db8:${run.slice(0,4)}:${run.slice(4,8)}::${(++serial).toString(16)}`;}
async function call(path:string,method='GET',payload?:unknown,cookie='',ip=nextIp()):Promise<Reply>{
 ips.add(ip);const response=await fetch(base+'/api'+path,{method,headers:{Origin:process.env.APP_ORIGIN!,'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':ip,Cookie:cookie},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=text;}return{code:response.status,data,headers:response.headers};
}
async function product(stock=50,price=1500,cookie=owner,visible=true){
 const response=await call('/business/products','POST',{name:'Ração '+randomUUID(),sku:'CAT-'+randomUUID(),unit:'saco',price_cents:price,cost_cents:300,min_stock:1,initial_stock:stock,public_catalog_visible:visible,idempotency_key:randomUUID()},cookie);
 assert.equal(response.code,201,JSON.stringify(response.data));return response.data;
}
const draft=(productId:string,extra:Record<string,unknown>={})=>({customer_name:'Cliente do catálogo '+run,phone:'(11) 90000-1234',address:'Rua do Catálogo, 123\nCentro — Santo André',reference:'Portão azul\nInterfone 2',notes:'Ligar ao chegar.\nPedido de teste.',items:[{product_id:productId,quantity:2}],idempotency_key:randomUUID(),website:'',...extra});
async function submit(productId:string,extra:Record<string,unknown>={},publicToken=token){
 const payload=draft(productId,extra),reply=await call(`/public/delivery/${publicToken}/requests`,'POST',payload);assert.equal(reply.code,201,JSON.stringify(reply.data));
 const row=(await db.query('SELECT id FROM public_delivery_requests WHERE receipt=$1',[reply.data.receipt])).rows[0];assert.ok(row);return{id:row.id as string,payload,reply};
}
const confirm=(id:string,extra:Record<string,unknown>={},cookie=owner)=>call(`/deliveries/public-requests/${id}/confirm`,'POST',{idempotency_key:randomUUID(),...extra},cookie);
const stock=async(id:string)=>(await db.query('SELECT stock_quantity FROM business_products WHERE tenant_id=$1 AND id=$2',[tenants[0],id])).rows[0].stock_quantity;
async function counts(){return(await db.query(`SELECT
 (SELECT count(*)::int FROM business_sales WHERE tenant_id=$1) AS sales,
 (SELECT count(*)::int FROM business_delivery_orders WHERE tenant_id=$1) AS deliveries,
 (SELECT count(*)::int FROM business_stock_movements WHERE tenant_id=$1) AS movements,
 (SELECT count(*)::int FROM business_ledger WHERE tenant_id=$1) AS ledger,
 (SELECT count(*)::int FROM tutors WHERE tenant_id=$1) AS tutors`,[tenants[0]])).rows[0];}

describe('Public delivery: opt-in, requests, accounting and tenant isolation',{concurrency:false},()=>{
 before(async()=>{
  assert.equal((await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0]?.published,false,'Use an unpublished dedicated test configuration.');
  const client=await db.connect();await client.query('BEGIN');try{
   await client.query("INSERT INTO tenants(id,name,timezone,delivery_enabled) VALUES($1,$2,'UTC',true),($3,$4,'UTC',true)",[tenants[0],'Catalog A '+run,tenants[1],'Catalog B '+run]);
   const hash=await argon2.hash(password,{type:argon2.argon2id});
   for(const [index,label]of ['owner','foreign','finance','inventory'].entries())await client.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[users[index],label+' '+run,email(label),hash]);
   await client.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($3,$4,'admin','{}'),($1,$5,'employee',ARRAY['finance']),($1,$6,'employee',ARRAY['inventory'])",[tenants[0],users[0],tenants[1],users[1],users[2],users[3]]);
   for(const company of tenants)await client.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[company]);
   for(const [index,company]of tenants.entries())await client.query('INSERT INTO tutors(id,tenant_id,name,phone) VALUES($1,$2,$3,$4)',[tutors[index],company,'Existing catalog client '+index,'11977778888']);
   await client.query('COMMIT');prepared=true;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const binding=server.address();assert.ok(binding&&typeof binding!=='string');base=`http://127.0.0.1:${binding.port}`;
  const login=async(label:string)=>{const response=await call('/auth/login','POST',{email:email(label),password});assert.equal(response.code,200,JSON.stringify(response.data));return(response.headers.get('set-cookie')??'').split(';')[0];};
  owner=await login('owner');foreign=await login('foreign');finance=await login('finance');inventory=await login('inventory');
 });
 after(async()=>{
  try{
   if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
   if(prepared){const client=await db.connect();await client.query('BEGIN');try{
    await client.query('DELETE FROM "session" WHERE sess::jsonb->>\'userId\'=ANY($1::text[])',[users]);
    for(const table of ['public_delivery_request_items','public_delivery_requests','public_delivery_settings','audit_events','business_operations','business_delivery_events','business_delivery_orders','business_stock_movements','business_ledger','business_sale_items','business_expenses','business_sales','business_cash_sessions','business_products','tutor_email_reminder_consent_events','tutors','tenant_subscriptions','memberships'])await client.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[tenants]);
    await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await client.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);
    const keys=[...ips].flatMap(ip=>[keyed(`public-delivery:ip:${ip}`),createHash('sha256').update('/login:'+ip).digest('hex'),...tenants.flatMap(company=>['read','write'].map(kind=>keyed(`public-delivery:${kind}:${ip}:${company}`)))]);
    keys.push(...tenants.flatMap(company=>['read','write'].map(kind=>keyed(`public-delivery:company:${kind}:${company}`))));await client.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[keys]);await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
  }finally{globalThis.fetch=originalFetch;await Promise.all([db.end(),appPool.end()]);}
  assert.equal(externalCalls,0,'No email, payment, storage or route provider request is permitted.');
 });

 test('catalogue defaults to disabled and only an admin configures its canonical public link',async()=>{
  assert.equal((await call('/public-delivery/settings')).code,401);
  for(const cookie of [finance,inventory])assert.equal((await call('/public-delivery/settings','GET',undefined,cookie)).code,403);
  const settings=await call('/public-delivery/settings','GET',undefined,owner);assert.equal(settings.code,200,JSON.stringify(settings.data));assert.equal(settings.data.enabled,false);assert.equal(settings.data.delivery_fee_cents,null);
  token=settings.data.token;assert.match(token,/^[a-f0-9]{48}$/);assert.equal(settings.data.link,process.env.APP_ORIGIN+'/loja/'+token);assert.equal(settings.data.subscription_writable,true);
  assert.equal((await call(`/public/delivery/${token}`)).code,404);
  assert.equal((await call('/public-delivery/settings','PUT',{enabled:true},finance)).code,403);
  const other=await call('/public-delivery/settings','GET',undefined,foreign);assert.equal(other.code,200);foreignToken=other.data.token;
 });
 test('opt-in exposes only active public product fields without stock, cost or tenant identifiers',async()=>{
  const visible=await product(),unavailable=await product(0),inactive=await product(),internal=await product(50,2000,owner,false),other=await product(5,9900,foreign);
  await call(`/business/products/${inactive.id}`,'PATCH',{active:false},owner);
  const result=await call('/public-delivery/settings','PUT',{enabled:true,coverage_note:'Bairros próximos\nConsulte o pet shop.',notice:'Entrega combinada pelo telefone.',delivery_fee_cents:450},owner);assert.equal(result.code,200,JSON.stringify(result.data));
  const catalog=await call(`/public/delivery/${token}`);assert.equal(catalog.code,200);assert.equal(catalog.data.businessName,'Catalog A '+run);assert.equal(catalog.data.delivery_fee_cents,450);assert.equal(catalog.data.page_size,24);
  assert.ok(catalog.data.products.some((row:any)=>row.id===visible.id&&row.available));assert.ok(catalog.data.products.some((row:any)=>row.id===unavailable.id&&!row.available));assert.ok(!catalog.data.products.some((row:any)=>[inactive.id,internal.id,other.id].includes(row.id)));
  assert.equal((await call(`/public/delivery/${token}/requests`,'POST',draft(internal.id))).code,422);
  for(const row of catalog.data.products)assert.deepEqual(Object.keys(row).sort(),['available','id','name','price_cents','unit']);
  assert.doesNotMatch(JSON.stringify(catalog.data),new RegExp(tenants.join('|')+'|cost_cents|stock_quantity|public_token|customer_name'));
  const none=await call(`/public/delivery/${token}?q=not-found-${run}&page=2`);assert.equal(none.code,200);assert.equal(none.data.total,0);assert.deepEqual(none.data.products,[]);
 });
 test('anonymous requests retain multiline contacts and snapshots without reserving stock or creating sales',async()=>{
  const item=await product(),before=await counts(),request=await submit(item.id);assert.match(request.reply.data.receipt,/^[a-f0-9]{40}$/);assert.equal(request.reply.data.status,'pending');assert.deepEqual(await counts(),before);assert.equal(await stock(item.id),50);
  const row=(await db.query('SELECT * FROM public_delivery_requests WHERE id=$1',[request.id])).rows[0];assert.equal(row.address,request.payload.address);assert.equal(row.reference,request.payload.reference);assert.equal(row.notes,request.payload.notes);assert.equal(row.phone,'11900001234');assert.equal(row.subtotal_cents,3000);assert.equal(row.quoted_delivery_fee_cents,450);
  const line=(await db.query('SELECT * FROM public_delivery_request_items WHERE request_id=$1',[request.id])).rows[0];assert.equal(line.quantity,2);assert.equal(line.unit_price_cents,1500);
 });
 test('public payload cannot set prices, tenant, status, unknown products or hidden control characters',async()=>{
  const item=await product(),other=await product(5,1500,foreign),base=draft(item.id);
  const variants=[{...base,tenant_id:tenants[1]},{...base,status:'confirmed'},{...base,subtotal_cents:1},{...base,delivery_fee_cents:0},{...base,items:[{product_id:item.id,quantity:2,unit_price_cents:1}]},{...base,items:[{product_id:other.id,quantity:1}]},{...base,items:[{product_id:item.id,quantity:1},{product_id:item.id,quantity:1}]},{...base,website:'robot.example'},{...base,customer_name:'Wrong\nname'},{...base,notes:'wrong\u0000note'}];
  for(const payload of variants)assert.equal((await call(`/public/delivery/${token}/requests`,'POST',payload)).code,422);
  assert.equal((await call(`/public/delivery/${token}/requests`,'POST',draft(item.id,{items:[{product_id:item.id,quantity:51}]}))).code,409);assert.equal(await stock(item.id),50);
 });
 test('a repeated request is idempotent while changing a reused payload is rejected',async()=>{
  const item=await product(),request=await submit(item.id),again=await call(`/public/delivery/${token}/requests`,'POST',request.payload);assert.equal(again.code,201);assert.equal(again.data.receipt,request.reply.data.receipt);
  assert.equal((await call(`/public/delivery/${token}/requests`,'POST',{...request.payload,address:'Outro endereço, 222'})).code,409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public_delivery_requests WHERE tenant_id=$1 AND idempotency_key=$2',[tenants[0],request.payload.idempotency_key])).rows[0].n,1);
 });
 test('finance can review its own inbox while anonymous, inventory-only and foreign users cannot read its records',async()=>{
  const item=await product(),request=await submit(item.id);assert.equal((await call('/deliveries/public-requests')).code,401);assert.equal((await call('/deliveries/public-requests','GET',undefined,inventory)).code,403);
  const rows=await call('/deliveries/public-requests','GET',undefined,finance);assert.equal(rows.code,200);assert.ok(rows.data.items.some((row:any)=>row.id===request.id));assert.ok(rows.data.items.every((row:any)=>!('payload_hash'in row)&&!('idempotency_key'in row)));
  const other=await call('/deliveries/public-requests','GET',undefined,foreign);assert.equal(other.code,200);assert.ok(!other.data.items.some((row:any)=>row.id===request.id));
  assert.equal((await confirm(request.id,{},foreign)).code,404);assert.equal((await call(`/deliveries/public-requests/${request.id}/reject`,'POST',{reason:'Não pode.'},foreign)).code,404);
 });
 test('confirmation creates one delivery, sale, tutor and stock movement without marking payment',async()=>{
  const item=await product(),request=await submit(item.id),before=await counts(),key=randomUUID();
  const confirmed=await confirm(request.id,{idempotency_key:key},finance);assert.equal(confirmed.code,201,JSON.stringify(confirmed.data));assert.equal(confirmed.data.status,'preparing');assert.equal(confirmed.data.subtotal_cents,3000);assert.equal(confirmed.data.delivery_fee_cents,450);assert.equal(confirmed.data.total_cents,3450);assert.equal(confirmed.data.paid_cents,0);assert.equal(confirmed.data.balance_cents,3450);assert.equal(await stock(item.id),48);
  const after=await counts();assert.equal(after.sales,before.sales+1);assert.equal(after.deliveries,before.deliveries+1);assert.equal(after.tutors,before.tutors+1);assert.equal(after.movements,before.movements+1);assert.equal(after.ledger,before.ledger);
  const repeated=await confirm(request.id,{idempotency_key:key},finance);assert.equal(repeated.code,201);assert.equal(repeated.data.id,confirmed.data.id);assert.deepEqual(await counts(),after);assert.equal((await confirm(request.id)).code,409);
  assert.equal((await db.query('SELECT status,delivery_order_id FROM public_delivery_requests WHERE id=$1',[request.id])).rows[0].delivery_order_id,confirmed.data.id);
 });
 test('concurrent confirmation of the same request creates one sale only',async()=>{
  const item=await product(),request=await submit(item.id),before=await counts(),key=randomUUID();
  const replies=await Promise.all([confirm(request.id,{idempotency_key:key}),confirm(request.id,{idempotency_key:key})]);assert.deepEqual(replies.map(reply=>reply.code),[201,201]);assert.equal(replies[0].data.id,replies[1].data.id);const after=await counts();assert.equal(after.sales,before.sales+1);assert.equal(after.deliveries,before.deliveries+1);assert.equal(await stock(item.id),48);
 });
 test('confirmation can explicitly link an existing tutor but cannot link another tenant or an anonymized tutor',async()=>{
  const item=await product(),request=await submit(item.id),before=await counts();assert.equal((await confirm(request.id,{tutor_id:tutors[1]})).code,404);assert.deepEqual(await counts(),before);
  const confirmed=await confirm(request.id,{tutor_id:tutors[0]});assert.equal(confirmed.code,201,JSON.stringify(confirmed.data));assert.equal(confirmed.data.tutor_id,tutors[0]);assert.equal((await counts()).tutors,before.tutors);
  const anonymous=randomUUID();await db.query('INSERT INTO tutors(id,tenant_id,name,anonymized_at) VALUES($1,$2,$3,now())',[anonymous,tenants[0],'Removed']);const next=await submit(item.id);assert.equal((await confirm(next.id,{tutor_id:anonymous})).code,409);
 });
 test('stock and price changes abort confirmation without leaking a newly-created tutor or sale',async()=>{
  const item=await product(),request=await submit(item.id);await db.query('UPDATE business_products SET stock_quantity=1 WHERE tenant_id=$1 AND id=$2',[tenants[0],item.id]);let before=await counts();assert.equal((await confirm(request.id)).code,409);assert.deepEqual(await counts(),before);
  await db.query('UPDATE business_products SET stock_quantity=50,price_cents=1600 WHERE tenant_id=$1 AND id=$2',[tenants[0],item.id]);before=await counts();const changed=await confirm(request.id);assert.equal(changed.code,409);assert.match(changed.data.error,/preços mudaram/);assert.deepEqual(await counts(),before);assert.equal((await db.query('SELECT status FROM public_delivery_requests WHERE id=$1',[request.id])).rows[0].status,'pending');
  const hidden=await product(),hiddenRequest=await submit(hidden.id);await db.query('UPDATE business_products SET public_catalog_visible=false WHERE tenant_id=$1 AND id=$2',[tenants[0],hidden.id]);before=await counts();assert.equal((await confirm(hiddenRequest.id)).code,409);assert.deepEqual(await counts(),before);assert.equal(await stock(hidden.id),50);
 });
 test('an unknown delivery fee must be agreed explicitly and a quoted fee cannot be altered',async()=>{
  await call('/public-delivery/settings','PUT',{enabled:true,delivery_fee_cents:null},owner);const item=await product(),request=await submit(item.id),before=await counts();assert.equal((await confirm(request.id)).code,422);assert.deepEqual(await counts(),before);
  const confirmed=await confirm(request.id,{delivery_fee_cents:0});assert.equal(confirmed.code,201,JSON.stringify(confirmed.data));assert.equal(confirmed.data.delivery_fee_cents,0);
  await call('/public-delivery/settings','PUT',{enabled:true,delivery_fee_cents:450},owner);const quoted=await submit(item.id);assert.equal((await confirm(quoted.id,{delivery_fee_cents:451})).code,409);assert.equal((await confirm(quoted.id,{delivery_fee_cents:450})).code,201);
 });
 test('submission rereads the delivery fee after a concurrent settings change under its lock',async()=>{
  const item=await product(),connection=await db.connect(),ip=nextIp();let pending:Promise<Reply>|undefined;
  await connection.query('BEGIN');try{
   await connection.query('SELECT tenant_id FROM public_delivery_settings WHERE tenant_id=$1 FOR UPDATE',[tenants[0]]);
   pending=call(`/public/delivery/${token}/requests`,'POST',draft(item.id),'',ip);
   let started=false;for(let retry=0;retry<100;retry++){const hit=await db.query('SELECT 1 FROM auth_rate_limits WHERE key=$1',[keyed(`public-delivery:write:${ip}:${tenants[0]}`)]);if(hit.rowCount){started=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
   assert.equal(started,true,'Public lookup must finish before releasing the settings lock.');
   await connection.query('UPDATE public_delivery_settings SET delivery_fee_cents=700 WHERE tenant_id=$1',[tenants[0]]);await connection.query('COMMIT');
   const response=await pending;assert.equal(response.code,201,JSON.stringify(response.data));assert.equal((await db.query('SELECT quoted_delivery_fee_cents FROM public_delivery_requests WHERE receipt=$1',[response.data.receipt])).rows[0].quoted_delivery_fee_cents,700);
  }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();if(pending)await pending.catch(()=>{});await db.query('UPDATE public_delivery_settings SET delivery_fee_cents=450 WHERE tenant_id=$1',[tenants[0]]);}
 });
 test('rejection preserves the request without stock or accounting effects and can be deleted only by admin',async()=>{
  const item=await product(),request=await submit(item.id),before=await counts();const rejected=await call(`/deliveries/public-requests/${request.id}/reject`,'POST',{reason:'Endereço fora da região.\nCliente avisado.'},finance);assert.equal(rejected.code,200,JSON.stringify(rejected.data));assert.deepEqual(await counts(),before);assert.equal(await stock(item.id),50);assert.equal((await confirm(request.id)).code,409);
  assert.equal((await call(`/deliveries/public-requests/${request.id}`,'DELETE',undefined,finance)).code,403);assert.equal((await call(`/deliveries/public-requests/${request.id}`,'DELETE',undefined,foreign)).code,404);assert.equal((await call(`/deliveries/public-requests/${request.id}`,'DELETE',undefined,owner)).code,200);assert.equal((await db.query('SELECT 1 FROM public_delivery_request_items WHERE request_id=$1',[request.id])).rowCount,0);
 });
 test('disabled delivery, essential mode, expired subscription and inactive tenant never accept public orders',async()=>{
  const item=await product(),request=await submit(item.id);
  try{
   await db.query('UPDATE tenants SET delivery_enabled=false WHERE id=$1',[tenants[0]]);assert.equal((await call(`/public/delivery/${token}`)).code,404);assert.equal((await call(`/public/delivery/${token}/requests`,'POST',draft(item.id))).code,404);assert.equal((await call('/deliveries/public-requests','GET',undefined,owner)).code,404);assert.equal((await confirm(request.id)).code,404);
   await db.query("UPDATE tenants SET delivery_enabled=true,operation_mode='essential' WHERE id=$1",[tenants[0]]);assert.equal((await call(`/public/delivery/${token}`)).code,404);assert.equal((await confirm(request.id)).code,404);
   await db.query("UPDATE tenants SET operation_mode='complete' WHERE id=$1",[tenants[0]]);await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()-interval '1 day',paid_through=NULL WHERE tenant_id=$1",[tenants[0]]);assert.equal((await call(`/public/delivery/${token}`)).code,404);assert.equal((await confirm(request.id)).code,402);assert.equal((await call('/deliveries/public-requests','GET',undefined,owner)).code,200,'Read-only access preserves consultation.');
   await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()+interval '30 days' WHERE tenant_id=$1",[tenants[0]]);await db.query('UPDATE tenants SET active=false WHERE id=$1',[tenants[0]]);assert.equal((await call(`/public/delivery/${token}`)).code,404);assert.equal((await confirm(request.id)).code,403);
  }finally{await db.query("UPDATE tenants SET active=true,delivery_enabled=true,operation_mode='complete' WHERE id=$1",[tenants[0]]);await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()+interval '30 days' WHERE tenant_id=$1",[tenants[0]]);}
 });
 test('per-IP request throttling limits repeated submissions even with an idempotent payload',async()=>{
  const item=await product(),payload=draft(item.id),ip=nextIp();for(let i=0;i<8;i++)assert.equal((await call(`/public/delivery/${token}/requests`,'POST',payload,'',ip)).code,201);assert.equal((await call(`/public/delivery/${token}/requests`,'POST',payload,'',ip)).code,429);
 });
 test('rotating or disabling the catalogue invalidates the old link without erasing pending orders',async()=>{
  const item=await product(),request=await submit(item.id),old=token;const rotated=await call('/public-delivery/settings','PUT',{enabled:true,delivery_fee_cents:450,rotate_token:true},owner);assert.equal(rotated.code,200);token=rotated.data.token;assert.notEqual(token,old);assert.equal((await call(`/public/delivery/${old}`)).code,404);assert.equal((await call(`/public/delivery/${token}`)).code,200);
  assert.equal((await call('/public-delivery/settings','PUT',{enabled:false},owner)).code,200);assert.equal((await call(`/public/delivery/${token}`)).code,404);assert.equal((await call(`/public/delivery/${token}/requests`,'POST',draft(item.id))).code,404);assert.equal((await db.query('SELECT status FROM public_delivery_requests WHERE id=$1',[request.id])).rows[0].status,'pending');
 });
});
