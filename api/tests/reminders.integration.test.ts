// Somente banco exclusivo de testes e provedor integralmente simulado.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';
const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Configure TEST_DATABASE_URL exclusivo terminado em _test.');
const envKeys=['DATABASE_URL','NODE_ENV','SESSION_SECRET','RESEND_API_KEY','RESEND_FROM_EMAIL','REMINDER_EMAILS_ENABLED','REMINDER_EMAILS_CONFIRM_SEND'] as const;
const savedEnv=new Map(envKeys.map(key=>[key,process.env[key]]));
Object.assign(process.env,{DATABASE_URL:testUrl,NODE_ENV:'test',SESSION_SECRET:'reminder-fixtures-'+randomUUID()+randomUUID(),RESEND_API_KEY:'fake-reminder-key',RESEND_FROM_EMAIL:'PetCore <fixture@example.test>',REMINDER_EMAILS_ENABLED:'true',REMINDER_EMAILS_CONFIRM_SEND:'YES'});
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const {runRemindersOnce,claimOne,deliverOne}=await import('../src/reminderDispatcher.js');
const db=new pg.Pool({connectionString:testUrl,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const originalFetch=globalThis.fetch,originalLog=console.log,tag=randomUUID().slice(0,8),company=randomUUID(),otherCompany=randomUUID(),user=randomUUID();
const password='Fixture-only-'+randomUUID(),email='reminders-'+tag+'@example.test',ips=new Set<string>();
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,base='',cookie='',serial=0;
let mode:'ok'|'error'|'timeout'='ok';
const sent:{body:any;key:string|null;signal:AbortSignal|null}[]=[],unexpected:string[]=[];
async function request(path:string,body:unknown,method='PATCH'):Promise<{code:number;data:any;headers:Headers}>{
 const source=`2001:db8:${tag.slice(0,4)}::${++serial}`;ips.add(source);
 const response=await fetch(base+'/api'+path,{method,headers:{'X-PetCore-Request':'1','Content-Type':'application/json','X-Forwarded-For':source,Cookie:cookie},body:JSON.stringify(body)});
 return {code:response.status,data:await response.json(),headers:response.headers};
}
type Fixture={tutor:string;appointment:string;job:string;email:string};
async function fixture(optIn=true,companyId=company):Promise<Fixture>{
 const tutor=randomUUID(),pet=randomUUID(),professional=randomUUID(),appointment=randomUUID(),job=randomUUID(),recipient=`fixture-${tag}-${++serial}@resend.dev`;
 await db.query(`INSERT INTO tutors(id,tenant_id,name,phone,email,notes,email_reminders_opt_in,email_reminders_opt_in_at,email_reminders_opt_in_by)
 VALUES($1,$2,'Cliente fictício','telefone-preservado',$3,'observação-preservada',$4,CASE WHEN $4 THEN now() ELSE NULL END,CASE WHEN $4 THEN $5::uuid ELSE NULL END)`,[tutor,companyId,recipient,optIn,user]);
 if(optIn)await db.query("INSERT INTO tutor_email_reminder_consent_events(tenant_id,tutor_id,actor_user_id,email,action) VALUES($1,$2,$3,$4,'granted')",[companyId,tutor,user,recipient]);
 await db.query("INSERT INTO pets(id,tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,'Pet fictício','Cão','medio')",[pet,companyId,tutor]);
 await db.query("INSERT INTO professionals(id,tenant_id,name) VALUES($1,$2,'Profissional fictício')",[professional,companyId]);
 await db.query("INSERT INTO appointments(id,tenant_id,tutor_id,pet_id,professional_id,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,now()+interval '2 hours',now()+interval '3 hours',$6)",[appointment,companyId,tutor,pet,professional,user]);
 await db.query("INSERT INTO reminder_jobs(id,tenant_id,appointment_id,scheduled_for) VALUES($1,$2,$3,now()-interval '1 minute')",[job,companyId,appointment]);
 return {tutor,appointment,job,email:recipient};
}
describe('Lembretes: autorização, revalidação, lotes e falhas sem e-mail real',{concurrency:false},()=>{
 before(async()=>{
  console.log=()=>{};
  globalThis.fetch=(async(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
   const url=new URL(input instanceof URL?input.href:typeof input==='string'?input:input.url);
   if(base&&url.origin===base)return originalFetch(input,init);
   if(url.href!=='https://api.resend.com/emails'){unexpected.push(url.origin);throw Error('Saída externa bloqueada.');}
   assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fake-reminder-key');
   sent.push({body:JSON.parse(String(init?.body)),key:new Headers(init?.headers).get('idempotency-key'),signal:init?.signal??null});
   if(mode==='timeout')return new Promise<Response>((_resolve,reject)=>{assert.ok(init?.signal);const signal=init.signal;if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
   return new Response(JSON.stringify(mode==='ok'?{id:randomUUID()}:{name:'application_error',message:'Falha simulada'}),{status:mode==='ok'?200:500,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  await db.query("INSERT INTO tenants(id,name) VALUES($1,$2),($3,$4)",[company,'Reminders fixture '+tag,otherCompany,'Other reminders fixture '+tag]);
  await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Conta fictícia',email,await argon2.hash(password)]);
  await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin'),($3,$2,'admin')",[company,user,otherCompany]);
  await db.query("INSERT INTO tenant_subscriptions(tenant_id,onboarding_completed_at,trial_started_at) VALUES($1,now(),now()),($2,now(),now())",[company,otherCompany]);
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
  const login=await request('/auth/login',{email,password},'POST');assert.equal(login.code,200);cookie=(login.headers.get('set-cookie')??'').split(';')[0];
  assert.equal((await request('/auth/select-company',{tenantId:company},'POST')).code,200);
  // Não permite que o teste processe qualquer fila preexistente com autorização.
  const existing=await db.query(`SELECT count(*)::int n FROM reminder_jobs r JOIN appointments a ON a.id=r.appointment_id AND a.tenant_id=r.tenant_id JOIN tutors t ON t.id=a.tutor_id AND t.tenant_id=a.tenant_id WHERE r.state='queued' AND a.starts_at>now() AND t.email_reminders_opt_in AND t.email !~ '@.*example\\.(com|net|org)$|\\.(test|invalid|localhost)$'`);assert.equal(existing.rows[0].n,0,'Use um banco exclusivo sem fila real autorizada.');
 });
 after(async()=>{
  globalThis.fetch=originalFetch;console.log=originalLog;
  if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  try{
   for(const table of ['audit_events','reminder_delivery_attempts','reminder_jobs','appointment_events','appointment_services','appointments','crm_contacts','tutor_email_reminder_consent_events','pets','professionals','tutors','tenant_subscriptions','memberships'])await db.query('DELETE FROM '+table+' WHERE tenant_id=ANY($1::uuid[])',[[company,otherCompany]]);
   await db.query('DELETE FROM "session" WHERE sess->>\'userId\'=$1',[user]);
   const keys=[...ips].map(source=>createHash('sha256').update('/login:'+source).digest('hex'));await db.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[keys]);
   await db.query('DELETE FROM users WHERE id=$1',[user]);await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[[company,otherCompany]]);
  }finally{for(const key of envKeys){const value=savedEnv.get(key);if(value===undefined)delete process.env[key];else process.env[key]=value;}await Promise.all([db.end(),appPool.end()]);}
  assert.deepEqual(unexpected,[]);
 });
 test('duas liberações são obrigatórias e não reservam nem enviam quando bloqueadas',async()=>{
  const pending=await fixture();
  for(const key of ['REMINDER_EMAILS_ENABLED','REMINDER_EMAILS_CONFIRM_SEND']){const value=process.env[key];process.env[key]='NO';try{await assert.rejects(runRemindersOnce(),/bloqueado/);}finally{process.env[key]=value;}}assert.equal(sent.length,0);
  const row=(await db.query('SELECT claimed_by,attempt_count FROM reminder_jobs WHERE id=$1',[pending.job])).rows[0];assert.equal(row.claimed_by,null);assert.equal(row.attempt_count,0);await db.query("UPDATE reminder_jobs SET state='cancelled' WHERE id=$1",[pending.job]);
 });
 test('sem autorização, revogada, e-mail alterado, evento ausente ou somente CRM não enviam',async()=>{
  const none=await fixture(false),revoked=await fixture(),changed=await fixture(),missing=await fixture();
  await db.query("INSERT INTO crm_contacts(tenant_id,tutor_id,channel,summary,occurred_at,created_by) VALUES($1,$2,'email','Contato manual fictício',now(),$3)",[company,none.tutor,user]);
  await db.query("INSERT INTO tutor_email_reminder_consent_events(tenant_id,tutor_id,actor_user_id,email,action) VALUES($1,$2,$3,$4,'revoked')",[company,revoked.tutor,user,revoked.email]);
  await db.query('UPDATE tutors SET email=$2 WHERE id=$1',[changed.tutor,'alterado-'+tag+'@resend.dev']);
  await db.query('DELETE FROM tutor_email_reminder_consent_events WHERE tutor_id=$1',[missing.tutor]);
  assert.deepEqual(await runRemindersOnce(),{processed:0});assert.equal(sent.length,0);
 });
 test('PATCH parcial preserva autorização e contatos; nova autorização para outro e-mail tem ordem inequívoca',async()=>{
  const item=await fixture();
  assert.equal((await request('/data/tutors/'+item.tutor,{})).code,422);
  const renamed=await request('/data/tutors/'+item.tutor,{name:'Nome alterado'});assert.equal(renamed.code,200);assert.equal(renamed.data.email_reminders_opt_in,true);assert.equal(renamed.data.phone,'telefone-preservado');assert.equal(renamed.data.notes,'observação-preservada');
  const recipient='renovado-'+tag+'@resend.dev';assert.equal((await request('/data/tutors/'+item.tutor,{email:recipient,email_reminders_opt_in:true})).code,200);
  const events=(await db.query('SELECT action,email,created_at,event_order FROM tutor_email_reminder_consent_events WHERE tutor_id=$1 ORDER BY event_order DESC LIMIT 2',[item.tutor])).rows;
  assert.deepEqual(events.map(row=>row.action),['granted','revoked']);assert.equal(events[0].created_at.getTime(),events[1].created_at.getTime());assert.equal(events[0].email,recipient);
  const before=sent.length;assert.deepEqual(await runRemindersOnce(),{processed:1});assert.deepEqual(sent.at(-1)!.body.to,[recipient]);assert.equal(sent.length,before+1);
  const revoked=await fixture();const replaced=await request('/data/tutors/'+revoked.tutor,{email:'sem-nova-autorizacao-'+tag+'@resend.dev'});assert.equal(replaced.code,200);assert.equal(replaced.data.email_reminders_opt_in,false);assert.equal(replaced.data.email_reminders_opt_in_at,null);assert.deepEqual(await runRemindersOnce(),{processed:0});
 });
 test('revalida a autorização depois de reservar e cancela antes de enviar se revogada',async()=>{
  const item=await fixture(),before=sent.length,claim=await claimOne();assert.equal(claim?.jobId,item.job);
  assert.equal((await request('/data/tutors/'+item.tutor,{email_reminders_opt_in:false})).code,200);
  await deliverOne(claim!.jobId,claim!.claimId);assert.equal(sent.length,before);
  assert.equal((await db.query('SELECT state FROM reminder_jobs WHERE id=$1',[item.job])).rows[0].state,'cancelled');
 });
 test('atendimento cancelado, passado ou empresa inativa não enviam',async()=>{
  const cancelled=await fixture(),past=await fixture(),inactive=await fixture(true,otherCompany),notDue=await fixture();
  await db.query("UPDATE reminder_jobs SET scheduled_for=now()+interval '1 hour' WHERE id=$1",[notDue.job]);
  await db.query("UPDATE appointments SET status='cancelled' WHERE id=$1",[cancelled.appointment]);
  await db.query("UPDATE appointments SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1",[past.appointment]);
  await db.query('UPDATE tenants SET active=false WHERE id=$1',[otherCompany]);const before=sent.length;
  try{assert.deepEqual(await runRemindersOnce(),{processed:0});assert.equal(sent.length,before);}
  finally{await db.query("UPDATE reminder_jobs SET state='cancelled' WHERE id=$1",[inactive.job]);await db.query('UPDATE tenants SET active=true WHERE id=$1',[otherCompany]);}
 });
 test('lote respeita20 e execuções concorrentes enviam cada lembrete uma vez por empresa',async()=>{
  const items:Fixture[]=[];for(let n=0;n<21;n++)items.push(await fixture(true,n%2?otherCompany:company));const before=sent.length;
  assert.deepEqual(await runRemindersOnce(),{processed:20});assert.equal(sent.length,before+20);
  const results=await Promise.all([runRemindersOnce(),runRemindersOnce()]);assert.equal(results.reduce((sum,result)=>sum+result.processed,0),1);assert.equal(sent.length,before+21);
  const deliveries=sent.slice(before);assert.equal(new Set(deliveries.map(item=>item.key)).size,21);
  assert.deepEqual(new Set(deliveries.map(item=>item.body.to[0])),new Set(items.map(item=>item.email)));
  for(const item of items){const row=(await db.query('SELECT state,attempt_count,provider_message_id FROM reminder_jobs WHERE id=$1',[item.job])).rows[0];assert.equal(row.state,'sent');assert.equal(row.attempt_count,1);assert.ok(row.provider_message_id);}
  assert.deepEqual(await runRemindersOnce(),{processed:0});assert.equal(sent.length,before+21);
 });
 test('resposta de erro fica incerta e nunca é repetida automaticamente',async()=>{
  const item=await fixture(),before=sent.length;mode='error';try{assert.deepEqual(await runRemindersOnce(),{processed:1});}finally{mode='ok';}
  assert.equal((await db.query('SELECT status FROM reminder_delivery_attempts WHERE appointment_id=$1',[item.appointment])).rows[0].status,'uncertain');
  assert.deepEqual(await runRemindersOnce(),{processed:0});assert.equal(sent.length,before+1);
 });
 test('provedor travado é abortado em10s e não provoca reenvio',async()=>{
  const item=await fixture(),before=sent.length,start=Date.now();mode='timeout';try{assert.deepEqual(await runRemindersOnce(),{processed:1});}finally{mode='ok';}
  assert.ok(Date.now()-start>=9000&&Date.now()-start<25000);assert.equal(sent.at(-1)!.signal?.aborted,true);
  assert.equal((await db.query('SELECT status FROM reminder_delivery_attempts WHERE appointment_id=$1',[item.appointment])).rows[0].status,'uncertain');
  assert.deepEqual(await runRemindersOnce(),{processed:0});assert.equal(sent.length,before+1);
 });
});
