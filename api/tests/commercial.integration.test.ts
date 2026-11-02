// Suíte serial: modifica as configurações globais APENAS num banco *_test e
// restaura integralmente a linha e os planos no encerramento, inclusive em falha.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Comercial: TEST_DATABASE_URL deve apontar para PostgreSQL exclusivo terminado em _test.');
process.env.DATABASE_URL=testUrl;process.env.NODE_ENV='test';
process.env.SESSION_SECRET='commercial-isolated-test-only-'+randomUUID()+randomUUID();
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:testUrl,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const originalFetch=globalThis.fetch;
const outboundRequests:string[]=[];
const tag=randomUUID().slice(0,8),password='Commercial-fixtures-'+randomUUID();
const sourceIp=`2001:db8:${randomUUID().slice(0,4)}:${randomUUID().slice(0,4)}::3`;
const hashKey=(text:string)=>createHash('sha256').update(text).digest('hex');
const ids={a:randomUUID(),b:randomUUID(),c:randomUUID(),d:randomUUID(),e:randomUUID(),ownerA:randomUUID(),ownerB:randomUUID(),ownerC:randomUUID(),ownerD:randomUUID(),ownerE:randomUUID(),staffA:randomUUID(),staffA2:randomUUID(),platform:randomUUID(),publisher:randomUUID()};
const tenantIds=[ids.a,ids.b,ids.c,ids.d,ids.e];
const people=['ownerA','ownerB','ownerC','ownerD','ownerE','staffA','staffA2','platform','publisher'] as const;
const userIds=people.map(person=>ids[person]);
const sessions:Record<string,string>={};
let base='',server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;
let settingsSnapshot:any=null,planSnapshot:any[]=[];
let firstPayment:any=null,renewalPayment:any=null;
let publishedVersion='';
const today=new Date().toISOString().slice(0,10);
const fakePrivacy=('Documento exclusivamente fictício da suíte local. O controlador de testes informa finalidades, atendimento aos titulares, proteção, retenção e contato. Não representa política publicada de nenhuma empresa real. ').repeat(6);
const fakeTerms=('Termos exclusivamente fictícios da suíte local. As condições descrevem a operação técnica do teste isolado, preço, cancelamento, acesso e suporte. Não representam contratação nem aceitação de serviço real. ').repeat(6);
const configPayload=(changes:Record<string,unknown>={})=>({brand:'Marca fictícia',legal_name:'Operador fictício dos testes locais',support_email:'suporte@example.test',privacy_email:'privacidade@example.test',address:'Endereço fictício para teste isolado',privacy_text:fakePrivacy,terms_text:fakeTerms,published:true,effective_date:today,subprocessors:[{name:'Fornecedor fictício',purpose:'Execução de teste local sem dados reais',location:'Brasil - simulação local'}],trial_days:30,grace_days:0,review_confirmed:true,password,...changes});
type Reply={code:number;data:any;headers:Headers};
async function request(path:string,method='GET',body?:unknown,session=sessions.ownerA):Promise<Reply>{
 const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':sourceIp,Cookie:session??''},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data:any;try{data=text?JSON.parse(text):{};}catch{data=text;}
 return {code:response.status,data,headers:response.headers};
}
const api=(path:string,method='GET',body?:unknown,session=sessions.ownerA)=>request('/commercial'+path,method,body,session);
async function platformPayment(company:string,reference:string,extra:Record<string,unknown>={}){
 return api(`/platform/subscriptions/${company}/payments`,'POST',{plan_id:'monthly',amount_cents:3500,provider_reference:reference,received_at:new Date().toISOString(),idempotency_key:randomUUID(),confirmed_in_pagbank:true,...extra},sessions.platform);
}
async function restoreGlobalSettings(){
 if(settingsSnapshot){
  const fields=['brand','legal_name','support_email','privacy_email','address','privacy_text','terms_text','published','legal_version','effective_date','subprocessors','trial_days','grace_days','updated_at','updated_by'];
  await db.query(`UPDATE commercial_settings SET ${fields.map((field,index)=>`${field}=$${index+1}`).join(',')} WHERE singleton=true`,fields.map(field=>field==='subprocessors'?JSON.stringify(settingsSnapshot[field]):settingsSnapshot[field]));
 }
 for(const plan of planSnapshot)await db.query('UPDATE subscription_plans SET name=$2,amount_cents=$3,interval_months=$4,checkout_url=$5,checkout_reviewed=$6,active=$7,updated_at=$8 WHERE id=$1',[plan.id,plan.name,plan.amount_cents,plan.interval_months,plan.checkout_url,plan.checkout_reviewed,plan.active,plan.updated_at]);
}

