// Real HTTP/PostgreSQL fixtures. Never falls back to .env or contacts providers.
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const address=process.env.TEST_DATABASE_URL;
if(!address||!decodeURIComponent(new URL(address).pathname).endsWith('_test'))throw Error('Automatic scheduling: configure an isolated TEST_DATABASE_URL ending in _test.');
Object.assign(process.env,{DATABASE_URL:address,NODE_ENV:'test',SESSION_SECRET:'automatic-scheduling-isolated-'+randomUUID()+randomUUID(),EMAIL_PROVIDER:'none',EMAIL_API_KEY:'',EMAIL_FROM:'',RESEND_API_KEY:'',RESEND_FROM_EMAIL:'',REMINDER_EMAILS_ENABLED:'false',REMINDER_EMAILS_CONFIRM_SEND:'NO',SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO',APP_ORIGIN:'https://automatic-scheduling.example.test'});
process.env.DATABASE_SSL??=new URL(address).searchParams.has('sslmode')?'true':'false';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:address,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const tag=randomUUID(),tenants=[randomUUID(),randomUUID()],users=Array.from({length:4},()=>randomUUID());
const professionals=[randomUUID(),randomUUID(),randomUUID()],services=[randomUUID(),randomUUID(),randomUUID()];
const tutors=Array.from({length:6},()=>randomUUID()),pets=Array.from({length:6},()=>randomUUID());
const passwords='Automatic-scheduling-fixture-'+randomUUID(),rateKeys=new Set<string>();
const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10),time=(hour:string)=>`${day}T${hour}:00.000Z`;
const email=(who:string)=>`${who}-${tag}@example.test`;
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,base='',owner='',secondOwner='',unlinked='',foreign='',ipSerial=0;
const originalFetch=globalThis.fetch;let externalCalls=0;
type Reply={code:number;data:any;headers:Headers};
async function call(path:string,method='GET',payload?:unknown,cookie=owner):Promise<Reply>{
 const ip=`2001:db8:${tag.slice(0,4)}:${tag.slice(4,8)}::${(++ipSerial).toString(16)}`;
 if(path==='/auth/login')rateKeys.add(createHash('sha256').update('/login:'+ip).digest('hex'));
 const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':ip,Origin:process.env.APP_ORIGIN!,Cookie:cookie},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 return{code:response.status,data:await response.json(),headers:response.headers};
}
const input=(index:number,hour:string,extra:Record<string,unknown>={})=>({tutor_id:tutors[index],pet_id:pets[index],service_ids:[services[0]],starts_at:time(hour),...extra});
const create=(index:number,hour:string,extra:Record<string,unknown>={},cookie=owner)=>call('/calendar/appointments','POST',input(index,hour,extra),cookie);
async function countAppointments(){return(await db.query('SELECT count(*)::int AS n FROM appointments WHERE tenant_id=$1',[tenants[0]])).rows[0].n;}

before(async()=>{
 assert.equal((await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0]?.published,false,'Use an unpublished, dedicated test configuration.');
 const hash=await argon2.hash(passwords,{type:argon2.argon2id}),setup=await db.connect();
 await setup.query('BEGIN');try{
  await setup.query("INSERT INTO tenants(id,name,timezone) VALUES($1,$2,'UTC'),($3,$4,'UTC')",[tenants[0],'Automatic scheduling '+tag,tenants[1],'Foreign scheduling '+tag]);
  for(const [i,who]of ['owner','second-owner','unlinked','foreign'].entries())await setup.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[users[i],who+' '+tag,email(who),hash]);
  await setup.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($1,$3,'admin','{}'),($1,$4,'employee',ARRAY['appointments']),($5,$6,'admin','{}')",[tenants[0],users[0],users[1],users[2],tenants[1],users[3]]);
  for(const company of tenants)await setup.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[company]);
  await setup.query("INSERT INTO professionals(id,tenant_id,name,user_id,active) VALUES($1,$2,'Owner who attends',$3,true),($4,$2,'Second owner who attends',$5,false),($6,$7,'Foreign professional',$8,true)",[professionals[0],tenants[0],users[0],professionals[1],users[1],professionals[2],tenants[1],users[3]]);
  await setup.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes) VALUES($1,$2,'Bath',3500,30),($3,$2,'Grooming',5000,45),($4,$5,'Foreign service',1000,30)",[services[0],tenants[0],services[1],services[2],tenants[1]]);
  await setup.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3),($1,$4,$3),($1,$4,$5),($6,$7,$8)',[tenants[0],professionals[0],services[0],professionals[1],services[1],tenants[1],professionals[2],services[2]]);
  await setup.query("INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) SELECT $1,p,d,'09:00','18:00' FROM unnest($2::uuid[]) AS p CROSS JOIN generate_series(1,7) AS d",[tenants[0],professionals.slice(0,2)]);
  for(let index=0;index<tutors.length;index++){
   const company=index===5?tenants[1]:tenants[0];
   await setup.query('INSERT INTO tutors(id,tenant_id,name) VALUES($1,$2,$3)',[tutors[index],company,'Fixture tutor '+index+' '+tag]);
   await setup.query("INSERT INTO pets(id,tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,$4,'Cão','pequeno')",[pets[index],company,tutors[index],'Fixture pet '+index+' '+tag]);
  }
  await setup.query('COMMIT');
 }catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
 const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));
 const listening=server.address();assert.ok(listening&&typeof listening!=='string');base=`http://127.0.0.1:${listening.port}`;
 globalThis.fetch=(async(...args:Parameters<typeof fetch>)=>{const destination=new URL(args[0] instanceof Request?args[0].url:String(args[0]));if(destination.origin!==base){externalCalls++;throw Error('External calls are forbidden in scheduling fixtures.');}return originalFetch(...args);}) as typeof fetch;
 const login=async(who:string)=>{const response=await call('/auth/login','POST',{email:email(who),password:passwords},'');assert.equal(response.code,200,JSON.stringify(response.data));return(response.headers.get('set-cookie')??'').split(';')[0];};
 owner=await login('owner');secondOwner=await login('second-owner');unlinked=await login('unlinked');foreign=await login('foreign');
});

