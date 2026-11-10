// Suíte serial: modifica as configurações globais APENAS num banco *_test e
// restaura integralmente a linha e os planos no encerramento, inclusive em falha.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import argon2 from 'argon2';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Comercial: TEST_DATABASE_URL deve apontar para PostgreSQL exclusivo terminado em _test.');
process.env.DATABASE_URL=testUrl;process.env.NODE_ENV='test';
process.env.SESSION_SECRET='commercial-isolated-test-only-'+randomUUID()+randomUUID();
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
const {createApp,validateRuntimeConfiguration}=await import('../src/server.js');
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
async function resetFixtureReauthentication(){
 await db.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[[ids.platform,ids.publisher].map(id=>hashKey('sensitive-action:'+id))]);
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
  await db.query("UPDATE commercial_settings SET published=false,trial_days=30,grace_days=3 WHERE singleton=true");
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

 test('migração de contatos preenche ausências, preserva canais personalizados e não publica documentos',async()=>{
  const migration=await readFile(new URL('../sql/010_contact.sql',import.meta.url),'utf8');
  const client=await db.connect();
  try{
   await client.query('BEGIN');
   await client.query("UPDATE commercial_settings SET support_email='personalizado@example.test',privacy_email=NULL,published=false,legal_name='Identidade em revisão' WHERE singleton=true");
   await client.query(migration);
   let current=(await client.query('SELECT support_email,privacy_email,published,legal_name FROM commercial_settings WHERE singleton=true')).rows[0];
   assert.equal(current.support_email,'personalizado@example.test');assert.equal(current.privacy_email,'tigertechbr@outlook.com');
   assert.equal(current.published,false);assert.equal(current.legal_name,'Identidade em revisão');
   await client.query("UPDATE commercial_settings SET support_email=NULL,privacy_email='privacidade-personalizada@example.test' WHERE singleton=true");
   await client.query(migration);
   current=(await client.query('SELECT support_email,privacy_email FROM commercial_settings WHERE singleton=true')).rows[0];
   assert.equal(current.support_email,'tigertechbr@outlook.com');assert.equal(current.privacy_email,'privacidade-personalizada@example.test');
  }finally{await client.query('ROLLBACK');client.release();}
 });
 test('produção exige origem HTTPS explícita; criação do app em testes continua independente dela',()=>{
  for(const origin of [undefined,'','http://petcore.example.test','https://*.example.test','https://usuario:senha@example.test','https://example.test/caminho','https://example.test?origem=outra','https://example.test#fragmento']){
   assert.throws(()=>validateRuntimeConfiguration({NODE_ENV:'production',APP_ORIGIN:origin}),/APP_ORIGIN/);
  }
  assert.doesNotThrow(()=>validateRuntimeConfiguration({NODE_ENV:'production',APP_ORIGIN:'https://petcore.example.test/'}));
  assert.doesNotThrow(()=>validateRuntimeConfiguration({NODE_ENV:'test'}));
 });
 test('respostas de sucesso e erro da API não são armazenadas e recebem correlação emitida pelo servidor',async()=>{
  const headers={'X-Request-Id':'do-not-echo-user-controlled-request-id'};
  const success=await fetch(base+'/api/public/legal',{headers});
  const invalid=await fetch(base+'/api/auth/login',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{'});
  assert.equal(success.status,200);assert.equal(invalid.status,400);
  const requestIds=[];
  for(const response of [success,invalid]){
   assert.equal(response.headers.get('cache-control'),'no-store');
   const id=response.headers.get('x-request-id');assert.match(id??'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
   assert.notEqual(id,headers['X-Request-Id']);requestIds.push(id);
   await response.text();
  }
  assert.notEqual(requestIds[0],requestIds[1]);
 });
 test('contatos públicos do suporte ficam disponíveis no rascunho sem divulgar documentos nem exigir aceite',async()=>{
  await db.query(`UPDATE commercial_settings SET legal_name='Identidade ainda em revisão',address='Endereço ainda em revisão',
   support_email='suporte@example.test',privacy_email='privacidade@example.test',privacy_text=$1,terms_text=$2,
   subprocessors='[{"name":"Fornecedor em revisão"}]'::jsonb WHERE singleton=true`,[fakePrivacy,fakeTerms]);
  const legal=await request('/public/legal','GET',undefined,'');assert.equal(legal.code,200);
  assert.equal(legal.data.published,false);assert.equal(legal.data.version,'draft');assert.equal(legal.data.effectiveDate,null);
  assert.equal(legal.data.operator.supportEmail,'suporte@example.test');assert.equal(legal.data.operator.privacyEmail,'privacidade@example.test');
  assert.equal(legal.data.operator.legalName,null);assert.equal(legal.data.operator.address,null);
  assert.deepEqual(legal.data.documents,{privacy:'',terms:''});assert.deepEqual(legal.data.subprocessors,[]);
  assert.equal((await request('/auth/me')).data.legal.required,false);
  assert.equal((await api('/accept-terms','POST',{version:'draft',accepted:true})).code,409);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM terms_acceptances WHERE user_id=$1',[ids.ownerA])).rows[0].n,0);
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
 test('checkout indisponível não consome onboarding; links revisados independem da publicação jurídica e continuam restritos ao responsável',async()=>{
  const before=(await api('/me','GET',undefined,sessions.ownerB)).data.subscription;
  assert.equal((await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerB)).code,422);
  assert.equal((await api('/onboarding','POST',{plan:'monthly'},sessions.ownerB)).code,422);
  const unchanged=(await api('/me','GET',undefined,sessions.ownerB)).data.subscription;
  assert.equal(unchanged.onboarding_completed_at,before.onboarding_completed_at);assert.equal(unchanged.trial_started_at,before.trial_started_at);assert.equal(unchanged.status,before.status);
  for(const [id,name,amount] of [['monthly','Mensal fictício',3500],['yearly','Anual fictício',35000]] as const){
   const configured=await api(`/platform/plans/${id}`,'PATCH',{name,amount_cents:amount,checkout_url:`https://pag.ae/commercial-test-${id}`,checkout_reviewed:true,active:true},sessions.platform);
   assert.equal(configured.code,200);
  }
  const owner=(await api('/me')).data;assert.equal(owner.checkoutRequiresSupport,false);assert.ok(owner.plans.every((plan:any)=>plan.checkout_url===`https://pag.ae/commercial-test-${plan.id}`));
  const staff=(await api('/me','GET',undefined,sessions.staffA)).data;assert.equal(staff.canManage,false);assert.ok(staff.plans.every((plan:any)=>plan.checkout_url===null));
  const legal=(await request('/public/legal','GET',undefined,'')).data;assert.equal(legal.published,false);assert.deepEqual(legal.documents,{privacy:'',terms:''});
 });
 test('escolher mensal ou anual não concede período gratuito nem ativa acesso sem recebimento',async()=>{
  for(const [person,plan,amount] of [['ownerB','monthly',3500],['ownerC','yearly',35000]] as const){
   const reply=await api('/onboarding','POST',{plan},sessions[person]);assert.equal(reply.code,200);assert.equal(reply.data.checkout_url,`https://pag.ae/commercial-test-${plan}`);
   const me=(await api('/me','GET',undefined,sessions[person])).data;assert.equal(me.subscription.status,'pending');assert.equal(me.subscription.plan_id,plan);assert.equal(me.subscription.amount_cents,amount);assert.equal(me.subscription.trial_started_at,null);assert.equal(me.subscription.writable,false);assert.equal(me.checkoutRequiresSupport,true);assert.ok(me.subscription.pending_checkout_at);assert.equal(me.subscription.pending_checkout_plan_id,plan);
   assert.ok(new Date(me.subscription.trial_ends_at).getTime()<=Date.now()+1000);
   assert.equal((await request('/data/tutors','POST',{name:'Sem recebimento'},sessions[person])).code,402);
  }
  const before=(await api('/me','GET',undefined,sessions.ownerB)).data.subscription;
  const checkout=await api('/choose-plan','POST',{plan_id:'yearly'},sessions.ownerB);assert.equal(checkout.code,200);assert.equal(checkout.data.action,'support');assert.equal(checkout.data.plan_id,'yearly');assert.equal(checkout.data.checkout_url,undefined);
  assert.equal((await api('/me','GET',undefined,sessions.ownerB)).data.subscription.writable,false);
  assert.equal((await api('/onboarding','POST',{plan:'yearly'},sessions.ownerB)).code,409);
  const after=(await api('/me','GET',undefined,sessions.ownerB)).data.subscription;assert.equal(after.plan_id,before.plan_id);assert.equal(after.pending_checkout_at,before.pending_checkout_at);assert.equal(after.paid_through,null);
 });
 test('checkouts concorrentes durante o Free liberam um único destino sem encerrar a experiência nem criar recebimento',async()=>{
  const before=(await api('/me')).data.subscription;
  const results=await Promise.all(Array.from({length:4},()=>api('/choose-plan','POST',{plan_id:'yearly'})));
  assert.ok(results.every(result=>result.code===200),JSON.stringify(results));
  const checkout=results.filter(result=>result.data.action==='checkout'),support=results.filter(result=>result.data.action==='support');assert.equal(checkout.length,1);assert.equal(checkout[0].data.checkout_url,'https://pag.ae/commercial-test-yearly');assert.equal(support.length,3);assert.ok(support.every(result=>result.data.checkout_url===undefined&&result.data.ticket_id===support[0].data.ticket_id));
  const after=(await api('/me')).data;assert.equal(after.subscription.status,before.status);assert.equal(after.subscription.trial_started_at,before.trial_started_at);assert.equal(after.subscription.trial_ends_at,before.trial_ends_at);assert.equal(after.subscription.paid_through,null);assert.equal(after.payments.length,0);assert.equal(after.checkoutRequiresSupport,true);assert.ok(after.subscription.pending_checkout_at);assert.equal(after.subscription.pending_checkout_plan_id,'yearly');
  const again=await api('/choose-plan','POST',{plan_id:'monthly'});assert.equal(again.code,200);assert.equal(again.data.action,'support');assert.equal(again.data.checkout_url,undefined);assert.equal((await api('/me')).data.subscription.pending_checkout_at,after.subscription.pending_checkout_at);
 });
 test('somente conferência manual libera checkout abandonado e snapshots antigos nunca liberam outra tentativa',async()=>{
  await resetFixtureReauthentication();
  const before=(await api('/me','GET',undefined,sessions.ownerC)).data.subscription;
  const path=`/platform/subscriptions/${ids.c}/clear-checkout`,payload={password,confirmed_no_active_recurrence:true,provider_reference:'SEM-ASSINATURA-'+tag,reason:'Conferência fictícia de tentativa não concluída',expected_paid_through:before.paid_through,expected_pending_checkout_at:before.pending_checkout_at};
  assert.ok(before.pending_checkout_at);assert.equal(before.pending_checkout_plan_id,'yearly');
  assert.equal((await api(path,'POST',payload,sessions.ownerC)).code,403);
  assert.equal((await api(path,'POST',{...payload,password:'Senha-incorreta'},sessions.platform)).code,403);
  assert.equal((await api(path,'POST',{...payload,confirmed_no_active_recurrence:false},sessions.platform)).code,422);
  assert.equal((await api(path,'POST',{...payload,expected_paid_through:new Date().toISOString()},sessions.platform)).code,409);
  assert.equal((await api(path,'POST',{...payload,expected_pending_checkout_at:new Date(Date.now()-86400000).toISOString()},sessions.platform)).code,409);
  assert.equal((await api('/me','GET',undefined,sessions.ownerC)).data.subscription.pending_checkout_at,before.pending_checkout_at);
  const cleared=await api(path,'POST',payload,sessions.platform);assert.equal(cleared.code,200,JSON.stringify(cleared.data));
  assert.equal((await api(path,'POST',payload,sessions.platform)).code,200);
  const after=(await api('/me','GET',undefined,sessions.ownerC)).data;
  assert.equal(after.subscription.pending_checkout_at,null);assert.equal(after.subscription.pending_checkout_plan_id,null);assert.equal(after.checkoutRequiresSupport,false);assert.equal(after.subscription.status,before.status);assert.equal(after.subscription.paid_through,before.paid_through);assert.equal(after.subscription.writable,false);assert.equal(after.subscription.recurrence_cancelled_at,before.recurrence_cancelled_at);assert.equal(after.payments.length,0);
  const events=await db.query("SELECT metadata FROM audit_events WHERE tenant_id=$1 AND action='subscription.checkout_cleared_manually'",[ids.c]);assert.equal(events.rowCount,1);assert.equal(events.rows[0].metadata.provider_reference,payload.provider_reference);assert.equal(events.rows[0].metadata.pending_checkout_at,before.pending_checkout_at);assert.equal(events.rows[0].metadata.pending_checkout_plan_id,'yearly');
  const next=await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerC);assert.equal(next.code,200);assert.equal(next.data.action,'checkout');
  const pending=(await api('/me','GET',undefined,sessions.ownerC)).data.subscription;assert.ok(pending.pending_checkout_at);assert.notEqual(pending.pending_checkout_at,before.pending_checkout_at);assert.equal(pending.pending_checkout_plan_id,'monthly');
  assert.equal((await api(path,'POST',payload,sessions.platform)).code,409);assert.equal((await api('/me','GET',undefined,sessions.ownerC)).data.subscription.pending_checkout_at,pending.pending_checkout_at);
  const receipt=await platformPayment(ids.c,'COMERCIAL-'+tag+'-RECOVERY-PAID');assert.equal(receipt.code,201);
  const paid=(await api('/me','GET',undefined,sessions.ownerC)).data;assert.equal(paid.subscription.pending_checkout_at,null);assert.equal(paid.subscription.pending_checkout_plan_id,null);assert.equal(paid.subscription.paid_through,receipt.data.period_end);assert.equal(paid.checkoutRequiresSupport,true);
  assert.equal((await api(path,'POST',payload,sessions.platform)).code,409,'A conciliação real invalida a antiga conferência de checkout, mesmo após limpar a pendência.');
  assert.equal((await api('/choose-plan','POST',{plan_id:'yearly'},sessions.ownerC)).data.action,'support');
  await resetFixtureReauthentication();
 });
 test('experiência expirada mantém consulta e suporte, mas não pode ser renovada por onboarding',async()=>{
  assert.equal((await api('/me')).data.subscription.grace_days,3);
  await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()-interval '1 second' WHERE tenant_id=$1",[ids.a]);
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
  const me=(await api('/me','GET',undefined,sessions.ownerB)).data;assert.equal(me.plans.find((item:any)=>item.id==='monthly').checkout_url,'https://pag.ae/commercial-test-monthly','O checkout revisado não publica nem depende dos documentos jurídicos.');
  await db.query("UPDATE subscription_plans SET checkout_reviewed=false WHERE id='monthly'");
  assert.equal((await api('/me','GET',undefined,sessions.ownerB)).data.plans.find((item:any)=>item.id==='monthly').checkout_url,null);
  assert.equal((await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerD)).code,422);
  await db.query("UPDATE subscription_plans SET checkout_reviewed=true,checkout_url='https://pag.ae.evil.example/checkout' WHERE id='monthly'");
  assert.equal((await api('/me','GET',undefined,sessions.ownerB)).data.plans.find((item:any)=>item.id==='monthly').checkout_url,null);
  assert.equal((await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerD)).code,422);
  await db.query("UPDATE subscription_plans SET checkout_url='https://pag.ae/commercial-test-monthly',active=false WHERE id='monthly'");
  assert.equal((await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerB)).code,422);
  await db.query("UPDATE subscription_plans SET active=true WHERE id='monthly'");
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
  const current=(await api('/me','GET',undefined,sessions.ownerB)).data;assert.equal(current.subscription.status,'active');assert.equal(current.subscription.writable,true);assert.equal(current.subscription.paid_through,firstPayment.period_end);assert.equal(current.subscription.pending_checkout_at,null);assert.equal(current.subscription.pending_checkout_plan_id,null);
  const reused=await platformPayment(ids.e,ref);assert.ok([409,422].includes(reused.code));assert.equal((await api('/me','GET',undefined,sessions.ownerE)).data.payments.length,0);
  const renewed=await platformPayment(ids.b,'COMERCIAL-'+tag+'-PAY-2');assert.equal(renewed.code,201);renewalPayment=renewed.data;assert.equal(renewalPayment.period_start,firstPayment.period_end);assert.ok(new Date(renewalPayment.period_end)>new Date(firstPayment.period_end));
 });
 test('quem já pagou solicita troca pelo suporte, sem checkout, alteração de plano ou duplicação concorrente do chamado',async()=>{
  const before=(await api('/me','GET',undefined,sessions.ownerB)).data;assert.equal(before.checkoutRequiresSupport,true);
  const priorMessages=(await db.query("SELECT count(*)::int AS n FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.tenant_id=$1 AND EXISTS(SELECT 1 FROM audit_events a WHERE a.tenant_id=t.tenant_id AND a.entity_id=t.id AND a.action='subscription.plan_change_requested')",[ids.b])).rows[0].n;
  const priorEvents=(await db.query("SELECT count(*)::int AS n FROM audit_events WHERE tenant_id=$1 AND action='subscription.plan_change_requested'",[ids.b])).rows[0].n;
  const replies=await Promise.all(Array.from({length:4},()=>api('/choose-plan','POST',{plan_id:'yearly'},sessions.ownerB)));
  for(const reply of replies){assert.equal(reply.code,200,JSON.stringify(reply.data));assert.equal(reply.data.action,'support');assert.equal(reply.data.plan_id,'yearly');assert.ok(reply.data.ticket_id);assert.equal(reply.data.checkout_url,undefined);}
  const ticketId=replies[0].data.ticket_id;assert.ok(replies.every(reply=>reply.data.ticket_id===ticketId));
  const after=(await api('/me','GET',undefined,sessions.ownerB)).data;
  assert.equal(after.subscription.plan_id,before.subscription.plan_id);assert.equal(after.subscription.status,before.subscription.status);assert.equal(after.subscription.paid_through,before.subscription.paid_through);assert.equal(after.payments.length,before.payments.length);
  const ticket=(await api('/support/'+ticketId,'GET',undefined,sessions.ownerB)).data;assert.equal(ticket.ticket.category,'billing');assert.equal(ticket.messages.length,priorMessages+1);assert.match(ticket.messages.at(-1).body,/não confirma cancelamento/);
  const events=await db.query("SELECT count(*)::int AS n FROM audit_events WHERE tenant_id=$1 AND entity_id=$2 AND action='subscription.plan_change_requested'",[ids.b,ticketId]);assert.equal(events.rows[0].n,priorEvents+1);
  assert.equal((await api('/support/'+ticketId)).code,404);
  const samePlan=await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerB);assert.equal(samePlan.data.action,'support');assert.equal(samePlan.data.ticket_id,ticketId);assert.equal(samePlan.data.checkout_url,undefined);
  assert.equal((await api('/support/'+ticketId,'GET',undefined,sessions.ownerB)).data.messages.length,priorMessages+2);
  assert.deepEqual(outboundRequests,[]);
 });
 test('histórico confirmado continua impedindo nova recorrência sem conferência mesmo sem paid_through',async()=>{
  const before=(await db.query('SELECT paid_through,plan_id,status FROM tenant_subscriptions WHERE tenant_id=$1',[ids.b])).rows[0];
  try{
   await db.query('UPDATE tenant_subscriptions SET paid_through=NULL WHERE tenant_id=$1',[ids.b]);
   assert.equal((await api('/me','GET',undefined,sessions.ownerB)).data.checkoutRequiresSupport,true);
   const reply=await api('/choose-plan','POST',{plan_id:'yearly'},sessions.ownerB);assert.equal(reply.code,200);assert.equal(reply.data.action,'support');assert.equal(reply.data.checkout_url,undefined);
   const current=(await api('/me','GET',undefined,sessions.ownerB)).data.subscription;assert.equal(current.plan_id,before.plan_id);assert.equal(current.status,before.status);assert.equal(current.paid_through,null);
  }finally{await db.query('UPDATE tenant_subscriptions SET paid_through=$2 WHERE tenant_id=$1',[ids.b,before.paid_through]);}
 });
 test('tolerância de três dias aplica somente ao período pago e também termina após o prazo',async()=>{
  const before=(await db.query('SELECT paid_through FROM tenant_subscriptions WHERE tenant_id=$1',[ids.b])).rows[0];
  try{
   await db.query("UPDATE tenant_subscriptions SET paid_through=now()-interval '1 second' WHERE tenant_id=$1",[ids.b]);
   assert.equal((await api('/me','GET',undefined,sessions.ownerB)).data.subscription.writable,true);
   await db.query("UPDATE tenant_subscriptions SET paid_through=now()-interval '3 days 1 second' WHERE tenant_id=$1",[ids.b]);
   assert.equal((await api('/me','GET',undefined,sessions.ownerB)).data.subscription.writable,false);
   assert.equal((await request('/data/tutors','POST',{name:'Fora da tolerância paga'},sessions.ownerB)).code,402);
  }finally{await db.query('UPDATE tenant_subscriptions SET paid_through=$2 WHERE tenant_id=$1',[ids.b,before.paid_through]);}
 });
 test('recebimento confirmado antes do primeiro acesso continua válido após escolher o plano',async()=>{
  const payment=await platformPayment(ids.d,'COMERCIAL-'+tag+'-PREPAID');assert.equal(payment.code,201);
  const before=(await api('/me','GET',undefined,sessions.ownerD)).data.subscription;assert.equal(before.onboarding_completed_at,null);assert.equal(before.writable,false);
  const onboard=await api('/onboarding','POST',{plan:'yearly'},sessions.ownerD);assert.equal(onboard.code,200);assert.equal(onboard.data.plan,'monthly');assert.equal(onboard.data.checkout_url,null);assert.equal(onboard.data.paymentAlreadyConfirmed,true);
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
 test('cancelamento solicitado é confirmado pelo suporte antes de liberar nova contratação, sem perder período pago',async()=>{
  await resetFixtureReauthentication();
  assert.equal((await api('/cancel-subscription','POST',{confirmed:true},sessions.staffA)).code,403);
  assert.equal((await api('/cancel-subscription','POST',{confirmed:true},sessions.ownerA)).code,422);
  const paid=await platformPayment(ids.e,'COMERCIAL-'+tag+'-CANCEL-OLD');assert.equal(paid.code,201);
  const before=(await api('/me','GET',undefined,sessions.ownerE)).data.subscription;
  assert.equal((await api('/cancel-subscription','POST',{confirmed:false},sessions.ownerE)).code,422);
  const requests=await Promise.all(Array.from({length:3},()=>api('/cancel-subscription','POST',{confirmed:true},sessions.ownerE)));
  assert.ok(requests.every(reply=>reply.code===200&&reply.data.ticket_id===requests[0].data.ticket_id));
  const ticket=(await api('/support/'+requests[0].data.ticket_id,'GET',undefined,sessions.ownerE)).data;assert.equal(ticket.messages.length,1);
  assert.equal((await api('/support/'+requests[0].data.ticket_id,'GET',undefined,sessions.ownerB)).code,404);
  const requested=(await api('/me','GET',undefined,sessions.ownerE)).data;
  assert.equal(requested.checkoutRequiresSupport,true);assert.equal(requested.subscription.paid_through,before.paid_through);assert.equal(requested.subscription.status,before.status);assert.equal(requested.subscription.recurrence_cancelled_at,null);
  const path=`/platform/subscriptions/${ids.e}/cancel-recurring`,payload={password,provider_reference:'CANCEL-'+tag,reason:'Cancelamento fictício conferido no teste',confirmed_in_pagbank:true,expected_paid_through:before.paid_through};
  assert.equal((await api(path,'POST',payload,sessions.ownerE)).code,403);
  assert.equal((await api(path,'POST',{...payload,password:'Senha-incorreta'},sessions.platform)).code,403);
  assert.equal((await api(path,'POST',{...payload,confirmed_in_pagbank:false},sessions.platform)).code,422);
  const confirmation=await api(path,'POST',payload,sessions.platform);assert.equal(confirmation.code,200,JSON.stringify(confirmation.data));assert.ok(confirmation.data.recurrence_cancelled_at);
  assert.equal((await api(path,'POST',payload,sessions.platform)).data.recurrence_cancelled_at,confirmation.data.recurrence_cancelled_at);
  const resolved=(await api('/support/'+requests[0].data.ticket_id,'GET',undefined,sessions.ownerE)).data;assert.equal(resolved.ticket.status,'resolved');assert.equal(resolved.messages.length,2);assert.equal(resolved.messages[1].from_platform,true);assert.match(resolved.messages[1].body,/período já pago permanece/);assert.match(resolved.messages[1].body,new RegExp(payload.provider_reference));
  const cancelled=(await api('/me','GET',undefined,sessions.ownerE)).data;
  assert.equal(cancelled.checkoutRequiresSupport,false);assert.equal(cancelled.subscription.paid_through,before.paid_through);assert.equal(cancelled.subscription.writable,before.writable);assert.equal(cancelled.subscription.plan_id,'monthly');
  assert.equal((await api('/cancel-subscription','POST',{confirmed:true},sessions.ownerE)).code,409);
  const next=await api('/choose-plan','POST',{plan_id:'yearly'},sessions.ownerE);assert.equal(next.code,200,JSON.stringify(next.data));assert.equal(next.data.action,'checkout');assert.match(next.data.checkout_url,/^https:\/\/pag\.ae\//);
  const pending=(await api('/me','GET',undefined,sessions.ownerE)).data;assert.equal(pending.subscription.plan_id,'monthly','Abrir novo checkout não substitui o plano pago antes da conciliação.');assert.equal(pending.checkoutRequiresSupport,true);assert.ok(pending.subscription.pending_checkout_at);assert.equal(pending.subscription.pending_checkout_plan_id,'yearly');
  const blocked=await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerE);assert.equal(blocked.data.action,'support');assert.equal(blocked.data.checkout_url,undefined);
  const replay=await api(`/platform/subscriptions/${ids.e}/payments`,'POST',{plan_id:paid.data.plan_id,amount_cents:paid.data.amount_cents,provider_reference:paid.data.provider_reference,received_at:paid.data.received_at,idempotency_key:paid.data.idempotency_key,confirmed_in_pagbank:true},sessions.platform);assert.equal(replay.code,201);assert.equal(replay.data.id,paid.data.id);
  const replayed=(await api('/me','GET',undefined,sessions.ownerE)).data.subscription;assert.equal(replayed.pending_checkout_at,pending.subscription.pending_checkout_at);assert.equal(replayed.recurrence_cancelled_at,confirmation.data.recurrence_cancelled_at);assert.equal(replayed.paid_through,before.paid_through);
  const clearPath=`/platform/subscriptions/${ids.e}/clear-checkout`,clearPayload={password,confirmed_no_active_recurrence:true,provider_reference:'SEM-NOVA-ASSINATURA-'+tag,reason:'Nova contratação fictícia não concluída no PagBank',expected_paid_through:before.paid_through,expected_pending_checkout_at:pending.subscription.pending_checkout_at};
  assert.equal((await api(clearPath,'POST',clearPayload,sessions.platform)).code,200);
  const recovered=(await api('/me','GET',undefined,sessions.ownerE)).data;assert.equal(recovered.subscription.pending_checkout_at,null);assert.equal(recovered.subscription.pending_checkout_plan_id,null);assert.equal(recovered.subscription.paid_through,before.paid_through);assert.equal(recovered.subscription.plan_id,'monthly');assert.equal(recovered.subscription.writable,before.writable);assert.equal(recovered.subscription.recurrence_cancelled_at,confirmation.data.recurrence_cancelled_at);assert.equal(recovered.checkoutRequiresSupport,false);
  const reopened=await api('/choose-plan','POST',{plan_id:'yearly'},sessions.ownerE);assert.equal(reopened.data.action,'checkout');
  const secondPending=(await api('/me','GET',undefined,sessions.ownerE)).data.subscription;assert.ok(secondPending.pending_checkout_at);assert.notEqual(secondPending.pending_checkout_at,pending.subscription.pending_checkout_at);
  const again=await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerE);assert.equal(again.data.action,'support');assert.equal(again.data.ticket_id,blocked.data.ticket_id);assert.equal(again.data.checkout_url,undefined);
  const recoveryTicket=(await api('/support/'+again.data.ticket_id,'GET',undefined,sessions.ownerE)).data;assert.equal(recoveryTicket.messages.length,2,'Uma nova tentativa deve acrescentar contexto ao chamado, mesmo ao pedir o mesmo plano.');
  const receipt=await platformPayment(ids.e,'COMERCIAL-'+tag+'-CANCEL-NEW',{plan_id:'yearly',amount_cents:35000});assert.equal(receipt.code,201);
  const renewed=(await api('/me','GET',undefined,sessions.ownerE)).data;assert.equal(renewed.subscription.plan_id,'yearly');assert.equal(renewed.subscription.recurrence_cancelled_at,null);assert.equal(renewed.subscription.pending_checkout_at,null);assert.equal(renewed.subscription.pending_checkout_plan_id,null);assert.equal(renewed.checkoutRequiresSupport,true);
  assert.equal((await api(path,'POST',payload,sessions.publisher)).code,409,'Uma confirmação antiga não pode cancelar o registro de uma recorrência nova.');
  assert.equal((await api(clearPath,'POST',clearPayload,sessions.platform)).code,409,'Uma recuperação anterior não pode liberar uma recorrência já conciliada.');
  assert.equal((await api('/choose-plan','POST',{plan_id:'monthly'},sessions.ownerE)).data.action,'support');
  const secondRequest=await api('/cancel-subscription','POST',{confirmed:true},sessions.ownerE);assert.equal(secondRequest.code,200);assert.notEqual(secondRequest.data.ticket_id,requests[0].data.ticket_id,'Uma assinatura nova precisa de um novo pedido de cancelamento.');
  const secondTicket=(await api('/support/'+secondRequest.data.ticket_id,'GET',undefined,sessions.ownerE)).data;assert.equal(secondTicket.ticket.status,'open');assert.equal(secondTicket.messages.length,1);
  const secondPayload={...payload,provider_reference:'CANCEL-NOVO-'+tag,expected_paid_through:renewed.subscription.paid_through};
  const secondConfirmation=await api(path,'POST',secondPayload,sessions.publisher);assert.equal(secondConfirmation.code,200,JSON.stringify(secondConfirmation.data));assert.equal((await api(path,'POST',secondPayload,sessions.publisher)).code,200);
  const finalTicket=(await api('/support/'+secondRequest.data.ticket_id,'GET',undefined,sessions.ownerE)).data;assert.equal(finalTicket.ticket.status,'resolved');assert.equal(finalTicket.messages.length,2);assert.equal(finalTicket.messages[1].from_platform,true);
  const final=(await api('/me','GET',undefined,sessions.ownerE)).data;assert.equal(final.subscription.paid_through,renewed.subscription.paid_through);assert.equal(final.subscription.recurrence_cancelled_at,secondConfirmation.data.recurrence_cancelled_at);assert.equal(final.checkoutRequiresSupport,false);
  const audit=await db.query("SELECT action,count(*)::int n FROM audit_events WHERE tenant_id=$1 AND action IN ('subscription.recurrence_cancellation_confirmed','subscription.cancellation_requested') GROUP BY action",[ids.e]);assert.equal(audit.rows.find(row=>row.action==='subscription.recurrence_cancellation_confirmed')?.n,2);assert.equal(audit.rows.find(row=>row.action==='subscription.cancellation_requested')?.n,2);assert.deepEqual(outboundRequests,[]);
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
 test('termos atuais são aceitos explicitamente; link permanece restrito ao administrador com revisão',async()=>{
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
