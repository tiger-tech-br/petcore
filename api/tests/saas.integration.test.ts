// Testes reais contra PostgreSQL. Execute SOMENTE em banco exclusivo *_test.
import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {config} from 'dotenv';
config({path:new URL('../../.env',import.meta.url)});
import pg from 'pg';
import argon2 from 'argon2';
const url=process.env.TEST_DATABASE_URL;
if(!url||!new URL(url).pathname.endsWith('_test'))throw Error('Configure TEST_DATABASE_URL com banco dedicado terminado em _test. Execute as migrations nele antes dos testes.');
process.env.DATABASE_URL=url;
process.env.NODE_ENV='test';
const {createApp}=await import('../src/server.js');
const db=new pg.Pool({connectionString:url});
let server:ReturnType<ReturnType<typeof createApp>['listen']>;
let base:string;
let tenantA='',tenantB='',tutorA='',petA='',profA='',serviceA='',petB='',userA='',employeeId='',employeeProf='',staffCookie='';
let cookieA='',cookieB='',ownerEmail='',ownerPassword='';
const day=(delta:number)=>{const date=new Date(Date.now()+delta*86400000);return new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'}).format(date);};
const when=(delta:number,hour:number)=>`${day(delta)}T${String(hour).padStart(2,'0')}:00:00-03:00`;
async function call(path:string,method='GET',body?:unknown,cookie=cookieA){const r=await fetch(base+'/api'+path,{method,headers:{'X-PetCore-Request':'1','Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});return {code:r.status,data:await r.json(),headers:r.headers};}
async function login(email:string,password:string){const r=await call('/auth/login','POST',{email,password},'');assert.equal(r.code,200);return (r.headers.get('set-cookie')||'').split(';')[0];}
async function createAppoin(start:string,prof=profA,person=cookieA){return call('/calendar/appointments','POST',{tutor_id:tutorA,pet_id:petA,professional_id:prof,service_ids:[serviceA],starts_at:start,notes:'teste'},person);}
before(async()=>{
 const app=createApp();server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
 const password='Senha-de-teste!'+randomUUID(),hash=await argon2.hash(password),uniq=randomUUID().slice(0,8);
 ownerEmail=`owner-${uniq}@example.test`;ownerPassword=password;
 const a=await db.query('INSERT INTO tenants(name) VALUES($1) RETURNING id',[`A Test ${uniq}`]);tenantA=a.rows[0].id;
 const b=await db.query('INSERT INTO tenants(name) VALUES($1) RETURNING id',[`B Test ${uniq}`]);tenantB=b.rows[0].id;
 const owner=await db.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',['Admin A',ownerEmail,hash]);userA=owner.rows[0].id;
 const other=await db.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',['Admin B',`b-${uniq}@example.test`,hash]);
 await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin'),($3,$4,'admin')",[tenantA,userA,tenantB,other.rows[0].id]);
 const tutor=(await db.query('INSERT INTO tutors(tenant_id,name) VALUES($1,$2) RETURNING id',[tenantA,'Tutor A'])).rows[0];tutorA=tutor.id;
 petA=(await db.query("INSERT INTO pets(tenant_id,tutor_id,name,species,size) VALUES($1,$2,'Pet A','Cão','medio') RETURNING id",[tenantA,tutorA])).rows[0].id;
 const tutorB=(await db.query('INSERT INTO tutors(tenant_id,name) VALUES($1,$2) RETURNING id',[tenantB,'Tutor B'])).rows[0].id;
 petB=(await db.query("INSERT INTO pets(tenant_id,tutor_id,name,species,size) VALUES($1,$2,'Pet B','Gato','pequeno') RETURNING id",[tenantB,tutorB])).rows[0].id;
 profA=(await db.query("INSERT INTO professionals(tenant_id,name) VALUES($1,'Prof A') RETURNING id",[tenantA])).rows[0].id;
 serviceA=(await db.query("INSERT INTO services(tenant_id,name,price_cents,duration_minutes) VALUES($1,'Banho',1000,60) RETURNING id",[tenantA])).rows[0].id;
 await db.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3)',[tenantA,profA,serviceA]);
 for(let d=1;d<=7;d++)await db.query("INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) VALUES($1,$2,$3,'08:00','18:00')",[tenantA,profA,d]);
 cookieA=await login(ownerEmail,password);cookieB=await login(`b-${uniq}@example.test`,password);
 assert.equal((await call('/commercial/onboarding','POST',{plan:'free'},cookieA)).code,200);assert.equal((await call('/commercial/onboarding','POST',{plan:'free'},cookieB)).code,200);
 const staff=await db.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',['Funcionário A',`staff-${uniq}@example.test`,hash]);employeeId=staff.rows[0].id;
 await db.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'employee',ARRAY['appointments'])",[tenantA,employeeId]);
 employeeProf=(await db.query("INSERT INTO professionals(tenant_id,name,user_id) VALUES($1,'Prof Staff',$2) RETURNING id",[tenantA,employeeId])).rows[0].id;
 await db.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3)',[tenantA,employeeProf,serviceA]);
 for(let d=1;d<=7;d++)await db.query("INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) VALUES($1,$2,$3,'08:00','18:00')",[tenantA,employeeProf,d]);
 staffCookie=await login(`staff-${uniq}@example.test`,password);
});
after(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db.end();});
test('isolamento: empresa B não enxerga dados A; IDs alheios não permitem alteração',async()=>{
 const listB=await call('/data/pets','GET',undefined,cookieB);assert.equal(listB.code,200);assert.ok(listB.data.every((p:any)=>p.id!==petA));
 const forged=await call(`/data/pets/${petB}`,'PATCH',{name:'Invasão'});assert.equal(forged.code,404);
 const forgedFK=await call('/data/pets','POST',{name:'Outro',species:'Cão',size:'medio',tutor_id:(await db.query('SELECT tutor_id FROM pets WHERE id=$1',[petB])).rows[0].tutor_id});assert.equal(forgedFK.code,422);
});
test('controle de permissões de funcionário e limitação à própria agenda',async()=>{
 assert.equal((await call('/data/tutors','GET',undefined,staffCookie)).code,403);
 const options=await call('/calendar/options','GET',undefined,staffCookie);
 assert.equal(options.code,200);assert.deepEqual(options.data.professionals.map((p:any)=>p.id),[employeeProf]);
 assert.equal((await createAppoin(when(3,15),profA,staffCookie)).code,403);
 assert.equal((await createAppoin(when(3,15),employeeProf,staffCookie)).code,201);
});
test('duas reservas simultâneas: somente uma pode vencer',async()=>{
 const [a,b]=await Promise.all([createAppoin(when(3,10)),createAppoin(when(3,10))]);
 assert.deepEqual([a.code,b.code].sort(),[201,409]);
});
test('falha de reagendamento mantém horário anterior; antecipação, histórico e jobs',async()=>{
 const second=await createAppoin(when(3,11));assert.equal(second.code,201);
 const id=second.data.id;
 const attempted=await call(`/calendar/appointments/${id}/move`,'POST',{starts_at:when(3,10),professional_id:profA,reason:'colisão proposital',mode:'reschedule'});
 assert.equal(attempted.code,409);
 let row=(await db.query('SELECT starts_at FROM appointments WHERE id=$1',[id])).rows[0];assert.equal(new Date(row.starts_at).toISOString(),new Date(when(3,11)).toISOString());
 const moved=await call(`/calendar/appointments/${id}/move`,'POST',{starts_at:when(3,9),professional_id:profA,reason:'tutor concordou',mode:'anticipate',tutor_consent:true});
 assert.equal(moved.code,200);
 const history=await call(`/calendar/appointments/${id}/history`);assert.equal(history.code,200);assert.ok(history.data.some((e:any)=>e.kind==='anticipate'&&e.tutor_consent));
 const reminders=await db.query('SELECT scheduled_for,state FROM reminder_jobs WHERE appointment_id=$1',[id]);assert.equal(reminders.rows[0].state,'queued');assert.equal(new Date(reminders.rows[0].scheduled_for).toISOString(),new Date(new Date(when(3,9)).getTime()-3600000).toISOString());
});
test('ausência registrada manualmente preserva histórico e libera vaga',async()=>{
 const booked=await createAppoin(when(-2,14));assert.equal(booked.code,201);
 const absence=await call(`/calendar/appointments/${booked.data.id}/status`,'POST',{status:'no_show',reason:'tutor não compareceu'});assert.equal(absence.code,200);
 assert.equal((await db.query('SELECT status FROM appointments WHERE id=$1',[booked.data.id])).rows[0].status,'no_show');
 const events=await db.query('SELECT kind FROM appointment_events WHERE appointment_id=$1',[booked.data.id]);assert.ok(events.rows.some(x=>x.kind==='no_show'));
 const fitting=await createAppoin(when(-2,14));assert.equal(fitting.code,201);
});
test('encaixe na lista de espera é transacional e não pode ser confirmado duas vezes',async()=>{
 const w=await call('/calendar/waitlist','POST',{tutor_id:tutorA,pet_id:petA,service_id:serviceA,earliest_at:when(4,13),latest_at:when(4,16),notes:''});assert.equal(w.code,201);
 const url=`/calendar/waitlist/${w.data.id}/book`;
 const body={starts_at:when(4,14),professional_id:profA,tutor_consent:true};
 const [a,b]=await Promise.all([call(url,'POST',body),call(url,'POST',body)]);assert.deepEqual([a.code,b.code].sort(),[201,409]);
 assert.equal((await db.query('SELECT status FROM waitlist WHERE id=$1',[w.data.id])).rows[0].status,'booked');
});
test('persistência: novo dispositivo/sessão lê o mesmo dado no banco',async()=>{
 const fresh=await login(ownerEmail,ownerPassword);
 const list=await call('/data/pets','GET',undefined,fresh);
 assert.equal(list.code,200);assert.ok(list.data.some((x:any)=>x.id===petA));
});