describe('Comercial: primeiro acesso, planos, conciliação, suporte e termos',{concurrency:false},()=>{
 before(async()=>{
  settingsSnapshot=(await db.query('SELECT * FROM commercial_settings WHERE singleton=true')).rows[0];assert.ok(settingsSnapshot);
  planSnapshot=(await db.query('SELECT * FROM subscription_plans ORDER BY id')).rows;
  await db.query("UPDATE commercial_settings SET published=false,trial_days=30,grace_days=0 WHERE singleton=true");
  await db.query("UPDATE subscription_plans SET amount_cents=CASE WHEN id='monthly' THEN 3500 ELSE 35000 END,active=true,checkout_reviewed=false,checkout_url=NULL");
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  for(const id of tenantIds)await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[id,'Comercial fictício '+tag+' '+id.slice(0,4)]);
  for(const person of people)await db.query('INSERT INTO users(id,name,email,password_hash,is_platform_owner) VALUES($1,$2,$3,$4,$5)',[ids[person],'Usuário de teste '+person,`${person.toLowerCase()}-${tag}@example.test`,hash,person==='platform'||person==='publisher']);
  for(const [company,owner] of [[ids.a,ids.ownerA],[ids.b,ids.ownerB],[ids.c,ids.ownerC],[ids.d,ids.ownerD],[ids.e,ids.ownerE]])await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",[company,owner]);
  for(const user of [ids.staffA,ids.staffA2])await db.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'employee',ARRAY['tutors','finance'])",[ids.a,user]);
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
  // Nem cobranças nem estornos reais podem sair deste teste: apenas HTTP para
  // o próprio servidor efêmero é permitido. Qualquer saída é registrada e falha.
  globalThis.fetch=(...args:Parameters<typeof fetch>)=>{const input=args[0];const url=input instanceof URL?input.href:typeof input==='string'?input:input.url;if(new URL(url).origin!==base){outboundRequests.push(new URL(url).origin);return Promise.reject(new Error('Teste comercial bloqueou acesso externo.'));}return originalFetch(...args);};
  for(const person of people){const reply=await request('/auth/login','POST',{email:`${person.toLowerCase()}-${tag}@example.test`,password},'');assert.equal(reply.code,200,JSON.stringify(reply.data));sessions[person]=(reply.headers.get('set-cookie')??'').split(';')[0];assert.ok(sessions[person]);}
 });
 after(async()=>{
  globalThis.fetch=originalFetch;
  if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  try{
   await restoreGlobalSettings();
   await db.query('DELETE FROM audit_events WHERE tenant_id=ANY($1::uuid[]) OR actor_user_id=ANY($2::uuid[])',[tenantIds,userIds]);
   await db.query('DELETE FROM support_messages WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);await db.query('DELETE FROM support_tickets WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);
   await db.query('DELETE FROM subscription_payments WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);await db.query('DELETE FROM tenant_subscriptions WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);
   await db.query('DELETE FROM terms_acceptances WHERE user_id=ANY($1::uuid[])',[userIds]);
   await db.query('DELETE FROM tutors WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);
   await db.query('DELETE FROM memberships WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenantIds]);await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[userIds]);
   await db.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[[hashKey('/login:'+sourceIp),...userIds.map(id=>hashKey('sensitive-action:'+id))]]);
  }finally{await appPool.end();await db.end();}
 });

 test('sessão informa onboarding pendente e bloqueia mutação antes de escolher um plano',async()=>{
  const me=await request('/auth/me');assert.equal(me.code,200);assert.equal(me.data.subscription.onboarding_completed_at,null);assert.equal(me.data.subscription.writable,false);assert.equal(me.data.legal.required,false);
  assert.equal((await request('/data/tutors','POST',{name:'Cadastro de teste antes do plano'})).code,428);
  assert.equal((await api('/me','GET',undefined,'')).code,401);
  const employee=await api('/onboarding','POST',{plan:'free'},sessions.staffA);assert.equal(employee.code,403);
 });
 test('plano gratuito inicia uma única experiência de 30 dias',async()=>{
  const reply=await api('/onboarding','POST',{plan:'free'});assert.equal(reply.code,200);assert.equal(reply.data.plan,'free');assert.equal(reply.data.checkout_url,null);
  const current=(await api('/me')).data.subscription;assert.equal(current.status,'trial');assert.equal(current.onboarding_plan,'free');assert.equal(current.writable,true);assert.ok(current.trial_started_at);
  assert.ok(Math.abs(new Date(current.trial_ends_at).getTime()-new Date(current.trial_started_at).getTime()-30*86400000)<2000);
  assert.equal((await api('/onboarding','POST',{plan:'free'})).code,409);assert.equal((await api('/me')).data.subscription.trial_ends_at,current.trial_ends_at);
  assert.equal((await api('/choose-plan','POST',{plan_id:'yearly'},sessions.staffA)).code,403);
 });
 test('escolher mensal ou anual não concede período gratuito nem ativa acesso sem recebimento',async()=>{
  for(const [person,plan,amount] of [['ownerB','monthly',3500],['ownerC','yearly',35000]] as const){
   const reply=await api('/onboarding','POST',{plan},sessions[person]);assert.equal(reply.code,200);assert.equal(reply.data.checkout_url,null);
   const me=(await api('/me','GET',undefined,sessions[person])).data;assert.equal(me.subscription.status,'pending');assert.equal(me.subscription.plan_id,plan);assert.equal(me.subscription.amount_cents,amount);assert.equal(me.subscription.trial_started_at,null);assert.equal(me.subscription.writable,false);
   assert.ok(new Date(me.subscription.trial_ends_at).getTime()<=Date.now()+1000);
   assert.equal((await request('/data/tutors','POST',{name:'Sem recebimento'},sessions[person])).code,402);
  }
  assert.equal((await api('/choose-plan','POST',{plan_id:'yearly'},sessions.ownerB)).code,200);
  assert.equal((await api('/me','GET',undefined,sessions.ownerB)).data.subscription.writable,false);
  await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerB);
 });
 test('experiência expirada mantém consulta e suporte, mas não pode ser renovada por onboarding',async()=>{
  await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()-interval '2 days' WHERE tenant_id=$1",[ids.a]);
  assert.equal((await api('/me')).data.subscription.writable,false);assert.equal((await request('/data/tutors','GET')).code,200);
  assert.equal((await request('/data/tutors','POST',{name:'Cadastro sem acesso'})).code,402);
  assert.equal((await api('/onboarding','POST',{plan:'free'})).code,409);
  const support=await api('/support','POST',{subject:'Acesso em teste expirado',category:'billing',body:'Solicitação fictícia para conferir o canal de suporte.'});assert.equal(support.code,201);
 });
 test('somente a plataforma configura planos; URLs não oficiais e revisões sem link são recusadas',async()=>{
  assert.equal((await api('/platform/settings')).code,403);assert.equal((await api('/platform/subscriptions')).code,403);
  const plan={name:'Mensal fictício',amount_cents:3500,checkout_url:'javascript:alert(1)',checkout_reviewed:true,active:true};
  assert.equal((await api('/platform/plans/monthly','PATCH',plan,sessions.platform)).code,422);
  assert.equal((await api('/platform/plans/monthly','PATCH',{...plan,checkout_url:'https://pag.ae.evil.example/checkout'},sessions.platform)).code,422);
  assert.equal((await api('/platform/plans/monthly','PATCH',{...plan,checkout_url:null},sessions.platform)).code,422);
  const valid=await api('/platform/plans/monthly','PATCH',{...plan,checkout_url:'https://pag.ae/commercial-test-monthly'},sessions.platform);assert.equal(valid.code,200);
  const me=(await api('/me','GET',undefined,sessions.ownerB)).data;assert.equal(me.plans.find((item:any)=>item.id==='monthly').checkout_url,null,'Link revisado não é divulgado enquanto os documentos não estiverem publicados.');
  const settings=await api('/platform/settings','GET',undefined,sessions.platform);assert.equal(settings.code,200);assert.equal(settings.data.plans.length,2);
 });
 test('conciliação manual exige confirmação e valor integral; repetição não dobra pagamento nem período',async()=>{
  const ref='COMERCIAL-'+tag+'-PAY-1',key=randomUUID(),received=new Date().toISOString();
  const body={plan_id:'monthly',amount_cents:3500,provider_reference:ref,received_at:received,idempotency_key:key,confirmed_in_pagbank:true};
  const path=`/platform/subscriptions/${ids.b}/payments`;
  assert.equal((await api(path,'POST',body,sessions.ownerB)).code,403);assert.equal((await api(path,'POST',{...body,confirmed_in_pagbank:false},sessions.platform)).code,422);
  assert.equal((await api(path,'POST',{...body,amount_cents:1,idempotency_key:randomUUID()},sessions.platform)).code,422);
  assert.equal((await api(path,'POST',{...body,received_at:new Date(Date.now()+3600000).toISOString(),idempotency_key:randomUUID()},sessions.platform)).code,422);
  const [first,retry]=await Promise.all([api(path,'POST',body,sessions.platform),api(path,'POST',body,sessions.platform)]);assert.equal(first.code,201,JSON.stringify(first.data));assert.equal(retry.code,201);assert.equal(first.data.id,retry.data.id);firstPayment=first.data;
  assert.equal((await api(path,'POST',{...body,amount_cents:35000},sessions.platform)).code,409);
  const rows=await db.query('SELECT count(*)::int AS n FROM subscription_payments WHERE tenant_id=$1',[ids.b]);assert.equal(rows.rows[0].n,1);
  const current=(await api('/me','GET',undefined,sessions.ownerB)).data;assert.equal(current.subscription.status,'active');assert.equal(current.subscription.writable,true);assert.equal(current.subscription.paid_through,firstPayment.period_end);
  const reused=await platformPayment(ids.e,ref);assert.ok([409,422].includes(reused.code));assert.equal((await api('/me','GET',undefined,sessions.ownerE)).data.payments.length,0);
  const renewed=await platformPayment(ids.b,'COMERCIAL-'+tag+'-PAY-2');assert.equal(renewed.code,201);renewalPayment=renewed.data;assert.equal(renewalPayment.period_start,firstPayment.period_end);assert.ok(new Date(renewalPayment.period_end)>new Date(firstPayment.period_end));
 });
 test('recebimento confirmado antes do primeiro acesso continua válido após escolher o plano',async()=>{
  const payment=await platformPayment(ids.d,'COMERCIAL-'+tag+'-PREPAID');assert.equal(payment.code,201);
  const before=(await api('/me','GET',undefined,sessions.ownerD)).data.subscription;assert.equal(before.onboarding_completed_at,null);assert.equal(before.writable,false);
  const onboard=await api('/onboarding','POST',{plan:'monthly'},sessions.ownerD);assert.equal(onboard.code,200);
  const after=(await api('/me','GET',undefined,sessions.ownerD)).data.subscription;assert.equal(after.paid_through,payment.data.period_end);assert.equal(after.status,'active');assert.equal(after.writable,true,'Um pagamento já conciliado não pode ser descartado pelo primeiro acesso.');
 });
 test('invalidação de recebimento requer senha e é idempotente, sem executar estorno no PagBank',async()=>{
  assert.ok(renewalPayment);const path=`/platform/payments/${renewalPayment.id}/void`;
  assert.equal((await api(path,'POST',{reason:'Registro de teste incorreto',password:'Senha-incorreta'},sessions.platform)).code,403);
  const result=await api(path,'POST',{reason:'Registro de teste incorreto',password},sessions.platform);assert.equal(result.code,200);assert.match(result.data.message,/PagBank/);
  assert.equal((await api(path,'POST',{reason:'Registro de teste incorreto',password},sessions.platform)).code,200);
  const stored=(await db.query('SELECT * FROM subscription_payments WHERE id=$1',[renewalPayment.id])).rows[0];assert.ok(stored.voided_at);assert.equal(stored.provider_reference,renewalPayment.provider_reference);
  const current=(await api('/platform/subscriptions/'+ids.b,'GET',undefined,sessions.platform)).data;assert.equal(current.subscription.paid_through,firstPayment.period_end);assert.equal(current.payments.length,2);
  const events=await db.query("SELECT count(*)::int AS n FROM audit_events WHERE entity_id=$1 AND action='subscription.payment_voided'",[renewalPayment.id]);assert.equal(events.rows[0].n,1);assert.deepEqual(outboundRequests,[]);
 });
 test('suspensão é exclusiva da plataforma e não impede acesso ao faturamento ou suporte',async()=>{
  const path=`/platform/subscriptions/${ids.b}/status`,payload={status:'suspended',reason:'Pausa explícita de teste',password};
  assert.equal((await api(path,'PATCH',payload,sessions.ownerB)).code,403);
  assert.equal((await api(path,'PATCH',payload,sessions.platform)).code,200);assert.equal((await api('/me','GET',undefined,sessions.ownerB)).data.subscription.writable,false);
  assert.equal((await request('/data/tutors','POST',{name:'Bloqueado durante suspensão'},sessions.ownerB)).code,402);
  assert.equal((await api('/support','POST',{subject:'Suporte durante pausa',category:'access',body:'Mensagem fictícia durante suspensão.'},sessions.ownerB)).code,201);
  assert.equal((await api(path,'PATCH',{...payload,status:'active'},sessions.platform)).code,200);assert.equal((await api('/me','GET',undefined,sessions.ownerB)).data.subscription.writable,true);
 });
 test('suporte isola empresas e funcionários; somente a plataforma responde com mudança de situação',async()=>{
  const employee=await api('/support','POST',{subject:'Solicitação do funcionário',category:'technical',body:'Problema fictício para teste da caixa de entrada.'},sessions.staffA);assert.equal(employee.code,201);
  const other=await api('/support','POST',{subject:'Solicitação de outro funcionário',category:'other',body:'Outra mensagem fictícia, sem dados reais.'},sessions.staffA2);assert.equal(other.code,201);
  const own=(await api('/support','GET',undefined,sessions.staffA)).data;assert.equal(own.total,1);assert.equal(own.items[0].id,employee.data.id);
  assert.equal((await api('/support/'+other.data.id,'GET',undefined,sessions.staffA)).code,404);assert.equal((await api('/support/'+employee.data.id,'GET',undefined,sessions.ownerB)).code,404);
  assert.equal((await api('/support/'+employee.data.id,'GET')).code,200);
  assert.equal((await api(`/support/${employee.data.id}/messages`,'POST',{body:'Tentativa de alterar estado',status:'resolved'},sessions.staffA)).code,403);
  const reply=await api(`/support/${employee.data.id}/messages`,'POST',{body:'Resposta fictícia do suporte técnico.',status:'resolved'},sessions.platform);assert.equal(reply.code,201);
  const ticket=(await api('/support/'+employee.data.id,'GET',undefined,sessions.staffA)).data;assert.equal(ticket.ticket.status,'resolved');assert.equal(ticket.messages.length,2);assert.equal(ticket.messages[1].from_platform,true);
 });
 test('auditoria é restrita aos administradores e sempre à empresa autorizada',async()=>{
  assert.equal((await api('/audit','GET',undefined,sessions.staffA)).code,403);
  const admin=(await api('/audit?page_size=100')).data;assert.ok(admin.total>0);assert.ok(admin.items.every((event:any)=>event.tenant_id===ids.a));assert.ok(admin.items.every((event:any)=>!('password' in event.metadata)));
  const platform=await api('/audit?page_size=100','GET',undefined,sessions.platform);assert.equal(platform.code,200);assert.ok(platform.data.total>=admin.total);
  const company=await api('/platform/subscriptions/'+ids.a,'GET',undefined,sessions.platform);assert.equal(company.code,200);assert.equal(company.data.company.id,ids.a);
  assert.equal((await api('/platform/subscriptions/'+ids.a,'GET',undefined,sessions.ownerB)).code,403);
 });
 test('publicação jurídica exige identificação, revisão, documentos completos e reautenticação',async()=>{
  const endpoint='/platform/settings';
  assert.equal((await api(endpoint,'PUT',configPayload({review_confirmed:false}),sessions.publisher)).code,422);
  assert.equal((await api(endpoint,'PUT',configPayload({privacy_email:''}),sessions.publisher)).code,422);
  assert.equal((await api(endpoint,'PUT',configPayload({privacy_text:fakePrivacy+' [EMPRESA]'}),sessions.publisher)).code,422);
  assert.equal((await api(endpoint,'PUT',configPayload({password:'Senha-incorreta'}),sessions.publisher)).code,403);
  const published=await api(endpoint,'PUT',configPayload(),sessions.publisher);assert.equal(published.code,200,JSON.stringify(published.data));publishedVersion=published.data.version;assert.ok(publishedVersion);
  const publicLegal=await request('/public/legal','GET',undefined,'');assert.equal(publicLegal.code,200);assert.equal(publicLegal.data.published,true);assert.equal(publicLegal.data.version,publishedVersion);assert.equal(publicLegal.data.operator.legalName,'Operador fictício dos testes locais');assert.equal(publicLegal.headers.get('cache-control'),'no-store');
  const me=(await request('/auth/me','GET',undefined,sessions.ownerB)).data;assert.equal(me.legal.required,true);assert.equal(me.legal.version,publishedVersion);
 });
 test('termos atuais são aceitos explicitamente; link só aparece ao administrador com revisão e publicação',async()=>{
  assert.equal((await request('/data/tutors','POST',{name:'Pendente de aceite'},sessions.ownerB)).code,428);
  assert.equal((await api('/accept-terms','POST',{version:'desatualizada',accepted:true},sessions.ownerB)).code,409);
  assert.equal((await api('/accept-terms','POST',{version:publishedVersion,accepted:false},sessions.ownerB)).code,422);
  assert.equal((await api('/accept-terms','POST',{version:publishedVersion,accepted:true},sessions.ownerB)).code,200);
  assert.equal((await api('/accept-terms','POST',{version:publishedVersion,accepted:true},sessions.ownerB)).code,200);
  const acceptances=await db.query('SELECT count(*)::int AS n FROM terms_acceptances WHERE user_id=$1 AND version=$2',[ids.ownerB,publishedVersion]);assert.equal(acceptances.rows[0].n,1);
  assert.equal((await request('/auth/me','GET',undefined,sessions.ownerB)).data.legal.required,false);
  assert.equal((await request('/data/tutors','POST',{name:'Tutor fictício após aceite'},sessions.ownerB)).code,201);
  const admin=(await api('/me','GET',undefined,sessions.ownerB)).data;assert.equal(admin.plans.find((plan:any)=>plan.id==='monthly').checkout_url,'https://pag.ae/commercial-test-monthly');
  const staff=(await api('/me','GET',undefined,sessions.staffA)).data;assert.equal(staff.canManage,false);assert.equal(staff.payments.length,0);assert.ok(staff.plans.every((plan:any)=>plan.checkout_url===null));
 });
 test('mudança real de versão exige novo aceite sem apagar o anterior nem fazer chamadas externas',async()=>{
  const changed=await api('/platform/settings','PUT',configPayload({privacy_text:fakePrivacy+' Atualização fictícia de transparência.'}),sessions.publisher);assert.equal(changed.code,200);assert.notEqual(changed.data.version,publishedVersion);
  const me=(await request('/auth/me','GET',undefined,sessions.ownerB)).data;assert.equal(me.legal.required,true);assert.equal(me.legal.version,changed.data.version);
  assert.equal((await api('/accept-terms','POST',{version:publishedVersion,accepted:true},sessions.ownerB)).code,409);
  const old=await db.query('SELECT count(*)::int AS n FROM terms_acceptances WHERE user_id=$1 AND version=$2',[ids.ownerB,publishedVersion]);assert.equal(old.rows[0].n,1);
  assert.deepEqual(outboundRequests,[]);
 });
});
