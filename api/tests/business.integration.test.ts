// Execute exclusivamente em PostgreSQL dedicado terminado em _test.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Business: configure TEST_DATABASE_URL exclusivo terminado em _test e aplique todas as migrations.');
process.env.DATABASE_URL=testUrl;process.env.NODE_ENV='test';
process.env.SESSION_SECRET='business-isolated-test-only-'+randomUUID()+randomUUID();
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:testUrl,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const ids={a:randomUUID(),b:randomUUID(),owner:randomUUID(),other:randomUUID(),inventory:randomUUID(),finance:randomUUID(),tutor:randomUUID(),foreignTutor:randomUUID(),anon:randomUUID(),pet:randomUUID(),prof:randomUUID(),service:randomUUID(),appointment:randomUUID(),future:randomUUID()};
const password='Business-tests-'+randomUUID(),tag=randomUUID().slice(0,8);
const sourceIp=`2001:db8:${randomUUID().slice(0,4)}:${randomUUID().slice(0,4)}::2`;
const rateKey=createHash('sha256').update('/login:'+sourceIp).digest('hex');
const userIds=[ids.owner,ids.other,ids.inventory,ids.finance],tenantIds=[ids.a,ids.b];
let base='',cookie='',foreignCookie='',inventoryCookie='',financeCookie='';
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;
const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Manaus',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
type Reply={code:number;data:any;headers:Headers};
async function call(path:string,method='GET',body?:unknown,session=cookie):Promise<Reply>{
 const response=await fetch(base+'/api/business'+path,{method,headers:{'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':sourceIp,Cookie:session},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=text;}
 return {code:response.status,data,headers:response.headers};
}
async function login(email:string){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':sourceIp},body:JSON.stringify({email,password})});assert.equal(response.status,200);return (response.headers.get('set-cookie')??'').split(';')[0];}
async function newProduct(stock=5,name='Shampoo '+randomUUID().slice(0,6),session=cookie){const reply=await call('/products','POST',{name,sku:'SKU-'+randomUUID(),unit:'un.',price_cents:1500,cost_cents:700,min_stock:2,initial_stock:stock,idempotency_key:randomUUID()},session);assert.equal(reply.code,201,JSON.stringify(reply.data));return reply.data;}
async function newSale(items:any[],extra:Record<string,unknown>={},session=cookie){const reply=await call('/sales','POST',{tutor_id:ids.tutor,items,discount_cents:0,due_date:day,notes:'Operação de teste',idempotency_key:randomUUID(),...extra},session);assert.equal(reply.code,201,JSON.stringify(reply.data));return reply.data;}
async function newExpense(amount=500,session=cookie){const reply=await call('/expenses','POST',{title:'Materiais de teste',category:'supplies',amount_cents:amount,due_date:day,notes:'',idempotency_key:randomUUID()},session);assert.equal(reply.code,201,JSON.stringify(reply.data));return reply.data;}
async function closeCash(){const current=(await call('/cash')).data.current;if(current){const result=await call(`/cash/${current.id}/close`,'POST',{counted_cents:current.expected_cents,notes:'Conferência de teste',idempotency_key:randomUUID()});assert.equal(result.code,200,JSON.stringify(result.data));}}

describe('Gestão comercial: estoque, caixa, recebimentos e isolamento',{concurrency:false},()=>{
 before(async()=>{
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  await db.query("INSERT INTO tenants(id,name,timezone) VALUES($1,$2,'America/Manaus'),($3,$4,'America/Sao_Paulo')",[ids.a,'Business A '+tag,ids.b,'Business B '+tag]);
  for(const [id,name] of [[ids.owner,'owner'],[ids.other,'other'],[ids.inventory,'inventory'],[ids.finance,'finance']])await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'Teste '+name,`${name}-${tag}@example.test`,hash]);
  await db.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($3,$4,'admin','{}'),($1,$5,'employee',ARRAY['inventory']),($1,$6,'employee',ARRAY['finance'])",[ids.a,ids.owner,ids.b,ids.other,ids.inventory,ids.finance]);
  await db.query('INSERT INTO tutors(id,tenant_id,name) VALUES($1,$2,$3),($4,$5,$6),($7,$2,$8)',[ids.tutor,ids.a,'Cliente Business '+tag,ids.foreignTutor,ids.b,'Outro cliente '+tag,ids.anon,'Titular anonimizado']);
  await db.query('UPDATE tutors SET anonymized_at=now() WHERE id=$1',[ids.anon]);
  await db.query("INSERT INTO pets(id,tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,'Mel Business','Cão','pequeno')",[ids.pet,ids.a,ids.tutor]);
  await db.query("INSERT INTO professionals(id,tenant_id,name) VALUES($1,$2,'Profissional Business')",[ids.prof,ids.a]);
  await db.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes) VALUES($1,$2,'Banho Business',6000,60)",[ids.service,ids.a]);
  for(const [id,offset] of [[ids.appointment,-1],[ids.future,2]] as const){
   await db.query("INSERT INTO appointments(id,tenant_id,tutor_id,pet_id,professional_id,starts_at,ends_at,status,created_by) VALUES($1,$2,$3,$4,$5,now()+($6::int*interval '1 day'),now()+($6::int*interval '1 day')+interval '1 hour','done',$7)",[id,ids.a,ids.tutor,ids.pet,ids.prof,offset,ids.owner]);
   await db.query('INSERT INTO appointment_services(tenant_id,appointment_id,service_id,position,price_cents,duration_minutes) VALUES($1,$2,$3,1,4500,60)',[ids.a,id,ids.service]);
  }
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
  cookie=await login(`owner-${tag}@example.test`);foreignCookie=await login(`other-${tag}@example.test`);inventoryCookie=await login(`inventory-${tag}@example.test`);financeCookie=await login(`finance-${tag}@example.test`);
  for(const sessionCookie of [cookie,foreignCookie]){const response=await fetch(base+'/api/commercial/onboarding',{method:'POST',headers:{'Content-Type':'application/json','X-PetCore-Request':'1',Cookie:sessionCookie},body:JSON.stringify({plan:'free'})});assert.equal(response.status,200);}
 });
 after(async()=>{
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  try{
   for(const table of ['audit_events','business_operations','business_stock_movements','business_ledger','business_sale_items','business_expenses','business_sales','business_cash_sessions','business_products','appointment_services','appointments','pets','professionals','services','tutors','memberships'])await db.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[tenantIds]);
   await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenantIds]);await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[userIds]);
   await db.query('DELETE FROM auth_rate_limits WHERE key=$1',[rateKey]);
  }finally{await appPool.end();await db.end();}
 });

 test('sessão e permissões de estoque e financeiro são independentes',async()=>{
  assert.equal((await call('/products','GET',undefined,'')).code,401);
  assert.equal((await call('/products','GET',undefined,inventoryCookie)).code,200);
  assert.equal((await call('/summary','GET',undefined,inventoryCookie)).code,403);
  assert.equal((await call('/products','GET',undefined,financeCookie)).code,403);
  assert.equal((await call('/summary','GET',undefined,financeCookie)).code,200);
  assert.equal((await call('/options','GET',undefined,financeCookie)).data.timezone,'America/Manaus');
 });
 test('produto, estoque inicial e edição parcial preservam preço, custo e SKU',async()=>{
  const product=await newProduct(5);
  const changed=await call(`/products/${product.id}`,'PATCH',{name:'Produto atualizado'});
  assert.equal(changed.code,200);assert.equal(changed.data.stock_quantity,5);assert.equal(changed.data.price_cents,1500);assert.equal(changed.data.cost_cents,700);assert.equal(changed.data.sku,product.sku);
  const movements=await call(`/stock-movements?product_id=${product.id}`);assert.equal(movements.data.total,1);assert.equal(movements.data.items[0].reason,'initial');
  const duplicate=await call('/products','POST',{name:'Duplicado',sku:product.sku,price_cents:200,idempotency_key:randomUUID()});assert.equal(duplicate.code,422);
 });
 test('movimentação é idempotente, valida o sinal e impede saída concorrente além do saldo',async()=>{
  const product=await newProduct(5),key=randomUUID();
  const payload={quantity_delta:2,reason:'purchase',note:'Compra fictícia',idempotency_key:key};
  const [first,retry]=await Promise.all([call(`/products/${product.id}/movements`,'POST',payload),call(`/products/${product.id}/movements`,'POST',payload)]);
  assert.equal(first.code,201);assert.equal(retry.code,201);assert.equal(first.data.id,retry.data.id);
  assert.equal((await call(`/products/${product.id}/movements`,'POST',{...payload,quantity_delta:3})).code,409);
  assert.equal((await call(`/products/${product.id}/movements`,'POST',{...payload,quantity_delta:-1,idempotency_key:randomUUID()})).code,422);
  const uses=await Promise.all([1,2].map(()=>call(`/products/${product.id}/movements`,'POST',{quantity_delta:-5,reason:'usage',note:'Uso em teste',idempotency_key:randomUUID()})));
  assert.deepEqual(uses.map(value=>value.code).sort(),[201,409]);
  const rows=await call(`/products?q=${encodeURIComponent(product.name)}`);assert.equal(rows.data.items[0].stock_quantity,2);
 });
 test('comanda usa preço do servidor, desconto válido e recebimentos parciais sem duplicação',async()=>{
  const product=await newProduct(5),sale=await newSale([{kind:'product',product_id:product.id,quantity:2},{kind:'service',service_id:ids.service,quantity:1}],{discount_cents:500});
  assert.equal(sale.subtotal_cents,9000);assert.equal(sale.total_cents,8500);assert.equal(sale.balance_cents,8500);
  assert.equal((await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:9000,payment_method:'pix',idempotency_key:randomUUID()})).code,422);
  const key=randomUUID(),payload={amount_cents:3000,payment_method:'pix',idempotency_key:key};
  const [one,two]=await Promise.all([call(`/sales/${sale.id}/payments`,'POST',payload),call(`/sales/${sale.id}/payments`,'POST',payload)]);
  assert.equal(one.code,201);assert.equal(two.code,201);assert.equal(one.data.payment.id,two.data.payment.id);assert.equal(one.data.sale.balance_cents,5500);
  const paid=await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:5500,payment_method:'credit_card',idempotency_key:randomUUID()});assert.equal(paid.data.sale.status,'paid');assert.equal(paid.data.sale.paid_cents,8500);assert.equal(paid.data.sale.balance_cents,0);
  const detail=await call(`/sales/${sale.id}`);assert.equal(detail.data.payments.length,2);assert.equal(detail.data.items.length,2);
  assert.equal((await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:1,payment_method:'pix',idempotency_key:randomUUID()})).code,409);
 });
 test('venda concorrente não pode consumir duas vezes o mesmo estoque',async()=>{
  const product=await newProduct(1);const body={tutor_id:ids.tutor,items:[{kind:'product',product_id:product.id,quantity:1}],due_date:day};
  const replies=await Promise.all([call('/sales','POST',{...body,idempotency_key:randomUUID()}),call('/sales','POST',{...body,idempotency_key:randomUUID()})]);assert.deepEqual(replies.map(value=>value.code).sort(),[201,409]);
  const stock=await db.query('SELECT stock_quantity FROM business_products WHERE id=$1',[product.id]);assert.equal(stock.rows[0].stock_quantity,0);
 });
 test('caixa é único e fechamento usa apenas dinheiro vinculado, sem contar abertura como receita',async()=>{
  await closeCash();const sale=await newSale([{kind:'service',service_id:ids.service,quantity:1}]);
  assert.equal((await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:2000,payment_method:'cash',idempotency_key:randomUUID()})).code,409);
  const before=(await call(`/summary?from=${day}&to=${day}`)).data.totals.receipts_cents;
  const key=randomUUID(),open={opening_cents:1000,notes:'Troco inicial',idempotency_key:key};const opened=await call('/cash/open','POST',open);assert.equal(opened.code,201);
  assert.equal((await call('/cash/open','POST',open)).data.id,opened.data.id);assert.equal((await call('/cash/open','POST',{...open,idempotency_key:randomUUID()})).code,409);
  assert.equal((await call(`/summary?from=${day}&to=${day}`)).data.totals.receipts_cents,before);
  assert.equal((await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:2000,payment_method:'cash',idempotency_key:randomUUID()})).code,201);
  const expense=await newExpense(500);assert.equal((await call(`/expenses/${expense.id}/pay`,'POST',{payment_method:'cash',idempotency_key:randomUUID()})).code,200);
  assert.equal((await call('/cash')).data.current.expected_cents,2500);
  const close={counted_cents:2400,notes:'Diferença conferida',idempotency_key:randomUUID()};const closed=await call(`/cash/${opened.data.id}/close`,'POST',close);assert.equal(closed.code,200);assert.equal(closed.data.expected_cents,2500);assert.equal(closed.data.difference_cents,-100);
  assert.equal((await call(`/cash/${opened.data.id}/close`,'POST',close)).code,200);assert.equal((await call(`/cash/${opened.data.id}/close`,'POST',{...close,idempotency_key:randomUUID()})).code,409);assert.equal((await call('/cash')).data.current,null);
 });
 test('cancelamento compensa recebimentos e recompõe estoque uma única vez',async()=>{
  await closeCash();const opened=await call('/cash/open','POST',{opening_cents:2000,idempotency_key:randomUUID()});assert.equal(opened.code,201);
  const product=await newProduct(4),sale=await newSale([{kind:'product',product_id:product.id,quantity:2}]);
  assert.equal((await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:800,payment_method:'cash',idempotency_key:randomUUID()})).code,201);
  assert.equal((await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:1000,payment_method:'pix',idempotency_key:randomUUID()})).code,201);
  const cancel={reason:'Venda cancelada em teste',idempotency_key:randomUUID()};const cancelled=await call(`/sales/${sale.id}/cancel`,'POST',cancel);assert.equal(cancelled.code,200);assert.equal(cancelled.data.status,'cancelled');assert.equal(cancelled.data.paid_cents,0);assert.equal(cancelled.data.balance_cents,0);
  assert.equal((await call(`/sales/${sale.id}/cancel`,'POST',cancel)).code,200);assert.equal((await call(`/sales/${sale.id}/cancel`,'POST',{...cancel,idempotency_key:randomUUID()})).code,200);
  const detail=(await call(`/sales/${sale.id}`)).data;assert.equal(detail.payments.length,4);assert.equal(detail.payments.filter((entry:any)=>entry.kind==='sale_refund').reduce((sum:number,entry:any)=>sum+entry.amount_cents,0),1800);
  const stock=await db.query('SELECT stock_quantity FROM business_products WHERE id=$1',[product.id]);assert.equal(stock.rows[0].stock_quantity,4);assert.equal((await call('/cash')).data.current.expected_cents,2000);await closeCash();
 });
 test('despesa paga pode ser compensada, mantendo os lançamentos anteriores imutáveis',async()=>{
  const expense=await newExpense(6500);const paid=await call(`/expenses/${expense.id}/pay`,'POST',{payment_method:'pix',idempotency_key:randomUUID()});assert.equal(paid.code,200);assert.equal(paid.data.status,'paid');
  const cancelled=await call(`/expenses/${expense.id}/cancel`,'POST',{reason:'Reembolso do fornecedor fictício',idempotency_key:randomUUID()});assert.equal(cancelled.code,200);assert.equal(cancelled.data.status,'cancelled');
  const ledger=await db.query('SELECT kind,amount_cents FROM business_ledger WHERE tenant_id=$1 AND expense_id=$2 ORDER BY created_at,id',[ids.a,expense.id]);assert.equal(ledger.rows.length,2);assert.deepEqual(ledger.rows.map(row=>row.kind).sort(),['expense_payment','expense_refund']);
  await assert.rejects(()=>db.query('UPDATE business_ledger SET amount_cents=1 WHERE tenant_id=$1 AND expense_id=$2',[ids.a,expense.id]),(error:any)=>error.code==='55000');
 });
 test('falha de estorno em dinheiro não deixa cancelamento, estoque ou ledger pela metade',async()=>{
  await closeCash();await call('/cash/open','POST',{opening_cents:0,idempotency_key:randomUUID()});
  const product=await newProduct(2),sale=await newSale([{kind:'product',product_id:product.id,quantity:1}]);
  await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:1500,payment_method:'cash',idempotency_key:randomUUID()});
  const expense=await newExpense(1400);await call(`/expenses/${expense.id}/pay`,'POST',{payment_method:'cash',idempotency_key:randomUUID()});
  const cancelled=await call(`/sales/${sale.id}/cancel`,'POST',{reason:'Sem saldo para devolver',idempotency_key:randomUUID()});assert.equal(cancelled.code,409);
  const detail=(await call(`/sales/${sale.id}`)).data;assert.equal(detail.sale.status,'paid');assert.equal(detail.payments.length,1);
  assert.equal((await db.query('SELECT stock_quantity FROM business_products WHERE id=$1',[product.id])).rows[0].stock_quantity,1);await closeCash();
 });
 test('comanda de atendimento usa snapshot, não o preço atual, e só pode ser criada uma vez',async()=>{
  const imported=await newSale([],{appointment_id:ids.appointment});assert.equal(imported.total_cents,4500);assert.equal(imported.appointment_id,ids.appointment);
  const duplicate=await call('/sales','POST',{appointment_id:ids.appointment,due_date:day,idempotency_key:randomUUID()});assert.equal(duplicate.code,409);
  const future=await call('/sales','POST',{appointment_id:ids.future,due_date:day,idempotency_key:randomUUID()});assert.equal(future.code,422);
  const anon=await call('/sales','POST',{tutor_id:ids.anon,items:[{kind:'service',service_id:ids.service,quantity:1}],due_date:day,idempotency_key:randomUUID()});assert.equal(anon.code,409);
 });
 test('IDs alheios não expõem nem alteram produtos, vendas, despesas, caixa ou tutores',async()=>{
  const product=await newProduct(3),sale=await newSale([{kind:'service',service_id:ids.service,quantity:1}]),expense=await newExpense();
  assert.equal((await call(`/products/${product.id}`,'PATCH',{name:'Acesso indevido'},foreignCookie)).code,404);
  assert.equal((await call(`/products/${product.id}/movements`,'POST',{quantity_delta:1,reason:'purchase',note:'Teste',idempotency_key:randomUUID()},foreignCookie)).code,404);
  assert.equal((await call(`/sales/${sale.id}`,'GET',undefined,foreignCookie)).code,404);
  assert.equal((await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:100,payment_method:'pix',idempotency_key:randomUUID()},foreignCookie)).code,404);
  assert.equal((await call(`/expenses/${expense.id}/pay`,'POST',{payment_method:'pix',idempotency_key:randomUUID()},foreignCookie)).code,404);
  assert.equal((await call('/sales','POST',{tutor_id:ids.foreignTutor,items:[{kind:'service',service_id:ids.service,quantity:1}],due_date:day,idempotency_key:randomUUID()})).code,404);
  assert.equal((await call('/sales','GET',undefined,foreignCookie)).data.total,0);assert.equal((await call('/products','GET',undefined,foreignCookie)).data.total,0);
 });
 test('validação recusa preços/empresa forjados, PAN de cartão e períodos inválidos',async()=>{
  assert.equal((await call('/products','POST',{name:'Teste',price_cents:10,tenant_id:ids.b,idempotency_key:randomUUID()})).code,422);
  assert.equal((await call('/sales','POST',{items:[{kind:'service',service_id:ids.service,quantity:1,unit_price_cents:1}],due_date:day,idempotency_key:randomUUID()})).code,422);
  const sale=await newSale([{kind:'service',service_id:ids.service,quantity:1}]);
  assert.equal((await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:20.5,payment_method:'credit_card',idempotency_key:randomUUID()})).code,422);
  assert.equal((await call(`/sales/${sale.id}/payments`,'POST',{amount_cents:20,payment_method:'credit_card',card_number:'0000000000000000',idempotency_key:randomUUID()})).code,422);
  assert.equal((await call('/summary?from=2020-01-01&to=2026-01-01')).code,422);assert.equal((await call('/summary?from=2026-12-31&to=2026-01-01')).code,422);assert.equal((await call('/sales?page_size=101')).code,422);
 });
 test('relatórios distinguem recebimentos, comandas e valores de serviços; CSV neutraliza fórmulas',async()=>{
  const report=await call(`/reports?from=${day}&to=${day}`);assert.equal(report.code,200);assert.equal(report.data.timezone,'America/Manaus');assert.ok(report.data.sales.count>0);assert.ok(report.data.financial.receipts_cents>0);assert.ok(Array.isArray(report.data.professionals));
  const summary=await call(`/summary?from=${day}&to=${day}`);assert.equal(summary.data.daily.length,1);assert.equal(summary.data.daily[0].date,day);const totals=summary.data.totals;assert.equal(totals.net_cents,totals.receipts_cents-totals.refunds_cents-totals.expenses_cents+totals.expense_refunds_cents);
  await newProduct(1,'=HYPERLINK("https://example.invalid")');
  const exported=await call(`/reports/export?kind=stock&from=${day}&to=${day}`);assert.equal(exported.code,200);assert.match(exported.headers.get('content-type')??'',/text\/csv/);assert.equal(typeof exported.data,'string');assert.ok(exported.data.includes("'=HYPERLINK"));
  const audit=await db.query("SELECT count(*)::int AS n FROM audit_events WHERE tenant_id=$1 AND action='business.export'",[ids.a]);assert.ok(audit.rows[0].n>=1);
 });
 test('paginação mantém total e lista vazia sem reduzir indicadores globais de estoque',async()=>{
  const list=await call('/products?page=1&page_size=1');assert.equal(list.code,200);assert.equal(list.data.items.length,1);assert.ok(list.data.total>1);assert.equal(list.data.pageSize,1);
  const empty=await call('/products?page=999&page_size=100');assert.equal(empty.code,200);assert.equal(empty.data.items.length,0);assert.equal(empty.data.total,list.data.total);
  const low=await call('/products?low_stock=true');assert.ok(low.data.items.every((item:any)=>item.stock_quantity<=item.min_stock));assert.equal(low.data.summary.products,list.data.summary.products);
 });
});