after(async()=>{
 globalThis.fetch=originalFetch;
 try{
  if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  const cleanup=await db.connect();await cleanup.query('BEGIN');try{
   await cleanup.query('DELETE FROM "session" WHERE sess->>\'userId\'=ANY($1::text[])',[users]);
   for(const table of ['audit_events','reminder_jobs','notifications','appointment_events','appointment_services','appointments','professional_absences','professional_breaks','professional_shifts','professional_services','pets','professionals','services','tutors','tenant_subscriptions','memberships'])await cleanup.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[tenants]);
   await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await cleanup.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);
   await cleanup.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[[...rateKeys]]);
   await cleanup.query('COMMIT');
  }catch(error){await cleanup.query('ROLLBACK');throw error;}finally{cleanup.release();}
 }finally{await Promise.all([db.end(),appPool.end()]);}
 assert.equal(externalCalls,0,'No email, payment or storage provider may be contacted.');
});

test('a shop run by one owner assigns that owner without a professional selector',async()=>{
 const reply=await create(0,'09:00');assert.equal(reply.code,201,JSON.stringify(reply.data));assert.equal(reply.data.professional_id,professionals[0]);
 assert.equal(new Date(reply.data.ends_at).toISOString(),time('09:30'));assert.equal(reply.data.status,'pending');
 const snapshot=await db.query('SELECT service_id,price_cents,duration_minutes FROM appointment_services WHERE appointment_id=$1',[reply.data.id]);assert.deepEqual(snapshot.rows,[{service_id:services[0],price_cents:3500,duration_minutes:30}]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM appointment_events WHERE appointment_id=$1',[reply.data.id])).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM reminder_jobs WHERE appointment_id=$1',[reply.data.id])).rows[0].n,1);
 assert.ok((await db.query('SELECT n.id FROM notifications n JOIN appointment_events e ON e.tenant_id=n.tenant_id AND e.id=n.event_id WHERE e.appointment_id=$1 AND n.recipient_user_id=$2',[reply.data.id,users[0]])).rowCount);
});

test('a second owner receives the appointment when the first is busy; manual requests still work',async()=>{
 await db.query('UPDATE professionals SET active=true WHERE id=$1',[professionals[1]]);
 const manual=await create(0,'10:00',{professional_id:professionals[0]});assert.equal(manual.code,201,JSON.stringify(manual.data));assert.equal(manual.data.professional_id,professionals[0]);
 const automatic=await create(1,'10:00',{professional_id:null},secondOwner);assert.equal(automatic.code,201,JSON.stringify(automatic.data));assert.equal(automatic.data.professional_id,professionals[1]);
 const full=await call('/calendar/check','POST',{starts_at:time('10:00'),service_ids:[services[0]]});assert.equal(full.code,200);assert.equal(full.data.available,false);
 const before=await countAppointments(),blocked=await create(2,'10:00');assert.equal(blocked.code,409);assert.match(blocked.data.error,/outro horário/);assert.equal(await countAppointments(),before);
});

test('automatic selection requires all selected services and keeps their combined duration',async()=>{
 const onlyQualified=await create(0,'11:00',{service_ids:[services[1]]});assert.equal(onlyQualified.code,201,JSON.stringify(onlyQualified.data));assert.equal(onlyQualified.data.professional_id,professionals[1]);
 const combined=await create(1,'12:00',{service_ids:[services[0],services[1]]});assert.equal(combined.code,201,JSON.stringify(combined.data));assert.equal(combined.data.professional_id,professionals[1]);assert.equal(new Date(combined.data.ends_at).toISOString(),time('13:15'));
 const snapshots=await db.query('SELECT service_id,position FROM appointment_services WHERE appointment_id=$1 ORDER BY position',[combined.data.id]);assert.deepEqual(snapshots.rows,[{service_id:services[0],position:1},{service_id:services[1],position:2}]);
});

