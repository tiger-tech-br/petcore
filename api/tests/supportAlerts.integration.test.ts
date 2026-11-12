// Banco exclusivo *_test; todo e-mail e toda saída externa são simulados.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Suporte: configure TEST_DATABASE_URL exclusivo terminado em _test.');
const envKeys=['DATABASE_URL','NODE_ENV','SESSION_SECRET','EMAIL_PROVIDER','EMAIL_API_KEY','EMAIL_FROM','APP_ORIGIN','SUPPORT_EMAILS_ENABLED','SUPPORT_EMAILS_CONFIRM_SEND'] as const;
const previousEnv=new Map(envKeys.map(key=>[key,process.env[key]]));
Object.assign(process.env,{DATABASE_URL:testUrl,NODE_ENV:'test',SESSION_SECRET:'support-alerts-isolated-'+randomUUID()+randomUUID(),EMAIL_PROVIDER:'resend',EMAIL_API_KEY:'fake-support-alert-key',EMAIL_FROM:'PetCore <support-fixture@example.test>',APP_ORIGIN:'https://petcore.example.test',SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO'});
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const {enqueueSupportEmails,processSupportEmails}=await import('../src/supportEmailService.js');
const db=new pg.Pool({connectionString:testUrl,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const originalFetch=globalThis.fetch;
const tag=randomUUID().slice(0,8),password='Support-fixtures-'+randomUUID(),sourceIp=`2001:db8:${randomUUID().slice(0,4)}:${randomUUID().slice(0,4)}::4`;
const ids={a:randomUUID(),b:randomUUID(),ownerA:randomUUID(),ownerB:randomUUID(),staffA:randomUUID(),otherStaffA:randomUUID(),platform:randomUUID()};
const people=['ownerA','ownerB','staffA','otherStaffA','platform'] as const,tenantIds=[ids.a,ids.b],userIds=people.map(person=>ids[person]);
const address=(person:typeof people[number])=>`${person.toLowerCase()}-${tag}@example.test`;
const operatorEmail=`support-operator-${tag}@example.test`;
const sessions:Record<string,string>={},sent:{body:any;key:string|null}[]=[],unexpected:string[]=[];
let base='',server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,configSnapshot:any=null;
let providerMode:'ok'|'error'='ok',genericTicket='',staffTicket='';

async function request(path:string,method='GET',body?:unknown,session=sessions.ownerA){
 const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':sourceIp,Cookie:session??''},body:body===undefined?undefined:JSON.stringify(body)});
 return {code:response.status,data:await response.json(),headers:response.headers};
}
const api=(path:string,method='GET',body?:unknown,session=sessions.ownerA)=>request('/commercial'+path,method,body,session);
const jobsFor=(ticket:string)=>db.query('SELECT * FROM support_email_notifications WHERE tenant_id=$1 AND ticket_id=$2 ORDER BY recipient_kind',[ids.a,ticket]);
const subscriptionSnapshot=async()=> (await db.query('SELECT plan_id,status,paid_through,trial_started_at,trial_ends_at,onboarding_completed_at,pending_checkout_at,pending_checkout_plan_id,recurrence_cancelled_at FROM tenant_subscriptions WHERE tenant_id=$1',[ids.a])).rows[0];
async function newTicket(session=sessions.ownerA,body='Mensagem fictícia com conteúdo que não deve ser copiado para o e-mail.'){
 const reply=await api('/support','POST',{subject:'Teste local de suporte '+tag,category:'billing',body},session);
 assert.equal(reply.code,201,JSON.stringify(reply.data));return reply.data.id as string;
}
async function expectedSummary(){
 const pending=(await db.query("SELECT count(*)::int AS n FROM support_tickets WHERE status IN ('open','in_progress')")).rows[0].n;
 const states=(await db.query('SELECT state,count(*)::int AS n FROM support_email_notifications GROUP BY state')).rows;
 return {pending,emails:Object.fromEntries(['queued','sending','sent','failed','uncertain'].map(state=>[state,states.find(row=>row.state===state)?.n??0]))};
}
async function isolateWorkerJobs(){
 Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO'});
 await db.query("UPDATE support_email_notifications SET state='cancelled',claimed_by=NULL,claim_expires_at=NULL WHERE tenant_id=ANY($1::uuid[]) AND state NOT IN ('sent','cancelled')",[tenantIds]);
 sent.length=0;
}

describe('Alertas de suporte: autoria, fila durável e cobrança preservada',{concurrency:false},()=>{
 before(async()=>{
  configSnapshot=(await db.query('SELECT support_email,published FROM commercial_settings WHERE singleton=true')).rows[0];assert.ok(configSnapshot);
  await db.query('UPDATE commercial_settings SET support_email=$1,published=false WHERE singleton=true',[operatorEmail]);
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  for(const company of tenantIds)await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[company,'Pet shop fictício suporte '+tag+' '+company.slice(0,4)]);
  for(const person of people)await db.query('INSERT INTO users(id,name,email,password_hash,is_platform_owner) VALUES($1,$2,$3,$4,$5)',[ids[person],'Usuário fictício '+person,address(person),hash,person==='platform']);
  for(const [company,owner] of [[ids.a,ids.ownerA],[ids.b,ids.ownerB]])await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",[company,owner]);
  for(const member of [ids.staffA,ids.otherStaffA])await db.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'employee',ARRAY[]::text[])",[ids.a,member]);
  for(const company of tenantIds)await db.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[company]);
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const location=server.address();assert.ok(location&&typeof location!=='string');base=`http://127.0.0.1:${location.port}`;
  globalThis.fetch=(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
   const url=new URL(input instanceof URL?input.href:typeof input==='string'?input:input.url);
   if(url.origin===base)return originalFetch(input,init);
   if(url.href!=='https://api.resend.com/emails'){unexpected.push(url.origin);throw Error('Saída externa bloqueada na suíte de suporte.');}
   assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fake-support-alert-key');
   sent.push({body:JSON.parse(String(init?.body)),key:new Headers(init?.headers).get('idempotency-key')});
   return new Response(JSON.stringify(providerMode==='ok'?{id:randomUUID()}:{name:'application_error',message:'Falha exclusivamente simulada'}),{status:providerMode==='ok'?200:500,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  for(const person of people){const reply=await request('/auth/login','POST',{email:address(person),password},'');assert.equal(reply.code,200,JSON.stringify(reply.data));sessions[person]=(reply.headers.get('set-cookie')??'').split(';')[0];assert.ok(sessions[person]);}
 });
 after(async()=>{
  Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO'});
  globalThis.fetch=originalFetch;if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  try{
   if(configSnapshot)await db.query('UPDATE commercial_settings SET support_email=$1,published=$2 WHERE singleton=true',[configSnapshot.support_email,configSnapshot.published]);
   await db.query('DELETE FROM support_email_notifications WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);
   await db.query('DELETE FROM audit_events WHERE tenant_id=ANY($1::uuid[]) OR actor_user_id=ANY($2::uuid[])',[tenantIds,userIds]);
   await db.query('DELETE FROM support_messages WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);await db.query('DELETE FROM support_tickets WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);
   await db.query('DELETE FROM subscription_payments WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);await db.query('DELETE FROM tenant_subscriptions WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);
   await db.query('DELETE FROM memberships WHERE tenant_id=ANY($1::uuid[])',[tenantIds]);await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenantIds]);await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[userIds]);
   await db.query('DELETE FROM auth_rate_limits WHERE key=$1',[createHash('sha256').update('/login:'+sourceIp).digest('hex')]);
  }finally{await appPool.end();await db.end();for(const [key,value] of previousEnv){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  assert.deepEqual(unexpected,[],'Nenhum destino externo além do Resend simulado é permitido.');
 });

 test('somente a plataforma consulta o contador e os estados da fila',async()=>{
  assert.equal((await api('/platform/support-summary','GET',undefined,'')).code,401);
  for(const cookie of [sessions.ownerA,sessions.ownerB,sessions.staffA])assert.equal((await api('/platform/support-summary','GET',undefined,cookie)).code,403);
  const response=await api('/platform/support-summary','GET',undefined,sessions.platform),expected=await expectedSummary();assert.equal(response.code,200);assert.equal(response.data.pending_count,expected.pending);
  for(const [state,count] of Object.entries(expected.emails))assert.equal(response.data.emails[state],count);
 });
 test('novo chamado enfileira aviso ao operador e recibo somente ao solicitante autenticado',async()=>{
  const privateText='OBSERVAÇÃO PRIVADA '+tag+' não deve estar no e-mail';genericTicket=await newTicket(sessions.ownerA,privateText);
  const jobs=(await jobsFor(genericTicket)).rows;assert.equal(jobs.length,2);assert.deepEqual(jobs.map(row=>row.recipient_kind),['operator','requester']);
  assert.equal(jobs[0].recipient_email,operatorEmail);assert.equal(jobs[1].recipient_email,address('ownerA'));assert.equal(jobs[1].recipient_user_id,ids.ownerA);
  assert.ok(jobs.every(row=>row.state==='queued'&&row.event_kind==='request_received'));
  assert.ok(jobs.every(row=>!JSON.stringify(row.payload_json).includes(privateText)));assert.equal(sent.length,0);
  const before=(await db.query('SELECT count(*)::int n FROM support_email_notifications WHERE tenant_id=$1',[ids.a])).rows[0].n;
  assert.equal((await api('/support','POST',{subject:'Destino arbitrário',category:'billing',body:'Pedido inválido de destino.',email:'third-party@example.test'})).code,422);
  assert.equal((await db.query('SELECT count(*)::int n FROM support_email_notifications WHERE tenant_id=$1',[ids.a])).rows[0].n,before);
 });
 test('acesso ao chamado e destinatário permanecem isolados por empresa e autoria',async()=>{
  assert.equal((await api('/support/'+genericTicket,'GET',undefined,sessions.ownerB)).code,404);
  assert.equal((await api('/support/'+genericTicket,'GET',undefined,sessions.staffA)).code,404);
  staffTicket=await newTicket(sessions.staffA);const jobs=(await jobsFor(staffTicket)).rows;
  assert.equal(jobs.find(row=>row.recipient_kind==='requester')?.recipient_email,address('staffA'));
  assert.ok(jobs.every(row=>row.recipient_email!==address('otherStaffA')&&row.recipient_email!==address('ownerB')));
  assert.equal((await api('/support/'+staffTicket,'GET',undefined,sessions.otherStaffA)).code,404);
  assert.equal((await api('/support/'+staffTicket,'GET',undefined,sessions.ownerA)).code,200);
 });
 test('pedidos de troca concorrentes reutilizam o chamado e não duplicam e-mails nem alteram a assinatura',async()=>{
  await db.query("UPDATE tenant_subscriptions SET status='active',paid_through=now()+interval '1 month' WHERE tenant_id=$1",[ids.a]);const before=await subscriptionSnapshot();
  const results=await Promise.all(Array.from({length:4},()=>api('/choose-plan','POST',{plan_id:'yearly'})));
  assert.ok(results.every(reply=>reply.code===200&&reply.data.action==='support'),JSON.stringify(results));assert.equal(new Set(results.map(reply=>reply.data.ticket_id)).size,1);
  const ticket=results[0].data.ticket_id;assert.equal((await jobsFor(ticket)).rowCount,2);assert.equal((await db.query('SELECT count(*)::int AS n FROM support_messages WHERE tenant_id=$1 AND ticket_id=$2',[ids.a,ticket])).rows[0].n,1);
  assert.deepEqual(await subscriptionSnapshot(),before);assert.equal(sent.length,0);
 });
 test('repetir cancelamento mantém um único pedido e preserva o período pago',async()=>{
  const before=await subscriptionSnapshot(),a=await api('/cancel-subscription','POST',{confirmed:true}),b=await api('/cancel-subscription','POST',{confirmed:true});
  assert.equal(a.code,200);assert.equal(b.code,200);assert.equal(a.data.ticket_id,b.data.ticket_id);assert.equal((await jobsFor(a.data.ticket_id)).rowCount,2);
  assert.equal((await api('/cancel-subscription','POST',{confirmed:true},sessions.staffA)).code,403);assert.deepEqual(await subscriptionSnapshot(),before);
 });
 test('resposta da plataforma avisa somente o criador do chamado e situação resolvida reduz pendências',async()=>{
  const before=(await expectedSummary()).pending;
  const response=await api('/support/'+staffTicket+'/messages','POST',{body:'Resposta fictícia do suporte '+tag,status:'resolved'},sessions.platform);assert.equal(response.code,201);
  const messages=(await db.query("SELECT id FROM support_messages WHERE tenant_id=$1 AND ticket_id=$2 AND from_platform=true",[ids.a,staffTicket])).rows;assert.equal(messages.length,1);
  const jobs=(await db.query('SELECT * FROM support_email_notifications WHERE message_id=$1',[messages[0].id])).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].recipient_kind,'requester');assert.equal(jobs[0].recipient_email,address('staffA'));assert.equal(jobs[0].event_kind,'platform_reply');
  assert.equal((await api('/platform/support-summary','GET',undefined,sessions.platform)).data.pending_count,before-1);
  await api('/support/'+genericTicket+'/messages','POST',{body:'Continuação fictícia do cliente '+tag});
  const customerMessage=(await db.query('SELECT id FROM support_messages WHERE tenant_id=$1 AND ticket_id=$2 AND body=$3',[ids.a,genericTicket,'Continuação fictícia do cliente '+tag])).rows[0];
  const customerJobs=(await db.query('SELECT recipient_kind,event_kind FROM support_email_notifications WHERE message_id=$1',[customerMessage.id])).rows;assert.deepEqual(customerJobs,[{recipient_kind:'operator',event_kind:'customer_message'}]);
 });
 test('rollback do chamado também desfaz os avisos, sem deixar envio órfão',async()=>{
  const ticket=randomUUID(),message=randomUUID(),client=await db.connect();
  try{await client.query('BEGIN');await client.query("INSERT INTO support_tickets(id,tenant_id,created_by,subject,category) VALUES($1,$2,$3,'Rollback fictício','billing')",[ticket,ids.a,ids.ownerA]);
   await client.query("INSERT INTO support_messages(id,tenant_id,ticket_id,actor_user_id,body) VALUES($1,$2,$3,$4,'Mensagem transacional fictícia')",[message,ids.a,ticket,ids.ownerA]);
   await enqueueSupportEmails(client,{tenantId:ids.a,ticketId:ticket,messageId:message,event:'request_received'});assert.equal((await client.query('SELECT count(*)::int n FROM support_email_notifications WHERE message_id=$1',[message])).rows[0].n,2);
  }finally{await client.query('ROLLBACK');client.release();}
  assert.equal((await db.query('SELECT 1 FROM support_email_notifications WHERE message_id=$1',[message])).rowCount,0);assert.equal((await db.query('SELECT 1 FROM support_tickets WHERE id=$1',[ticket])).rowCount,0);assert.equal(sent.length,0);
 });
 test('envio desativado não chama o provedor nem consome as tarefas',async()=>{
  const before=(await db.query('SELECT id,state,attempt_count FROM support_email_notifications WHERE tenant_id=ANY($1::uuid[]) ORDER BY id',[tenantIds])).rows;
  assert.equal((await processSupportEmails({limit:2})).processed,0);assert.equal(sent.length,0);assert.deepEqual((await db.query('SELECT id,state,attempt_count FROM support_email_notifications WHERE tenant_id=ANY($1::uuid[]) ORDER BY id',[tenantIds])).rows,before);
 });
 test('falha do provedor preserva o pedido e o acesso, sem registrar e-mail como enviado',async()=>{
  await isolateWorkerJobs();const ticket=await newTicket(),before=await subscriptionSnapshot();providerMode='error';Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'true',SUPPORT_EMAILS_CONFIRM_SEND:'YES'});
  try{await processSupportEmails({limit:2});}finally{Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO'});}
  assert.ok(sent.length>0);const jobs=(await jobsFor(ticket)).rows;assert.ok(jobs.every(row=>row.state!=='sent'&&row.sent_at===null));assert.ok(jobs.some(row=>row.attempt_count>0));
  assert.equal((await api('/support/'+ticket)).code,200);assert.deepEqual(await subscriptionSnapshot(),before);
 });
 test('aceite simulado usa chave estável e não vaza o conteúdo livre nem altera assinatura',async()=>{
  await isolateWorkerJobs();const secret='CONTEÚDO RESTRITO '+tag,ticket=await newTicket(sessions.ownerA,secret),before=await subscriptionSnapshot();providerMode='ok';Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'true',SUPPORT_EMAILS_CONFIRM_SEND:'YES'});
  try{await processSupportEmails({limit:2});await processSupportEmails({limit:2});}finally{Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO'});}
  const jobs=(await jobsFor(ticket)).rows;assert.ok(jobs.every(row=>row.state==='sent'&&row.provider_message_id&&row.sent_at));assert.equal(sent.length,2);
  assert.deepEqual(new Set(sent.map(mail=>mail.key)),new Set(jobs.map(job=>'petcore-support/'+job.id)));
  assert.ok(sent.every(mail=>!JSON.stringify(mail.body).includes(secret)));assert.ok(sent.every(mail=>JSON.stringify(mail.body).includes(ticket)));
  assert.deepEqual(new Set(sent.flatMap(mail=>Array.isArray(mail.body.to)?mail.body.to:[mail.body.to])),new Set([operatorEmail,address('ownerA')]));
  assert.deepEqual(await subscriptionSnapshot(),before);
 });
 test('reserva expirada dentro da janela reaproveita o conteúdo congelado e a chave do mesmo aviso',async()=>{
  await isolateWorkerJobs();const ticket=await newTicket(),jobs=(await jobsFor(ticket)).rows,job=jobs.find(row=>row.recipient_kind==='operator');assert.ok(job);
  await db.query("UPDATE support_email_notifications SET state='cancelled' WHERE ticket_id=$1 AND id<>$2",[ticket,job.id]);
  const frozen={from:process.env.EMAIL_FROM!,to:[operatorEmail],subject:'Conteúdo fixado no primeiro envio',text:'Protocolo '+ticket+' — conservar exatamente este texto.'};
  await db.query("UPDATE support_email_notifications SET state='sending',claimed_by=$2,claim_expires_at=now()-interval '1 second',first_attempt_at=now()-interval '2 minutes',attempt_count=1,payload_json=$3::jsonb WHERE id=$1",[job.id,randomUUID(),JSON.stringify(frozen)]);
  providerMode='ok';Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'true',SUPPORT_EMAILS_CONFIRM_SEND:'YES'});
  try{await processSupportEmails({limit:2});}finally{Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO'});}
  assert.equal(sent.length,1);assert.deepEqual(sent[0].body,frozen);assert.equal(sent[0].key,'petcore-support/'+job.id);
  const recovered=(await db.query('SELECT state,attempt_count,payload_json,claimed_by FROM support_email_notifications WHERE id=$1',[job.id])).rows[0];assert.equal(recovered.state,'sent');assert.equal(recovered.attempt_count,2);assert.equal(recovered.claimed_by,null);assert.deepEqual(recovered.payload_json,frozen);
 });
 test('tentativa incerta fora da janela do provedor não é reenviada automaticamente',async()=>{
  await isolateWorkerJobs();const ticket=await newTicket(),jobs=(await jobsFor(ticket)).rows,job=jobs.find(row=>row.recipient_kind==='operator');assert.ok(job);
  await db.query("UPDATE support_email_notifications SET state='cancelled' WHERE ticket_id=$1 AND id<>$2",[ticket,job.id]);
  await db.query("UPDATE support_email_notifications SET state='sending',claimed_by=$2,claim_expires_at=now()-interval '1 second',first_attempt_at=now()-interval '24 hours',attempt_count=1,payload_json=$3::jsonb WHERE id=$1",[job.id,randomUUID(),JSON.stringify({from:process.env.EMAIL_FROM,to:[operatorEmail],subject:'Envio anterior incerto',text:'Protocolo '+ticket})]);
  Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'true',SUPPORT_EMAILS_CONFIRM_SEND:'YES'});
  try{await processSupportEmails({limit:2});}finally{Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO'});}
  assert.equal(sent.length,0);const stopped=(await db.query('SELECT state,attempt_count,provider_message_id,claimed_by FROM support_email_notifications WHERE id=$1',[job.id])).rows[0];assert.equal(stopped.state,'uncertain');assert.equal(stopped.attempt_count,1);assert.equal(stopped.provider_message_id,null);assert.equal(stopped.claimed_by,null);
 });
 test('aviso que esgotou tentativas não impede que outros pedidos sejam processados',async()=>{
  await isolateWorkerJobs();const ticket=await newTicket(),jobs=(await jobsFor(ticket)).rows,exhausted=jobs.find(row=>row.recipient_kind==='operator'),other=jobs.find(row=>row.recipient_kind==='requester');assert.ok(exhausted&&other);
  await db.query("UPDATE support_email_notifications SET attempt_count=5,first_attempt_at=now()-interval '10 minutes',next_attempt_at=now()-interval '2 minutes' WHERE id=$1",[exhausted.id]);
  providerMode='ok';Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'true',SUPPORT_EMAILS_CONFIRM_SEND:'YES'});
  try{await processSupportEmails({limit:2});}finally{Object.assign(process.env,{SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO'});}
  const result=(await db.query('SELECT id,state,attempt_count FROM support_email_notifications WHERE ticket_id=$1 ORDER BY id',[ticket])).rows;
  assert.equal(result.find(row=>row.id===exhausted.id)?.state,'uncertain');assert.equal(result.find(row=>row.id===other.id)?.state,'sent');assert.equal(sent.length,1);assert.equal(sent[0].key,'petcore-support/'+other.id);
 });
});
