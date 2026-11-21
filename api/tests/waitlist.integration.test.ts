// Real HTTP/PostgreSQL checks. Dedicated *_test database only; no .env or providers.
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const address=process.env.TEST_DATABASE_URL;
if(!address||!decodeURIComponent(new URL(address).pathname).endsWith('_test'))throw Error('Waitlist: configure an isolated TEST_DATABASE_URL ending in _test.');
Object.assign(process.env,{DATABASE_URL:address,NODE_ENV:'test',SESSION_SECRET:'waitlist-isolated-'+randomUUID()+randomUUID(),EMAIL_PROVIDER:'none',EMAIL_API_KEY:'',EMAIL_FROM:'',RESEND_API_KEY:'',RESEND_FROM_EMAIL:'',REMINDER_EMAILS_ENABLED:'false',REMINDER_EMAILS_CONFIRM_SEND:'NO',SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO',APP_ORIGIN:'https://waitlist.example.test'});
process.env.DATABASE_SSL??=new URL(address).searchParams.has('sslmode')?'true':'false';
let base='',externalCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=(async(...args:Parameters<typeof fetch>)=>{
 const destination=new URL(args[0] instanceof Request?args[0].url:String(args[0]));
 if(!base||destination.origin!==base){externalCalls++;throw Error('External calls are forbidden in waitlist fixtures.');}
 return originalFetch(...args);
}) as typeof fetch;
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:address,max:3,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
db.on('error',()=>{});
const run=randomUUID(),tenants=[randomUUID(),randomUUID()],users=Array.from({length:4},()=>randomUUID());
const professionals=[randomUUID(),randomUUID(),randomUUID()],services=[randomUUID(),randomUUID(),randomUUID()];
const tutors=[randomUUID(),randomUUID()],pets=[randomUUID(),randomUUID()],rateKeys=new Set<string>();
const password='Waitlist-fixture-'+randomUUID(),email=(who:string)=>`${who}-${run}@example.test`;
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,prepared=false,owner='',staff='',foreign='',unlinked='',ipSerial=0;
type Reply={code:number;data:any;headers:Headers};
const fixtureDay=Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00.000Z');
const time=(delta:number,hour:string)=>`${new Date(fixtureDay+delta*86400000).toISOString().slice(0,10)}T${hour}:00.000Z`;
const instant=(value:string|Date)=>new Date(value).toISOString();
async function call(path:string,method='GET',payload?:unknown,cookie=owner):Promise<Reply>{
 const ip=`2001:db8:${run.slice(0,4)}:${run.slice(4,8)}::${(++ipSerial).toString(16)}`;
 if(path==='/auth/login')rateKeys.add(createHash('sha256').update('/login:'+ip).digest('hex'));
 const response=await fetch(base+'/api'+path,{method,headers:{Origin:process.env.APP_ORIGIN!,'X-PetCore-Request':'1','X-Forwarded-For':ip,'Content-Type':'application/json',Cookie:cookie},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 return{code:response.status,data:await response.json(),headers:response.headers};
}
const draft=(day:number,start='09:00',end='10:00',extra:Record<string,unknown>={})=>({tutor_id:tutors[0],pet_id:pets[0],service_id:services[0],earliest_at:time(day,start),latest_at:time(day,end),notes:'Isolated waitlist fixture '+run,...extra});
async function createWait(day:number,start='09:00',end='10:00',extra:Record<string,unknown>={},cookie=owner){
 const reply=await call('/calendar/waitlist','POST',draft(day,start,end,extra),cookie);
 assert.equal(reply.code,201,JSON.stringify(reply.data));return reply.data;
}
const opportunities=(id:string,cookie=owner)=>call(`/calendar/waitlist/${id}/opportunities`,'GET',undefined,cookie);
const book=(id:string,starts_at:string,extra:Record<string,unknown>={},cookie=owner)=>call(`/calendar/waitlist/${id}/book`,'POST',{starts_at,tutor_consent:true,...extra},cookie);
async function waitState(id:string){return(await db.query('SELECT status,appointment_id,earliest_at,latest_at FROM waitlist WHERE tenant_id=$1 AND id=$2',[tenants[0],id])).rows[0];}
async function appointmentCount(){return(await db.query('SELECT count(*)::int AS n FROM appointments WHERE tenant_id=$1',[tenants[0]])).rows[0].n;}
async function occupy(professional:string,starts_at:string,ends_at:string){
 return(await db.query('INSERT INTO appointments(tenant_id,tutor_id,pet_id,professional_id,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[tenants[0],tutors[0],pets[0],professional,starts_at,ends_at,users[0]])).rows[0].id;
}
async function legacyWait(day:number,status:'waiting'|'offered'='waiting'){
 return(await db.query('INSERT INTO waitlist(tenant_id,tutor_id,pet_id,service_id,earliest_at,latest_at,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[tenants[0],tutors[0],pets[0],services[0],time(day,'09:00'),time(day,'10:00'),status,'Legacy expired fixture '+run])).rows[0];
}

before(async()=>{
 assert.equal((await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0]?.published,false,'Use an unpublished, dedicated test configuration.');
 const hash=await argon2.hash(password,{type:argon2.argon2id}),setup=await db.connect();
 await setup.query('BEGIN');try{
  await setup.query("INSERT INTO tenants(id,name,timezone) VALUES($1,$2,'UTC'),($3,$4,'UTC')",[tenants[0],'Waitlist A '+run,tenants[1],'Waitlist B '+run]);
  for(const [index,who]of ['owner','staff','foreign','unlinked'].entries())await setup.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[users[index],who+' '+run,email(who),hash]);
  await setup.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($1,$3,'employee',ARRAY['waitlist']),($4,$5,'admin','{}'),($1,$6,'employee',ARRAY['waitlist'])",[tenants[0],users[0],users[1],tenants[1],users[2],users[3]]);
  for(const company of tenants)await setup.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[company]);
  await setup.query("INSERT INTO professionals(id,tenant_id,name,user_id) VALUES($1,$2,'Alpha owner',$3),($4,$2,'Beta employee',$5),($6,$7,'Foreign professional',$8)",[professionals[0],tenants[0],users[0],professionals[1],users[1],professionals[2],tenants[1],users[2]]);
  await setup.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes) VALUES($1,$2,'Bath',3500,30),($3,$2,'Unassigned service',5000,30),($4,$5,'Foreign service',1000,30)",[services[0],tenants[0],services[1],services[2],tenants[1]]);
  await setup.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3),($1,$4,$3),($5,$6,$7)',[tenants[0],professionals[0],services[0],professionals[1],tenants[1],professionals[2],services[2]]);
  await setup.query("INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) SELECT $1,p,d,'09:00','18:00' FROM unnest($2::uuid[]) AS p CROSS JOIN generate_series(1,7) AS d",[tenants[0],professionals.slice(0,2)]);
  for(const index of [0,1]){
   await setup.query('INSERT INTO tutors(id,tenant_id,name) VALUES($1,$2,$3)',[tutors[index],tenants[index],'Waitlist tutor '+index+' '+run]);
   await setup.query("INSERT INTO pets(id,tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,$4,'Cão','pequeno')",[pets[index],tenants[index],tutors[index],'Waitlist pet '+index+' '+run]);
  }
  await setup.query('COMMIT');prepared=true;
 }catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
 const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
 const listening=server.address();assert.ok(listening&&typeof listening!=='string');base=`http://127.0.0.1:${listening.port}`;
 const login=async(who:string)=>{const reply=await call('/auth/login','POST',{email:email(who),password},'');assert.equal(reply.code,200,JSON.stringify(reply.data));return(reply.headers.get('set-cookie')??'').split(';')[0];};
 owner=await login('owner');staff=await login('staff');foreign=await login('foreign');unlinked=await login('unlinked');
});

after(async()=>{
 try{
  if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  if(prepared){
   const cleanup=await db.connect();await cleanup.query('BEGIN');try{
    await cleanup.query('DELETE FROM "session" WHERE sess::jsonb->>\'userId\'=ANY($1::text[])',[users]);
    for(const table of ['audit_events','waitlist','reminder_jobs','notifications','appointment_events','appointment_services','appointments','tutor_email_reminder_consent_events','professional_absences','professional_breaks','professional_shifts','professional_services','pets','professionals','services','tutors','tenant_subscriptions','memberships'])await cleanup.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[tenants]);
    await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await cleanup.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);
    await cleanup.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[[...rateKeys]]);await cleanup.query('COMMIT');
   }catch(error){await cleanup.query('ROLLBACK');throw error;}finally{cleanup.release();}
  }
 }finally{globalThis.fetch=originalFetch;await Promise.all([db.end(),appPool.end()]);}
 assert.equal(externalCalls,0,'No email, payment or storage provider may be contacted.');
});

test('waitlist-only employees load options for their own agenda without appointments permission',async()=>{
 assert.equal((await call('/calendar/waitlist/options','GET',undefined,'')).code,401);
 const reply=await call('/calendar/waitlist/options','GET',undefined,staff);assert.equal(reply.code,200,JSON.stringify(reply.data));
 assert.deepEqual(reply.data.professionals.map((item:any)=>item.id),[professionals[1]]);
 assert.ok(reply.data.services.some((item:any)=>item.id===services[0]));assert.ok(!reply.data.services.some((item:any)=>item.id===services[2]));
 assert.equal((await call('/calendar/options','GET',undefined,staff)).code,403);
 assert.equal((await call('/calendar/waitlist/options','GET',undefined,unlinked)).code,403);
});

test('new requests reject expired and too-short windows without saving a waitlist item',async()=>{
 const before=(await db.query('SELECT count(*)::int AS n FROM waitlist WHERE tenant_id=$1',[tenants[0]])).rows[0].n;
 assert.equal((await call('/calendar/waitlist','POST',draft(-1))).code,422);
 assert.equal((await call('/calendar/waitlist','POST',draft(2,'09:00','09:29'))).code,422);
 assert.equal((await call('/calendar/waitlist','POST',draft(2,'09:00','10:00',{earliest_at:new Date(Date.now()-30*60000).toISOString(),latest_at:new Date(Date.now()+15*60000).toISOString()}))).code,422);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM waitlist WHERE tenant_id=$1',[tenants[0]])).rows[0].n,before);
});

test('legacy expired windows explain the empty search and cannot book a new appointment',async()=>{
 const wait=await legacyWait(-2),before=await appointmentCount();
 const search=await opportunities(wait.id);assert.equal(search.code,200);assert.deepEqual(search.data.options,[]);assert.equal(search.data.reason,'expired');
 const booked=await book(wait.id,time(2,'10:00'));assert.equal(booked.code,409,JSON.stringify(booked.data));
 assert.equal(await appointmentCount(),before);const saved=await waitState(wait.id);assert.equal(saved.status,'waiting');assert.equal(saved.appointment_id,null);
});

test('automatic booking uses the other qualified professional when the first is busy',async()=>{
 await occupy(professionals[0],time(3,'10:00'),time(3,'10:30'));
 const wait=await createWait(3,'10:00','10:30'),search=await opportunities(wait.id);
 assert.equal(search.code,200);assert.ok(search.data.options.some((item:any)=>instant(item.starts_at)===time(3,'10:00')&&item.professional_id===professionals[1]));
 assert.equal((await book(wait.id,time(3,'10:00'),{tutor_consent:false})).code,422);
 assert.equal((await call(`/calendar/waitlist/${wait.id}/book`,'POST',{starts_at:time(3,'10:00')})).code,422);
 const booked=await book(wait.id,time(3,'10:00'));assert.equal(booked.code,201,JSON.stringify(booked.data));assert.equal(booked.data.professional_id,professionals[1]);assert.equal(instant(booked.data.ends_at),time(3,'10:30'));
 const saved=await waitState(wait.id);assert.equal(saved.status,'booked');assert.equal(saved.appointment_id,booked.data.id);
 assert.equal((await db.query("SELECT count(*)::int AS n FROM appointment_events WHERE tenant_id=$1 AND appointment_id=$2 AND kind='waitlist_booking'",[tenants[0],booked.data.id])).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM reminder_jobs WHERE tenant_id=$1 AND appointment_id=$2',[tenants[0],booked.data.id])).rows[0].n,1);
 const tutor=(await db.query('SELECT email_reminders_opt_in,email_reminders_opt_in_at,email_reminders_opt_in_by FROM tutors WHERE tenant_id=$1 AND id=$2',[tenants[0],tutors[0]])).rows[0];
 assert.deepEqual(tutor,{email_reminders_opt_in:false,email_reminders_opt_in_at:null,email_reminders_opt_in_by:null});
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tutor_email_reminder_consent_events WHERE tenant_id=$1 AND tutor_id=$2',[tenants[0],tutors[0]])).rows[0].n,0);
});

test('an existing professional preference remains binding when the booking omits the selector',async()=>{
 const wait=await createWait(4,'09:00','09:30',{professional_id:professionals[0]});
 assert.equal((await book(wait.id,time(4,'09:00'),{professional_id:professionals[1]})).code,422);
 const booked=await book(wait.id,time(4,'09:00'));assert.equal(booked.code,201,JSON.stringify(booked.data));assert.equal(booked.data.professional_id,professionals[0]);
});

test('a waitlist-only employee books automatically in their own agenda and cannot target another',async()=>{
 const wait=await createWait(4,'10:00','10:30',{},staff),search=await opportunities(wait.id,staff);
 assert.equal(search.code,200);assert.ok(search.data.options.length>0);assert.ok(search.data.options.every((item:any)=>item.professional_id===professionals[1]));
 assert.equal((await book(wait.id,time(4,'10:00'),{professional_id:professionals[0]},staff)).code,403);
 const booked=await book(wait.id,time(4,'10:00'),{},staff);assert.equal(booked.code,201,JSON.stringify(booked.data));assert.equal(booked.data.professional_id,professionals[1]);
});

test('a scoped employee cannot fall back to another person when their own agenda is full',async()=>{
 await occupy(professionals[1],time(5,'10:00'),time(5,'10:30'));
 const wait=await createWait(5,'10:00','10:30',{},staff),before=await appointmentCount(),search=await opportunities(wait.id,staff);
 assert.equal(search.code,200);assert.deepEqual(search.data.options,[]);assert.equal(search.data.reason,'no_availability');
 assert.equal((await book(wait.id,time(5,'10:00'),{},staff)).code,409);assert.equal(await appointmentCount(),before);
 assert.equal((await waitState(wait.id)).status,'waiting');
});

test('a precise thirty-minute window is found and booked without rounding to fifteen minutes',async()=>{
 const wait=await createWait(6,'09:05','09:35'),search=await opportunities(wait.id);
 assert.equal(search.code,200);assert.ok(search.data.options.some((item:any)=>instant(item.starts_at)===time(6,'09:05')&&instant(item.ends_at)===time(6,'09:35')));
 const booked=await book(wait.id,time(6,'09:05'));assert.equal(booked.code,201,JSON.stringify(booked.data));assert.equal(instant(booked.data.ends_at),time(6,'09:35'));
});

test('a slot ending exactly at the latest time is found after off-grid appointments',async()=>{
 for(const professional of professionals.slice(0,2))await occupy(professional,time(7,'09:00'),time(7,'09:35'));
 const wait=await createWait(7,'09:00','10:05'),search=await opportunities(wait.id);
 assert.equal(search.code,200);assert.ok(search.data.options.length>0);assert.equal(instant(search.data.options[0].starts_at),time(7,'09:35'));assert.equal(instant(search.data.options[0].ends_at),time(7,'10:05'));
});

test('search reaches a free day beyond the old eight-day and fourteen-day limits',async()=>{
 const begin=time(9,'09:00'),available=time(26,'09:00');
 for(const professional of professionals.slice(0,2))await db.query('INSERT INTO professional_absences(tenant_id,professional_id,starts_at,ends_at) VALUES($1,$2,$3,$4)',[tenants[0],professional,begin,available]);
 const wait=await createWait(9,'09:00','10:00',{latest_at:time(27,'10:00')}),search=await opportunities(wait.id);
 assert.equal(search.code,200,JSON.stringify(search.data));assert.ok(search.data.options.length>0);assert.equal(instant(search.data.options[0].starts_at),available);assert.ok(search.data.options.length<=5);
});

test('search distinguishes an inactive service from a service with nobody qualified',async()=>{
 const noStaff=await createWait(29,'09:00','10:00',{service_id:services[1]}),unqualified=await opportunities(noStaff.id);
 assert.equal(unqualified.code,200);assert.deepEqual(unqualified.data.options,[]);assert.equal(unqualified.data.reason,'no_eligible_professional');
 const inactive=await createWait(29,'10:00','11:00');await db.query('UPDATE services SET active=false WHERE tenant_id=$1 AND id=$2',[tenants[0],services[0]]);
 try{
  const search=await opportunities(inactive.id);assert.equal(search.code,200);assert.deepEqual(search.data.options,[]);assert.equal(search.data.reason,'service_unavailable');
  const before=await appointmentCount();assert.equal((await book(inactive.id,time(29,'10:00'))).code,422);assert.equal(await appointmentCount(),before);
 }finally{await db.query('UPDATE services SET active=true WHERE tenant_id=$1 AND id=$2',[tenants[0],services[0]]);}
});

test('availability can renew an expired offered request and rejects windows shorter than the service',async()=>{
 const wait=await legacyWait(-3,'offered'),url=`/calendar/waitlist/${wait.id}/availability`,old=await waitState(wait.id);
 assert.equal((await call(url,'PATCH',{earliest_at:time(30,'09:00'),latest_at:time(30,'09:29')})).code,422);
 const unchanged=await waitState(wait.id);assert.equal(instant(unchanged.earliest_at),instant(old.earliest_at));assert.equal(unchanged.status,'offered');
 const changed=await call(url,'PATCH',{earliest_at:time(30,'09:05'),latest_at:time(30,'09:35')});assert.equal(changed.code,200,JSON.stringify(changed.data));
 const renewed=await waitState(wait.id);assert.equal(renewed.status,'waiting');assert.equal(instant(renewed.earliest_at),time(30,'09:05'));assert.equal(instant(renewed.latest_at),time(30,'09:35'));
 const search=await opportunities(wait.id);assert.equal(search.code,200);assert.ok(search.data.options.some((item:any)=>instant(item.starts_at)===time(30,'09:05')));
 const booked=await book(wait.id,time(30,'09:05'));assert.equal(booked.code,201,JSON.stringify(booked.data));
 assert.equal((await call(url,'PATCH',{earliest_at:time(30,'11:00'),latest_at:time(30,'12:00')})).code,409);
 const protectedRow=await waitState(wait.id);assert.equal(protectedRow.status,'booked');assert.equal(protectedRow.appointment_id,booked.data.id);assert.equal(instant(protectedRow.earliest_at),time(30,'09:05'));
});

test('concurrent automatic confirmations create only one appointment for the request',async()=>{
 const wait=await createWait(31,'10:00','10:30'),before=await appointmentCount();
 const results=await Promise.all([book(wait.id,time(31,'10:00')),book(wait.id,time(31,'10:00'))]);
 assert.deepEqual(results.map(reply=>reply.code).sort(),[201,409],JSON.stringify(results.map(reply=>reply.data)));assert.equal(await appointmentCount(),before+1);
 const id=results.find(reply=>reply.code===201)!.data.id;assert.equal((await waitState(wait.id)).appointment_id,id);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM appointment_events WHERE tenant_id=$1 AND appointment_id=$2',[tenants[0],id])).rows[0].n,1);
});

test('requests and their availability remain isolated by company',async()=>{
 const wait=await createWait(32);
 assert.equal((await opportunities(wait.id,foreign)).code,404);
 assert.equal((await book(wait.id,time(32,'09:00'),{},foreign)).code,404);
 assert.equal((await call(`/calendar/waitlist/${wait.id}/availability`,'PATCH',{earliest_at:time(32,'11:00'),latest_at:time(32,'12:00')},foreign)).code,404);
 assert.equal((await call('/calendar/waitlist','POST',draft(32,'11:00','12:00',{pet_id:pets[1]}))).code,422);
 assert.equal((await call('/calendar/waitlist','POST',draft(32,'11:00','12:00',{service_id:services[2]}))).code,422);
 assert.equal((await waitState(wait.id)).status,'waiting');
});

test('search considers a free professional after the first twenty candidates',async()=>{
 const extras=Array.from({length:20},()=>randomUUID()),begin=time(33,'09:00'),end=time(33,'09:30'),setup=await db.connect();
 await setup.query('BEGIN');try{
  for(const [index,id]of extras.entries()){
   await setup.query('INSERT INTO professionals(id,tenant_id,name) VALUES($1,$2,$3)',[id,tenants[0],'A'+String(index).padStart(2,'0')+' '+run]);
   await setup.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3)',[tenants[0],id,services[0]]);
  }
  await setup.query("INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) SELECT $1,p,d,'09:00','18:00' FROM unnest($2::uuid[]) AS p CROSS JOIN generate_series(1,7) AS d",[tenants[0],extras]);
  for(const id of [...extras,professionals[0]])await setup.query('INSERT INTO professional_absences(tenant_id,professional_id,starts_at,ends_at) VALUES($1,$2,$3,$4)',[tenants[0],id,begin,end]);
  await setup.query('COMMIT');
 }catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
 const wait=await createWait(33,'09:00','09:30'),search=await opportunities(wait.id);
 assert.equal(search.code,200);assert.ok(search.data.options.some((item:any)=>instant(item.starts_at)===begin&&item.professional_id===professionals[1]));
});

test('closing a request is scoped, idempotent and preserves its stored history',async()=>{
 const own=await createWait(34,'09:00','10:00',{professional_id:professionals[1]},staff);
 const other=await createWait(34,'11:00','12:00',{professional_id:professionals[0]});
 const ownUrl=`/calendar/waitlist/${own.id}`,otherUrl=`/calendar/waitlist/${other.id}`;
 assert.equal((await call(ownUrl,'DELETE',undefined,foreign)).code,404);
 assert.equal((await call(otherUrl,'DELETE',undefined,staff)).code,404);
 assert.equal((await waitState(other.id)).status,'waiting');
 assert.equal((await call(`${ownUrl}/offer`,'POST',{},staff)).code,200);
 const before=(await db.query('SELECT * FROM waitlist WHERE tenant_id=$1 AND id=$2',[tenants[0],own.id])).rows[0];
 assert.equal(before.status,'offered');const count=await appointmentCount();
 const closed=await call(ownUrl,'DELETE',undefined,staff);assert.equal(closed.code,200,JSON.stringify(closed.data));
 const saved=await db.query('SELECT * FROM waitlist WHERE tenant_id=$1 AND id=$2',[tenants[0],own.id]);assert.equal(saved.rowCount,1);assert.deepEqual(saved.rows[0],{...before,status:'closed'});
 const repeated=await call(ownUrl,'DELETE',undefined,staff);assert.equal(repeated.code,200,JSON.stringify(repeated.data));
 assert.deepEqual((await db.query('SELECT * FROM waitlist WHERE tenant_id=$1 AND id=$2',[tenants[0],own.id])).rows[0],saved.rows[0]);assert.equal(await appointmentCount(),count);
 const adminClosed=await call(otherUrl,'DELETE');assert.equal(adminClosed.code,200,JSON.stringify(adminClosed.data));assert.equal((await waitState(other.id)).status,'closed');
});

test('closing a booked request is refused and preserves its appointment and events',async()=>{
 const wait=await createWait(35,'10:00','10:30'),booked=await book(wait.id,time(35,'10:00'));
 assert.equal(booked.code,201,JSON.stringify(booked.data));const id=booked.data.id,count=await appointmentCount();
 const snapshot=async()=>({
  waitlist:(await db.query('SELECT * FROM waitlist WHERE tenant_id=$1 AND id=$2',[tenants[0],wait.id])).rows,
  appointment:(await db.query('SELECT * FROM appointments WHERE tenant_id=$1 AND id=$2',[tenants[0],id])).rows,
  services:(await db.query('SELECT * FROM appointment_services WHERE tenant_id=$1 AND appointment_id=$2 ORDER BY position',[tenants[0],id])).rows,
  events:(await db.query('SELECT * FROM appointment_events WHERE tenant_id=$1 AND appointment_id=$2 ORDER BY id',[tenants[0],id])).rows,
  reminders:(await db.query('SELECT * FROM reminder_jobs WHERE tenant_id=$1 AND appointment_id=$2 ORDER BY id',[tenants[0],id])).rows
 });
 const before=await snapshot();assert.equal(before.waitlist[0].status,'booked');assert.equal(before.appointment.length,1);assert.equal(before.events.length,1);
 const reply=await call(`/calendar/waitlist/${wait.id}`,'DELETE');assert.equal(reply.code,409,JSON.stringify(reply.data));
 assert.deepEqual(await snapshot(),before);assert.equal(await appointmentCount(),count);
});