test('foreign, inactive and repeated services cannot produce a partially saved appointment',async()=>{
 const before=await countAppointments();
 for(const serviceIds of [[services[2]],[services[0],services[0]],[randomUUID()]])assert.equal((await create(0,'13:30',{service_ids:serviceIds})).code,422);
 await db.query('UPDATE services SET active=false WHERE id=$1',[services[0]]);
 try{assert.equal((await create(0,'13:30')).code,422);}finally{await db.query('UPDATE services SET active=true WHERE id=$1',[services[0]]);}
 assert.equal(await countAppointments(),before);
});

test('working hours, breaks, absences and inactive people are respected before saving',async()=>{
 await db.query('UPDATE professionals SET active=false WHERE id=$1',[professionals[1]]);
 await db.query("INSERT INTO professional_breaks(tenant_id,professional_id,weekday,start_time,end_time) SELECT $1,$2,d,'14:00','15:00' FROM generate_series(1,7) AS d",[tenants[0],professionals[0]]);
 await db.query('INSERT INTO professional_absences(tenant_id,professional_id,starts_at,ends_at) VALUES($1,$2,$3,$4)',[tenants[0],professionals[0],time('15:00'),time('16:00')]);
 const before=await countAppointments();try{
  for(const hour of ['08:30','14:00','15:00','17:45','20:00']){
   const check=await call('/calendar/check','POST',{starts_at:time(hour),service_ids:[services[0]]});assert.equal(check.code,200);assert.equal(check.data.available,false);
   assert.equal((await create(0,hour)).code,409);
  }
  assert.equal(await countAppointments(),before);
 }finally{await db.query('UPDATE professionals SET active=true WHERE id=$1',[professionals[1]]);}
 const fallback=await create(0,'14:00');assert.equal(fallback.code,201,JSON.stringify(fallback.data));assert.equal(fallback.data.professional_id,professionals[1]);
});

test('a scoped employee never falls back to another person and an unlinked employee is refused',async()=>{
 await db.query("UPDATE memberships SET role='employee',permissions=ARRAY['appointments'] WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[1]]);
 try{
  const before=await countAppointments(),blocked=await create(2,'11:00',{},secondOwner);assert.equal(blocked.code,409);assert.equal(await countAppointments(),before);
  const check=await call('/calendar/check','POST',{starts_at:time('11:00'),service_ids:[services[0]]},secondOwner);assert.equal(check.code,200);assert.equal(check.data.available,false);
  assert.equal((await create(2,'16:00',{professional_id:professionals[0]},secondOwner)).code,403);
  const assigned=await create(2,'16:00',{},secondOwner);assert.equal(assigned.code,201,JSON.stringify(assigned.data));assert.equal(assigned.data.professional_id,professionals[1]);
  assert.equal((await create(3,'16:00',{},unlinked)).code,403);
  assert.equal((await call('/calendar/check','POST',{starts_at:time('16:00'),service_ids:[services[0]]},unlinked)).code,403);
 }finally{await db.query("UPDATE memberships SET role='admin',permissions='{}' WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[1]]);}
});

test('client, pet and explicit professional references stay isolated by company',async()=>{
 const before=await countAppointments();
 assert.equal((await create(5,'16:30')).code,422);
 assert.equal((await create(0,'16:30',{pet_id:pets[1]})).code,422);
 assert.equal((await create(0,'16:30',{professional_id:professionals[2]})).code,422);
 assert.equal((await create(0,'16:30',{professional_id:randomUUID()})).code,422);
 assert.equal((await create(0,'16:30',{},foreign)).code,422);
 assert.equal((await create(0,'16:30',{},'')).code,401);assert.equal(await countAppointments(),before);
});

test('concurrent automatic requests fill two available people once and reject excess capacity',async()=>{
 const before=await countAppointments(),replies=await Promise.all([create(2,'17:00'),create(3,'17:00',{},secondOwner),create(4,'17:00')]);
 assert.deepEqual(replies.map(reply=>reply.code).sort(),[201,201,409],JSON.stringify(replies.map(reply=>reply.data)));
 const assigned=replies.filter(reply=>reply.code===201).map(reply=>reply.data.professional_id);assert.deepEqual(assigned.sort(),professionals.slice(0,2).sort());assert.equal(await countAppointments(),before+2);
 const saved=await db.query('SELECT id FROM appointments WHERE tenant_id=$1 AND starts_at=$2',[tenants[0],time('17:00')]);assert.equal(saved.rowCount,2);
 for(const {id}of saved.rows){assert.equal((await db.query('SELECT count(*)::int AS n FROM appointment_events WHERE appointment_id=$1',[id])).rows[0].n,1);assert.equal((await db.query('SELECT count(*)::int AS n FROM reminder_jobs WHERE appointment_id=$1',[id])).rows[0].n,1);}
});
