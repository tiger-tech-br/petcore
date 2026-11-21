// Real HTTP/PostgreSQL fixtures only. No production URL fallback or external sends.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Public booking: use an isolated TEST_DATABASE_URL ending in _test with all reviewed migrations.');
process.env.DATABASE_URL=testUrl;process.env.NODE_ENV='test';process.env.SESSION_SECRET='public-booking-fixtures-'+randomUUID()+randomUUID();
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
process.env.EMAIL_PROVIDER='none';delete process.env.EMAIL_API_KEY;delete process.env.RESEND_API_KEY;
process.env.APP_ORIGIN='https://public-booking.example.test';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const {runMaintenanceOnce}=await import('../src/maintenance.js');
const {exportSubject,anonymizeSubject}=await import('../src/privacyService.js');
const {tenantExportDatasets,assertTenantExportSchema}=await import(new URL('../scripts/export-tenant.mjs',import.meta.url).href);
const db=new pg.Pool({connectionString:testUrl,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const ids={a:randomUUID(),b:randomUUID(),admin:randomUUID(),other:randomUUID(),employee:randomUUID(),reception:randomUUID(),
 prof:randomUUID(),secondProf:randomUUID(),service:randomUUID(),foreignService:randomUUID(),transport:randomUUID(),tutor:randomUUID(),pet:randomUUID(),foreignTutor:randomUUID(),foreignPet:randomUUID()};
const tenants=[ids.a,ids.b],users=[ids.admin,ids.other,ids.employee,ids.reception],password='Public-tests-'+randomUUID(),tag=randomUUID().slice(0,8);
const legalVersion='public-booking-test-'+tag,ips=new Set<string>();let ipSerial=0;
const source=()=>{const value=`2001:db8:${tag.slice(0,4)}:${tag.slice(4)}::${(++ipSerial).toString(16)}`;ips.add(value);return value;};
const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10),time=(hour:string)=>`${day}T${hour}:00.000Z`;
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,base='',admin='',other='',employee='',reception='',token='',foreignToken='',primaryRequest='',primaryAppointment='';
const originalFetch=globalThis.fetch;let externalCalls=0;
type Reply={status:number;data:any;headers:Headers};
async function call(path:string,method='GET',body?:unknown,cookie='',ip=source()):Promise<Reply>{
 const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':ip,Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,data,headers:response.headers};
}
const input=(hour='10:00')=>({tutor:{name:'Tutor público '+tag,phone:'(11) 90000-1234',email:`public-${tag}@example.test`},
 pet:{name:'Pet público '+tag,species:'Cão',size:'pequeno',breed:'SRD'},service_ids:[ids.service],starts_at:time(hour),idempotency_key:randomUUID(),website:''});
async function submit(hour='10:00'){
 const payload=input(hour),reply=await call(`/public/booking/${token}/requests`,'POST',payload);
 assert.equal(reply.status,201,JSON.stringify(reply.data));
 const row=(await db.query('SELECT id FROM public_booking_requests WHERE tenant_id=$1 AND receipt=$2',[ids.a,reply.data.receipt])).rows[0];assert.ok(row);
 return {id:row.id as string,payload,reply};
}
async function counts(){return (await db.query(`SELECT (SELECT count(*)::int FROM tutors WHERE tenant_id=$1) AS tutors,
 (SELECT count(*)::int FROM pets WHERE tenant_id=$1) AS pets,(SELECT count(*)::int FROM appointments WHERE tenant_id=$1) AS appointments`,[ids.a])).rows[0];}

describe('Public booking: privacy, availability, confirmation and tenant isolation',{concurrency:false},()=>{
 before(async()=>{
  assert.equal((await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0]?.published,false,'Use an unpublished dedicated test configuration.');
  await db.query("INSERT INTO tenants(id,name,timezone) VALUES($1,$2,'UTC'),($3,$4,'UTC')",[ids.a,'Public A '+tag,ids.b,'Public B '+tag]);
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  for(const [id,label] of [[ids.admin,'admin'],[ids.other,'other'],[ids.employee,'employee'],[ids.reception,'reception']])await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'Private account '+label,`${label}-${tag}@example.test`,hash]);
  await db.query(`INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($3,$4,'admin','{}'),
   ($1,$5,'employee',ARRAY['appointments']),($1,$6,'employee',ARRAY['appointments','agenda:all'])`,[ids.a,ids.admin,ids.b,ids.other,ids.employee,ids.reception]);
  for(const company of tenants)await db.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),now(),now()+interval '30 days')",[company]);
  for(const user of users)await db.query('INSERT INTO terms_acceptances(user_id,version) VALUES($1,$2)',[user,legalVersion]);
  await db.query('INSERT INTO professionals(id,tenant_id,name) VALUES($1,$2,$3),($4,$2,$5)',[ids.prof,ids.a,'PRIVATE-PROFESSIONAL-'+tag,ids.secondProf,'PRIVATE-SECOND-'+tag]);
  await db.query('UPDATE professionals SET active=false WHERE id=$1',[ids.secondProf]);
  await db.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes) VALUES($1,$2,'Banho público',3500,30),($3,$4,'Outro serviço',7500,30)",[ids.service,ids.a,ids.foreignService,ids.b]);
  await db.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes,service_type,transport_mode) VALUES($1,$2,'Transporte',2000,0,'transport','pickup')",[ids.transport,ids.a]);
  await db.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3),($1,$4,$3)',[ids.a,ids.prof,ids.service,ids.secondProf]);
  await db.query("INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) SELECT $1,p,d,'09:00','18:00' FROM unnest($2::uuid[]) AS p CROSS JOIN generate_series(1,7) AS d",[ids.a,[ids.prof,ids.secondProf]]);
  await db.query("INSERT INTO professional_breaks(tenant_id,professional_id,weekday,start_time,end_time) SELECT $1,$2,d,'12:00','13:00' FROM generate_series(1,7) AS d",[ids.a,ids.prof]);
  await db.query('INSERT INTO professional_absences(tenant_id,professional_id,starts_at,ends_at) VALUES($1,$2,$3,$4)',[ids.a,ids.prof,time('14:00'),time('15:00')]);
  await db.query('INSERT INTO tutors(id,tenant_id,name) VALUES($1,$2,$3),($4,$5,$6)',[ids.tutor,ids.a,'Existing owner '+tag,ids.foreignTutor,ids.b,'Foreign owner '+tag]);
  await db.query("INSERT INTO pets(id,tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,'Existing pet','Cão','pequeno'),($4,$5,$6,'Foreign pet','Cão','pequeno')",[ids.pet,ids.a,ids.tutor,ids.foreignPet,ids.b,ids.foreignTutor]);
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
  const binding=server.address();assert.ok(binding&&typeof binding!=='string');base=`http://127.0.0.1:${binding.port}`;
  globalThis.fetch=(async(...args:Parameters<typeof fetch>)=>{const destination=new URL(args[0] instanceof Request?args[0].url:String(args[0]));if(destination.origin!==base){externalCalls++;throw Error('External sends forbidden by fixture.');}return originalFetch(...args);}) as typeof fetch;
  const login=async(label:string)=>{const result=await call('/auth/login','POST',{email:`${label}-${tag}@example.test`,password});assert.equal(result.status,200,JSON.stringify(result.data));return (result.headers.get('set-cookie')??'').split(';')[0];};
  admin=await login('admin');other=await login('other');employee=await login('employee');reception=await login('reception');
 });
 after(async()=>{
  globalThis.fetch=originalFetch;
  if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  try{
   await db.query('DELETE FROM "session" WHERE sess->>\'userId\'=ANY($1::text[])',[users]);
   for(const table of ['public_booking_request_services','public_booking_requests','public_booking_settings','audit_events','privacy_request_events','privacy_requests','reminder_jobs','notifications','appointment_events','appointment_services','appointments','professional_absences','professional_breaks','professional_shifts','professional_services','pets','professionals','services','tutors','tenant_subscriptions','memberships'])await db.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[tenants]);
   await db.query('DELETE FROM terms_acceptances WHERE user_id=ANY($1::uuid[])',[users]);await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);
   const hash=(value:string)=>createHmac('sha256',process.env.SESSION_SECRET!).update(value).digest('hex');
   const keys=[...ips].flatMap(ip=>[hash(`public-booking:ip:${ip}`),createHash('sha256').update('/login:'+ip).digest('hex'),...tenants.flatMap(company=>['read','write'].map(kind=>hash(`public-booking:${kind}:${ip}:${company}`)))]);
   keys.push(...tenants.flatMap(company=>['read','write'].map(kind=>hash(`public-booking:company:${kind}:${company}`))));
   await db.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[keys]);
  }finally{await Promise.all([db.end(),appPool.end()]);}
  assert.equal(externalCalls,0,'No external email, storage or payment request is allowed.');
 });

 test('default disabled with admin-only configuration and unpublished documents',async()=>{
  assert.equal((await call('/public-booking/settings')).status,401);
  assert.equal((await call('/public-booking/settings','GET',undefined,employee)).status,403);
  const config=await call('/public-booking/settings','GET',undefined,admin);assert.equal(config.status,200);assert.equal(config.data.enabled,false);assert.equal(config.data.legal_ready,false);assert.equal(config.data.subscription_writable,true);
  token=config.data.token;assert.match(token,/^[a-f0-9]{48}$/);assert.equal(config.data.path,`/agendar/${token}`);
  assert.equal(config.data.link,`${process.env.APP_ORIGIN}/agendar/${token}`);
  assert.equal((await call(`/public/booking/${token}`)).status,404);
  assert.equal((await call('/public-booking/settings','PUT',{enabled:true},employee)).status,403);
 });
 test('normal opt-in exposes anonymous services and times before documents are published',async()=>{
  assert.equal((await call('/public-booking/settings','PUT',{enabled:true,notice:'Entre em contato para confirmar.'},admin)).status,200);
  const settings=await call('/public-booking/settings','GET',undefined,admin);assert.equal(settings.status,200);assert.equal(settings.data.enabled,true);assert.equal(settings.data.legal_ready,false);
  const config=await call(`/public/booking/${token}`);assert.equal(config.status,200);assert.equal(config.data.businessName,'Public A '+tag);assert.equal(config.data.services.length,1);assert.equal(config.data.services[0].id,ids.service);
  assert.doesNotMatch(JSON.stringify(config.data),new RegExp(`${ids.a}|${ids.prof}|PRIVATE-PROFESSIONAL|private account|public_token|payload_hash`,'i'));
  const slots=await call(`/public/booking/${token}/slots?date=${day}&service_ids=${ids.service}`);assert.equal(slots.status,200);assert.ok(slots.data.slots.some((row:any)=>row.starts_at===time('10:00')));
  for(const row of slots.data.slots)assert.deepEqual(Object.keys(row).sort(),['ends_at','starts_at']);
  assert.equal(slots.data.slots.some((row:any)=>row.starts_at===time('12:00')||row.starts_at===time('14:00')),false);
  assert.equal((await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0].published,false);
 });
 test('strict public input refuses private selectors, foreign/transport services, past dates and honeypot',async()=>{
  for(const payload of [{...input(),professional_id:ids.prof},{...input(),tenant_id:ids.b},{...input(),service_ids:[ids.foreignService]},
   {...input(),service_ids:[ids.transport]},{...input(),service_ids:[ids.service,ids.service]},{...input(),website:'bot.example'},
   {...input(),starts_at:'2000-01-01T10:00:00.000Z'},{...input(),tutor:{name:'Tiny',phone:'12'}},{...input(),starts_at:time('10:00').replace(':00.000',':01.000')}]){
   const reply=await call(`/public/booking/${token}/requests`,'POST',payload);assert.equal(reply.status,422,JSON.stringify(reply.data));
  }
  assert.equal((await call(`/public/booking/${token}/slots?date=2000-01-01&service_ids=${ids.service}`)).status,422);
 });
 test('pending request is idempotent and does not create clients or reserve appointments',async()=>{
  const before=await counts(),payload=input(),[one,two]=await Promise.all([call(`/public/booking/${token}/requests`,'POST',payload),call(`/public/booking/${token}/requests`,'POST',payload)]);
  assert.equal(one.status,201);assert.equal(two.status,201);assert.equal(one.data.receipt,two.data.receipt);assert.deepEqual(Object.keys(one.data).sort(),['message','ok','receipt','status']);assert.match(one.data.receipt,/^[a-f0-9]{40}$/);
  assert.deepEqual(await counts(),before);
  const rows=await db.query('SELECT id,status,tutor_phone,payload_hash FROM public_booking_requests WHERE tenant_id=$1 AND receipt=$2',[ids.a,one.data.receipt]);assert.equal(rows.rowCount,1);primaryRequest=rows.rows[0].id;assert.notEqual(primaryRequest,one.data.receipt);assert.equal(rows.rows[0].status,'pending');assert.equal(rows.rows[0].tutor_phone,'11900001234');assert.match(rows.rows[0].payload_hash,/^[a-f0-9]{64}$/);
  assert.equal((await call(`/public/booking/${token}/requests`,'POST',{...payload,pet:{...payload.pet,name:'Changed'}})).status,409);
 });
 test('staff inbox and confirmation are isolated by tenant and permission',async()=>{
  assert.equal((await call('/public-booking/requests')).status,401);assert.equal((await call('/public-booking/requests','GET',undefined,employee)).status,403);
  const inbox=await call('/public-booking/requests','GET',undefined,admin);assert.equal(inbox.status,200);assert.ok(inbox.data.items.some((row:any)=>row.id===primaryRequest));assert.equal((await call('/public-booking/requests','GET',undefined,reception)).status,200);
  assert.equal((await call('/public-booking/requests','GET',undefined,other)).data.items.length,0);
  assert.equal((await call(`/public-booking/requests/${primaryRequest}/confirm`,'POST',{},other)).status,404);
  assert.equal((await call(`/public-booking/requests/${primaryRequest}/confirm`,'POST',{},employee)).status,403);
 });
 test('invalid existing tutor/pet selection rolls back all effects',async()=>{
  const before=await counts();
  assert.equal((await call(`/public-booking/requests/${primaryRequest}/confirm`,'POST',{tutor_id:ids.foreignTutor,pet_id:ids.foreignPet},admin)).status,422);
  assert.deepEqual(await counts(),before);
  assert.equal((await db.query('SELECT status FROM public_booking_requests WHERE id=$1',[primaryRequest])).rows[0].status,'pending');
 });
 test('concurrent operator confirmations create exactly one confirmed appointment and opted-out client',async()=>{
  const before=await counts();const replies=await Promise.all([call(`/public-booking/requests/${primaryRequest}/confirm`,'POST',{},admin),call(`/public-booking/requests/${primaryRequest}/confirm`,'POST',{},reception)]);
  for(const reply of replies)assert.equal(reply.status,200,JSON.stringify(reply.data));assert.equal(replies[0].data.appointment_id,replies[1].data.appointment_id);primaryAppointment=replies[0].data.appointment_id;
  const after=await counts();assert.equal(after.appointments,before.appointments+1);assert.equal(after.tutors,before.tutors+1);assert.equal(after.pets,before.pets+1);
  const row=(await db.query('SELECT a.status,a.professional_id,a.created_by,t.email_reminders_opt_in FROM appointments a JOIN tutors t ON t.tenant_id=a.tenant_id AND t.id=a.tutor_id WHERE a.id=$1',[primaryAppointment])).rows[0];
  assert.equal(row.status,'confirmed');assert.equal(row.professional_id,ids.prof);assert.ok([ids.admin,ids.reception].includes(row.created_by));assert.equal(row.email_reminders_opt_in,false);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM appointment_events WHERE appointment_id=$1',[primaryAppointment])).rows[0].n,1);
  assert.ok((await db.query('SELECT n.id FROM notifications n JOIN appointment_events e ON e.tenant_id=n.tenant_id AND e.id=n.event_id WHERE e.appointment_id=$1 AND n.recipient_user_id=$2',[primaryAppointment,ids.admin])).rowCount);
 });
 test('two pending requests may share a slot; confirmation rechecks and rolls back the loser',async()=>{
  const first=await submit('11:00'),second=await submit('11:00');
  assert.equal((await call(`/public-booking/requests/${first.id}/confirm`,'POST',{},admin)).status,200);
  const before=await counts(),loser=await call(`/public-booking/requests/${second.id}/confirm`,'POST',{},admin);
  assert.equal(loser.status,409,JSON.stringify(loser.data));assert.deepEqual(await counts(),before);
  assert.equal((await db.query('SELECT status FROM public_booking_requests WHERE id=$1',[second.id])).rows[0].status,'pending');
  const slots=await call(`/public/booking/${token}/slots?date=${day}&service_ids=${ids.service}`);assert.equal(slots.data.slots.some((row:any)=>row.starts_at===time('11:00')),false);
  assert.equal((await call(`/public-booking/requests/${second.id}/reject`,'POST',{reason:'Horário indisponível'},admin)).data.status,'rejected');
  assert.equal((await call(`/public-booking/requests/${second.id}/confirm`,'POST',{},admin)).status,409);
 });
 test('privacy export uses verified appointment identity and anonymization removes duplicate form contacts',async()=>{
  const tutor=(await db.query('SELECT tutor_id FROM appointments WHERE id=$1',[primaryAppointment])).rows[0].tutor_id;
  const makeRequest=async(kind:string)=>{const id=randomUUID();await db.query(`INSERT INTO privacy_requests(id,tenant_id,tutor_id,kind,description,identity_verified,verification_method,identity_verified_by,identity_verified_at,created_by)
   VALUES($1,$2,$3,$4,'Verified fixture',true,'in_person',$5,now(),$5)`,[id,ids.a,tutor,kind,ids.admin]);return id;};
  const exported=await exportSubject(ids.a,await makeRequest('access'),ids.admin);
  assert.equal(exported.public_booking_requests.length,1);assert.equal(exported.public_booking_requests[0].id,primaryRequest);
  assert.doesNotMatch(JSON.stringify(exported.public_booking_requests),/payload_hash|idempotency_key|public_token/);
  await anonymizeSubject(ids.a,await makeRequest('anonymization'),ids.admin,'subject_request');
  assert.equal((await db.query('SELECT id FROM public_booking_requests WHERE id=$1',[primaryRequest])).rowCount,0);
  assert.equal((await db.query('SELECT request_id FROM public_booking_request_services WHERE request_id=$1',[primaryRequest])).rowCount,0);
  assert.ok((await db.query('SELECT id FROM appointments WHERE id=$1',[primaryAppointment])).rowCount);
 });
 test('admin deletion honors tenant and keeps the confirmed appointment',async()=>{
  const pending=await submit('16:00');assert.equal((await call(`/public-booking/requests/${pending.id}`,'DELETE',{},employee)).status,403);
  assert.equal((await call(`/public-booking/requests/${pending.id}`,'DELETE',{},other)).status,404);
  const confirmed=await call(`/public-booking/requests/${pending.id}/confirm`,'POST',{tutor_id:ids.tutor,pet_id:ids.pet},admin);assert.equal(confirmed.status,200);
  assert.equal((await call(`/public-booking/requests/${pending.id}`,'DELETE',{},admin)).status,200);
  assert.equal((await db.query('SELECT id FROM appointments WHERE id=$1',[confirmed.data.appointment_id])).rowCount,1);
 });
 test('maintenance removes transient contacts after 30 days; export whitelist excludes access/replay secrets',async()=>{
  const pending=await submit('17:00');await db.query("UPDATE public_booking_requests SET created_at=now()-interval '31 days' WHERE id=$1",[pending.id]);
  const maintenance=await runMaintenanceOnce({files:false});assert.ok(maintenance.pruned.expiredPublicBookingRequests>=1);
  assert.equal((await db.query('SELECT id FROM public_booking_requests WHERE id=$1',[pending.id])).rowCount,0);
  const datasets=tenantExportDatasets.filter((item:any)=>item.name.startsWith('public_booking'));
  assert.equal(datasets.length,3);for(const item of datasets)assert.doesNotMatch(item.columns.join(','),/public_token|payload_hash|idempotency_key/);
  await assertTenantExportSchema(db);
 });
 test('public write rate is limited per IP/company without logging raw contacts',async()=>{
  const ip=source();for(let attempt=0;attempt<8;attempt++)assert.equal((await call(`/public/booking/${token}/requests`,'POST',input('17:00'),'',ip)).status,201);
  assert.equal((await call(`/public/booking/${token}/requests`,'POST',input('17:00'),'',ip)).status,429);
 });
 test('token rotation, disabling, inactive company and expired access close the public endpoint',async()=>{
  const original=token,rotated=await call('/public-booking/settings','PUT',{enabled:true,rotate_token:true},admin);assert.equal(rotated.status,200);token=rotated.data.token;assert.notEqual(token,original);assert.equal((await call(`/public/booking/${original}`)).status,404);
  assert.equal((await call('/public-booking/settings','PUT',{enabled:false},admin)).status,200);assert.equal((await call(`/public/booking/${token}`)).status,404);
  assert.equal((await call(`/public/booking/${token}/slots?date=${day}&service_ids=${ids.service}`)).status,404);
  assert.equal((await call(`/public/booking/${token}/requests`,'POST',input())).status,404);
  assert.equal((await call('/public-booking/settings','PUT',{enabled:true},admin)).status,200);
  await db.query('UPDATE tenants SET active=false WHERE id=$1',[ids.a]);
  try{
   assert.equal((await call(`/public/booking/${token}`)).status,404);
   assert.equal((await call(`/public/booking/${token}/slots?date=${day}&service_ids=${ids.service}`)).status,404);
   assert.equal((await call(`/public/booking/${token}/requests`,'POST',input())).status,404);
   assert.equal((await call('/public-booking/settings','PUT',{enabled:true},admin)).status,403);
  }finally{await db.query('UPDATE tenants SET active=true WHERE id=$1',[ids.a]);}
  assert.equal((await call(`/public/booking/${token}`)).status,200);
  await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()-interval '1 day',paid_through=NULL WHERE tenant_id=$1",[ids.a]);assert.equal((await call(`/public/booking/${token}`)).status,404);
  assert.equal((await call(`/public/booking/${token}/slots?date=${day}&service_ids=${ids.service}`)).status,404);
  assert.equal((await call(`/public/booking/${token}/requests`,'POST',input())).status,404);
  assert.equal((await call('/public-booking/settings','PUT',{enabled:true},admin)).status,402);
  assert.equal((await call('/public-booking/settings','PUT',{enabled:false},admin)).status,200);
  assert.equal((await call(`/public/booking/${token}`)).status,404);
  assert.equal((await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0].published,false);
 });
});
