// Teste real de API/PostgreSQL em banco exclusivo. Nunca usa DATABASE_URL como alternativa.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Privacidade: configure TEST_DATABASE_URL exclusivo terminado em _test e aplique todas as migrations.');
process.env.DATABASE_URL=testUrl;process.env.NODE_ENV='test';
process.env.SESSION_SECRET='privacy-integration-only-'+randomUUID()+randomUUID();
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
// Um ambiente de teste nunca usa por acidente o bucket ou o provedor de e-mail reais.
for(const key of ['OBJECT_STORAGE_ENDPOINT','OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_ACCESS_KEY','OBJECT_STORAGE_SECRET_KEY'])process.env[key]='';
process.env.EMAIL_PROVIDER='none';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:testUrl,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const ids={a:randomUUID(),b:randomUUID(),owner:randomUUID(),other:randomUUID(),staff:randomUUID(),tutor:randomUUID(),foreign:randomUUID(),pet:randomUUID(),prof:randomUUID(),service:randomUUID(),past:randomUUID(),future:randomUUID(),sale:randomUUID(),payment:randomUUID()};
const userIds=[ids.owner,ids.other,ids.staff],tenantIds=[ids.a,ids.b],tag=randomUUID().slice(0,8);
const password='Privacy-isolated-tests-'+randomUUID(),personal=`PII_${tag}_DO_TITULAR`,foreignSecret=`NAO_EXPORTAR_OUTRA_EMPRESA_${tag}`;
const prefix=`2001:db8:${randomUUID().slice(0,4)}:${randomUUID().slice(0,4)}`;
const loginIp=prefix+'::1',usedIps=new Set<string>([loginIp]);let ipCounter=10;
let base='',cookie='',foreignCookie='',staffCookie='',accessRequest='',anonymousRequest='',foreignRequest='';
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;
type Reply={code:number;data:any;headers:Headers};
function ip(){const value=prefix+'::'+String(ipCounter++);usedIps.add(value);return value;}
async function call(path:string,method='GET',body?:unknown,session=cookie,source=loginIp):Promise<Reply>{
 usedIps.add(source);
 const response=await fetch(base+'/api/privacy'+path,{method,headers:{'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':source,Cookie:session},body:body===undefined?undefined:JSON.stringify(body)});
 return {code:response.status,data:await response.json(),headers:response.headers};
}
async function login(email:string){const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':loginIp},body:JSON.stringify({email,password})});assert.equal(response.status,200);return(response.headers.get('set-cookie')??'').split(';')[0];}
async function createRequest(kind='access',tutor=ids.tutor,session=cookie){const response=await call('/requests','POST',{tutor_id:tutor,kind,description:'Pedido recebido por canal validado: '+personal},session);assert.equal(response.code,201,JSON.stringify(response.data));return response.data;}
async function verify(id:string,session=cookie){const response=await call(`/requests/${id}`,'PATCH',{status:'in_progress',identity_verified:true,verification_method:'in_person'},session);assert.equal(response.code,200,JSON.stringify(response.data));return response.data;}
const anonymizeBody=()=>({password,confirmation:'ANONIMIZAR',reason:'subject_request',retention_reviewed:true});
const protectedCall=(path:string,body:unknown,session=cookie,source=ip())=>call(path,'POST',body,session,source);

describe('Privacidade: direitos, exportação e desidentificação por empresa',{concurrency:false},()=>{
 before(async()=>{
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  await db.query('INSERT INTO tenants(id,name) VALUES($1,$2),($3,$4)',[ids.a,'Privacidade A '+tag,ids.b,'Privacidade B '+tag]);
  for(const [id,name] of [[ids.owner,'owner'],[ids.other,'other'],[ids.staff,'staff']])await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'Conta teste '+name,`${name}-privacy-${tag}@example.test`,hash]);
  await db.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($3,$4,'admin','{}'),($1,$5,'employee',ARRAY['crm','finance','tutors'])",[ids.a,ids.owner,ids.b,ids.other,ids.staff]);
  await db.query(`INSERT INTO tutors(id,tenant_id,name,phone,email,notes,email_reminders_opt_in,email_reminders_opt_in_at,email_reminders_opt_in_by)
   VALUES($1,$2,$3,'11900001111',$4,$5,true,now(),$6)`,[ids.tutor,ids.a,'Titular '+personal,`tutor-${tag}@example.test`,personal,ids.owner]);
  await db.query('INSERT INTO tutors(id,tenant_id,name,notes) VALUES($1,$2,$3,$4)',[ids.foreign,ids.b,'Outro titular '+tag,foreignSecret]);
  await db.query(`INSERT INTO pets(id,tenant_id,tutor_id,name,species,size,notes,photo_key)
   VALUES($1,$2,$3,'Luna','Cão','pequeno',$4,$5)`,[ids.pet,ids.a,ids.tutor,personal,`tenants/${ids.a}/pets/${ids.pet}/private-photo.jpg`]);
  await db.query("INSERT INTO professionals(id,tenant_id,name) VALUES($1,$2,'Profissional teste')",[ids.prof,ids.a]);
  await db.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes) VALUES($1,$2,'Banho',5000,60)",[ids.service,ids.a]);
  for(const [id,status,offset] of [[ids.past,'done',-4],[ids.future,'confirmed',4]] as const){
   await db.query(`INSERT INTO appointments(id,tenant_id,tutor_id,pet_id,professional_id,starts_at,ends_at,status,notes,created_by)
    VALUES($1,$2,$3,$4,$5,now()+($6::int*interval '1 day'),now()+($6::int*interval '1 day')+interval '1 hour',$7,$8,$9)`,[id,ids.a,ids.tutor,ids.pet,ids.prof,offset,status,personal,ids.owner]);
   await db.query('INSERT INTO appointment_services(tenant_id,appointment_id,service_id,position,price_cents,duration_minutes) VALUES($1,$2,$3,1,5000,60)',[ids.a,id,ids.service]);
   await db.query("INSERT INTO appointment_events(tenant_id,appointment_id,actor_user_id,kind,reason) VALUES($1,$2,$3,'created',$4)",[ids.a,id,ids.owner,personal]);
  }
  await db.query("INSERT INTO reminder_jobs(tenant_id,appointment_id,scheduled_for,state,last_error) VALUES($1,$2,now()+interval '3 days','queued',$3)",[ids.a,ids.future,personal]);
  await db.query("INSERT INTO reminder_delivery_attempts(tenant_id,appointment_id,attempt_number,status,error_message) VALUES($1,$2,1,'failed',$3)",[ids.a,ids.future,personal]);
  await db.query("INSERT INTO tutor_email_reminder_consent_events(tenant_id,tutor_id,actor_user_id,email,action) VALUES($1,$2,$3,$4,'granted')",[ids.a,ids.tutor,ids.owner,`tutor-${tag}@example.test`]);
  await db.query("INSERT INTO crm_contacts(tenant_id,tutor_id,channel,summary,occurred_at,created_by) VALUES($1,$2,'phone',$3,now(),$4)",[ids.a,ids.tutor,personal,ids.owner]);
  await db.query('INSERT INTO crm_tasks(tenant_id,tutor_id,title,notes,due_at,created_by) VALUES($1,$2,$3,$3,now()+interval \'1 day\',$4)',[ids.a,ids.tutor,personal,ids.owner]);
  await db.query("INSERT INTO waitlist(tenant_id,tutor_id,pet_id,service_id,earliest_at,latest_at,notes) VALUES($1,$2,$3,$4,now()+interval '2 days',now()+interval '3 days',$5)",[ids.a,ids.tutor,ids.pet,ids.service,personal]);
  await db.query(`INSERT INTO business_sales(id,tenant_id,tutor_id,appointment_id,status,subtotal_cents,total_cents,due_date,notes,created_by)
   VALUES($1,$2,$3,$4,'paid',5000,5000,current_date,$5,$6)`,[ids.sale,ids.a,ids.tutor,ids.past,personal,ids.owner]);
  await db.query("INSERT INTO business_sale_items(tenant_id,sale_id,kind,service_id,description,quantity,unit_price_cents,total_cents) VALUES($1,$2,'service',$3,'Banho',1,5000,5000)",[ids.a,ids.sale,ids.service]);
  await db.query("INSERT INTO business_ledger(id,tenant_id,sale_id,kind,amount_cents,payment_method,created_by) VALUES($1,$2,$3,'sale_payment',5000,'pix',$4)",[ids.payment,ids.a,ids.sale,ids.owner]);
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
  cookie=await login(`owner-privacy-${tag}@example.test`);foreignCookie=await login(`other-privacy-${tag}@example.test`);staffCookie=await login(`staff-privacy-${tag}@example.test`);
 });
 after(async()=>{
  if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  try{
   for(const table of ['audit_events','object_deletion_jobs','privacy_request_events','privacy_requests','business_operations','business_ledger','business_sale_items','business_sales','reminder_delivery_attempts','reminder_jobs','notifications','appointment_events','appointment_services','appointments','crm_tasks','crm_contacts','waitlist','tutor_email_reminder_consent_events','pets','professionals','services','tutors','tenant_subscriptions','memberships'])await db.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[tenantIds]);
   await db.query('DELETE FROM terms_acceptances WHERE user_id=ANY($1::uuid[])',[userIds]);
   await db.query('DELETE FROM "session" WHERE sess->>\'userId\'=ANY($1::text[])',[userIds]);
   const keys=[createHash('sha256').update('/login:'+loginIp).digest('hex')];
   for(const user of userIds)for(const source of usedIps)keys.push(createHash('sha256').update(`privacy:${user}:${source}`).digest('hex'));
   await db.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[keys]);
   await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[userIds]);await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenantIds]);
  }finally{await Promise.all([appPool.end(),db.end()]);}
 });

 test('somente o administrador da empresa administra pedidos e filas',async()=>{
  assert.equal((await call('/requests','GET',undefined,'')).code,401);
  assert.equal((await call('/requests','GET',undefined,staffCookie)).code,403);
  assert.equal((await call('/tutors','GET',undefined,staffCookie)).code,403);
  assert.equal((await call('/cleanup-queue','GET',undefined,staffCookie)).code,403);
  assert.equal((await call('/requests')).code,200);
 });
 test('registro é isolado, estrito e mantém um histórico sem copiar a descrição',async()=>{
  const created=await createRequest();accessRequest=created.id;
  anonymousRequest=(await createRequest('anonymization')).id;
  foreignRequest=(await createRequest('access',ids.foreign,foreignCookie)).id;
  assert.equal((await call('/requests','POST',{tutor_id:ids.foreign,kind:'access',description:'Pedido de outra empresa'})).code,404);
  assert.equal((await call('/requests','POST',{tutor_id:ids.tutor,kind:'access',description:'Pedido válido',tenant_id:ids.b})).code,422);
  assert.equal((await call('/requests?status=desconhecido')).code,422);
  assert.equal((await call('/requests?page=0')).code,422);
  const own=await call('/requests?page_size=1');assert.equal(own.data.items.length,1);assert.equal(own.data.total,2);assert.equal(own.data.summary.open,2);
  assert.equal((await call(`/requests/${accessRequest}`,'GET',undefined,foreignCookie)).code,404);
  assert.equal((await call(`/requests/${foreignRequest}`)).code,404);
  const history=await call(`/requests/${accessRequest}`);assert.equal(history.data.events[0].action,'created');assert.ok(!JSON.stringify(history.data.events).includes(personal));
 });
 test('exportação exige identidade, senha atual e escopo antes de preparar o arquivo',async()=>{
  assert.equal((await protectedCall(`/requests/${accessRequest}/export`,{password})).code,409);
  assert.equal((await protectedCall(`/requests/${accessRequest}/export`,{password:'Senha-incorreta-de-teste'})).code,403);
  assert.equal((await protectedCall(`/requests/${foreignRequest}/export`,{password})).code,404);
  assert.equal((await call(`/requests/${accessRequest}`,'PATCH',{identity_verified:true})).code,422);
  await verify(accessRequest);
  const exported=await protectedCall(`/requests/${accessRequest}/export`,{password});assert.equal(exported.code,200,JSON.stringify(exported.data));
  assert.equal(exported.headers.get('cache-control'),'no-store');assert.match(exported.headers.get('content-disposition')??'',/attachment/);
  assert.equal(exported.data.tutor.id,ids.tutor);assert.equal(exported.data.pets[0].id,ids.pet);assert.equal(exported.data.appointments.length,2);
  assert.equal(exported.data.sales[0].id,ids.sale);assert.equal(exported.data.sales[0].transactions[0].id,ids.payment);
  assert.equal(exported.data.photo_downloads[0].status,'storage_unavailable');assert.equal(exported.data.photo_downloads[0].url,null);
  const serialized=JSON.stringify(exported.data);assert.ok(serialized.includes(personal));assert.ok(!serialized.includes(foreignSecret));assert.ok(!serialized.includes('password_hash'));assert.ok(!serialized.includes('photo_key'));
 });
 test('confirmação de senha possui limite por conta e origem de teste',async()=>{
  const source=ip();
  for(let index=0;index<5;index++)assert.equal((await protectedCall(`/requests/${foreignRequest}/export`,{password:'Senha-incorreta'},foreignCookie,source)).code,403);
  assert.equal((await protectedCall(`/requests/${foreignRequest}/export`,{password},foreignCookie,source)).code,429);
 });
 test('encerrar uma solicitação exige resultado e não substitui a ação protegida de anonimização',async()=>{
  assert.equal((await call(`/requests/${accessRequest}`,'PATCH',{status:'completed',resolution:''})).code,422);
  await verify(anonymousRequest);
  assert.equal((await call(`/requests/${anonymousRequest}`,'PATCH',{status:'completed',resolution:'Tentativa de encerrar sem desidentificar.'})).code,409);
  assert.equal((await protectedCall(`/requests/${anonymousRequest}/anonymize`,{...anonymizeBody(),retention_reviewed:false})).code,422);
  assert.equal((await protectedCall(`/requests/${anonymousRequest}/anonymize`,{...anonymizeBody(),confirmation:'APAGAR'})).code,422);
  assert.equal((await protectedCall(`/requests/${foreignRequest}/anonymize`,anonymizeBody())).code,404);
 });
 test('atendimento em andamento bloqueia a limpeza sem alterar o cadastro',async()=>{
  await db.query("UPDATE appointments SET status='in_progress' WHERE id=$1",[ids.future]);
  const result=await protectedCall(`/requests/${anonymousRequest}/anonymize`,anonymizeBody());assert.equal(result.code,409);
  const tutor=await db.query('SELECT anonymized_at FROM tutors WHERE id=$1',[ids.tutor]);assert.equal(tutor.rows[0].anonymized_at,null);
  await db.query("UPDATE appointments SET status='confirmed' WHERE id=$1",[ids.future]);
 });
 test('desidentifica campos vinculados, cancela futuros e conserva os valores financeiros',async()=>{
  const ledgerBefore=(await db.query('SELECT * FROM business_ledger WHERE id=$1',[ids.payment])).rows[0];
  const result=await protectedCall(`/requests/${anonymousRequest}/anonymize`,anonymizeBody());assert.equal(result.code,200,JSON.stringify(result.data));assert.equal(result.data.cancelledAppointments,1);assert.equal(result.data.queuedPhotos,1);
  const tutor=(await db.query('SELECT * FROM tutors WHERE id=$1',[ids.tutor])).rows[0];assert.equal(tutor.name,'Titular anonimizado');assert.equal(tutor.phone,'');assert.equal(tutor.email,null);assert.equal(tutor.notes,'');assert.equal(tutor.email_reminders_opt_in,false);assert.equal(tutor.email_reminders_opt_in_at,null);assert.ok(tutor.anonymized_at);
  const pet=(await db.query('SELECT notes,photo_key FROM pets WHERE id=$1',[ids.pet])).rows[0];assert.equal(pet.notes,'');assert.equal(pet.photo_key,null);
  const appointmentRows=(await db.query('SELECT id,status,notes FROM appointments WHERE tenant_id=$1',[ids.a])).rows;assert.equal(appointmentRows.find(row=>row.id===ids.future).status,'cancelled');assert.equal(appointmentRows.find(row=>row.id===ids.past).status,'done');assert.ok(appointmentRows.every(row=>row.notes===''));
  assert.equal((await db.query('SELECT state,last_error FROM reminder_jobs WHERE appointment_id=$1',[ids.future])).rows[0].state,'cancelled');
  assert.ok((await db.query('SELECT email FROM tutor_email_reminder_consent_events WHERE tutor_id=$1',[ids.tutor])).rows.every(row=>row.email===null));
  assert.equal((await db.query('SELECT status,notes FROM crm_tasks WHERE tutor_id=$1',[ids.tutor])).rows[0].status,'cancelled');
  assert.equal((await db.query('SELECT status FROM waitlist WHERE tutor_id=$1',[ids.tutor])).rows[0].status,'closed');
  const sale=(await db.query('SELECT status,total_cents,notes FROM business_sales WHERE id=$1',[ids.sale])).rows[0];assert.equal(sale.status,'paid');assert.equal(sale.total_cents,5000);assert.equal(sale.notes,'');
  assert.deepEqual((await db.query('SELECT * FROM business_ledger WHERE id=$1',[ids.payment])).rows[0],ledgerBefore);
  const row=await call(`/requests/${anonymousRequest}`);assert.equal(row.data.request.status,'completed');assert.ok(row.data.events.some((event:any)=>event.action==='anonymized'));
  const texts=await db.query(`SELECT string_agg(value,' ') AS content FROM (
   SELECT notes AS value FROM tutors WHERE id=$1 UNION ALL SELECT notes FROM pets WHERE tutor_id=$1
   UNION ALL SELECT summary FROM crm_contacts WHERE tutor_id=$1 UNION ALL SELECT title||notes FROM crm_tasks WHERE tutor_id=$1
   UNION ALL SELECT description||resolution FROM privacy_requests WHERE tutor_id=$1) all_values`,[ids.tutor]);assert.ok(!texts.rows[0].content.includes(personal));
 });
 test('exclusão de foto é enfileirada sem contactar armazenamento real nem expor a chave',async()=>{
  const jobs=await call('/cleanup-queue');assert.equal(jobs.code,200);assert.equal(jobs.data.items.length,1);assert.equal(jobs.data.items[0].state,'queued');assert.equal(jobs.data.items[0].attempt_count,0);assert.ok(!JSON.stringify(jobs.data).includes('private-photo.jpg'));
  assert.equal((await call('/cleanup-queue','GET',undefined,foreignCookie)).data.items.length,0);
  assert.equal((await call('/cleanup-queue/retry','POST',{})).code,503);
  assert.equal((await db.query('SELECT state,attempt_count FROM object_deletion_jobs WHERE tenant_id=$1',[ids.a])).rows[0].state,'queued');
  assert.equal((await protectedCall(`/requests/${anonymousRequest}/anonymize`,anonymizeBody())).code,409);
  assert.equal((await call('/requests','POST',{tutor_id:ids.tutor,kind:'access',description:'Novo pedido no cadastro já desidentificado'})).code,409);
 });
});
