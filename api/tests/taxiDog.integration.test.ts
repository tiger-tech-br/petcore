// Regressões reais de transporte pet. Nunca executar fora de um banco exclusivo *_test.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Táxi Dog: configure TEST_DATABASE_URL exclusivo terminado em _test e aplique todas as migrations.');
process.env.DATABASE_URL=testUrl;process.env.NODE_ENV='test';
process.env.SESSION_SECRET='taxi-isolated-tests-'+randomUUID()+randomUUID();
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
process.env.EMAIL_PROVIDER='none';
for(const key of ['OBJECT_STORAGE_ENDPOINT','OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_ACCESS_KEY','OBJECT_STORAGE_SECRET_KEY'])process.env[key]='';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:testUrl,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const ids={a:randomUUID(),b:randomUUID(),owner:randomUUID(),other:randomUUID(),dispatcher:randomUUID(),scheduler:randomUUID(),tutor:randomUUID(),foreignTutor:randomUUID(),pet:randomUUID(),foreignPet:randomUUID(),prof:randomUUID(),secondProf:randomUUID(),ownProf:randomUUID(),bath:randomUUID(),taxi:randomUUID(),pickup:randomUUID(),dropoff:randomUUID(),foreignService:randomUUID(),driver:randomUUID(),secondDriver:randomUUID(),foreignDriver:randomUUID()};
const tenants=[ids.a,ids.b],users=[ids.owner,ids.other,ids.dispatcher,ids.scheduler];
const password='Taxi-dog-isolated-'+randomUUID(),tag=randomUUID().slice(0,8),address=`Rua Fictícia ${tag}, 123, Bairro de Teste`,foreignSecret='OUTRA_EMPRESA_'+tag;
const sourceIp=`2001:db8:${randomUUID().slice(0,4)}:${randomUUID().slice(0,4)}::8`;
const rateKey=createHash('sha256').update('/login:'+sourceIp).digest('hex');
const privacyIps=new Set<string>();let privacyIpCounter=20;
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,base='',cookie='',foreignCookie='',dispatcherCookie='',schedulerCookie='',dayCounter=3;
type Reply={code:number;data:any;headers:Headers};
type TripDraft={driver_id:string;starts_at:string;ends_at:string};
type TaxiDraft={service_id:string;address:string;reference:string;notes:string;pickup?:TripDraft;dropoff?:TripDraft};
const day=(offset:number)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));
const when=(offset:number,hour:number,minute=0)=>`${day(offset)}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00-03:00`;
function futureDay(){return dayCounter++;}
async function call(path:string,method='GET',body?:unknown,session=cookie):Promise<Reply>{
 // Estes cenários verificam a custódia/privacidade, não o limitador de senha.
 // Cada confirmação usa um endereço de teste distinto, como a suíte de privacidade.
 let requestIp=sourceIp;
 if(method==='POST'&&/^\/privacy\/requests\/[^/]+\/(export|anonymize)$/.test(path)){
  requestIp=sourceIp.replace(/::8$/,'::'+String(privacyIpCounter++));privacyIps.add(requestIp);
 }
 const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-PetCore-Request':'1','X-Forwarded-For':requestIp,Cookie:session},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{data=text;}
 return {code:response.status,data,headers:response.headers};
}
async function login(name:string){const result=await call('/auth/login','POST',{email:`${name}-taxi-${tag}@example.test`,password},'');assert.equal(result.code,200,JSON.stringify(result.data));return(result.headers.get('set-cookie')??'').split(';')[0];}
async function enabled(value=true){const result=await call('/settings','PATCH',{late_tolerance_minutes:10,reminder_minutes_before:60,taxi_dog_enabled:value});assert.equal(result.code,200,JSON.stringify(result.data));return result;}
function draft(offset:number,driver=ids.driver,mode:'pickup'|'round_trip'='round_trip'):TaxiDraft{
 return {service_id:mode==='pickup'?ids.pickup:ids.taxi,address,reference:'Portão azul '+tag,notes:'Transportar com cuidado '+tag,pickup:{driver_id:driver,starts_at:when(offset,9),ends_at:when(offset,9,30)},...(mode==='round_trip'?{dropoff:{driver_id:driver,starts_at:when(offset,11,30),ends_at:when(offset,12)}}:{})};
}
function appointment(offset:number,taxi_dog?:TaxiDraft,professional=ids.prof,person={tutor:ids.tutor,pet:ids.pet}){return {tutor_id:person.tutor,pet_id:person.pet,professional_id:professional,service_ids:[ids.bath],starts_at:when(offset,10),notes:'Atendimento fictício '+tag,...(taxi_dog?{taxi_dog}:{})};}
async function createBooking(offset=futureDay(),taxi=draft(offset),professional=ids.prof,person={tutor:ids.tutor,pet:ids.pet}){
 const created=await call('/calendar/appointments','POST',appointment(offset,taxi,professional,person));assert.equal(created.code,201,JSON.stringify(created.data));
 const detail=await call(`/taxi-dog/appointments/${created.data.id}`);assert.equal(detail.code,200,JSON.stringify(detail.data));assert.ok(detail.data.booking);
 return {appointmentId:created.data.id as string,booking:detail.data.booking,offset};
}
async function tripStatus(trip:any,status:string,session=cookie,expected=trip.status){return call(`/taxi-dog/trips/${trip.id}/status`,'PATCH',{status,expected_status:expected},session);}
async function privacyRequest(tutor:string,kind:string){const result=await call('/privacy/requests','POST',{tutor_id:tutor,kind,description:'Pedido fictício recebido pessoalmente'});assert.equal(result.code,201,JSON.stringify(result.data));const verified=await call(`/privacy/requests/${result.data.id}`,'PATCH',{status:'in_progress',identity_verified:true,verification_method:'in_person'});assert.equal(verified.code,200,JSON.stringify(verified.data));return result.data.id as string;}

describe('Táxi Dog: transporte opcional, agenda, cobrança e privacidade',{concurrency:false},()=>{
 before(async()=>{
  const hash=await argon2.hash(password,{type:argon2.argon2id});
  await db.query('INSERT INTO tenants(id,name) VALUES($1,$2),($3,$4)',[ids.a,'Táxi A '+tag,ids.b,'Táxi B '+tag]);
  for(const [id,name] of [[ids.owner,'owner'],[ids.other,'other'],[ids.dispatcher,'dispatcher'],[ids.scheduler,'scheduler']])await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'Conta fictícia '+name,`${name}-taxi-${tag}@example.test`,hash]);
  await db.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($3,$4,'admin','{}'),($1,$5,'employee',ARRAY['taxi_dog']),($1,$6,'employee',ARRAY['appointments'])",[ids.a,ids.owner,ids.b,ids.other,ids.dispatcher,ids.scheduler]);
  await db.query("INSERT INTO tutors(id,tenant_id,name,phone) VALUES($1,$2,'Tutor fictício','11900000000'),($3,$4,$5,'11900000001')",[ids.tutor,ids.a,ids.foreignTutor,ids.b,foreignSecret]);
  await db.query("INSERT INTO pets(id,tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,'Luna fictícia','Cão','pequeno'),($4,$5,$6,'Pet estrangeiro','Cão','medio')",[ids.pet,ids.a,ids.tutor,ids.foreignPet,ids.b,ids.foreignTutor]);
  await db.query("INSERT INTO professionals(id,tenant_id,name,user_id) VALUES($1,$2,'Banhista A',NULL),($3,$2,'Banhista B',NULL),($4,$2,'Agenda própria',$5)",[ids.prof,ids.a,ids.secondProf,ids.ownProf,ids.scheduler]);
  await db.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes) VALUES($1,$2,'Banho fictício',6000,60)",[ids.bath,ids.a]);
  for(const professional of [ids.prof,ids.secondProf,ids.ownProf]){
   await db.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3)',[ids.a,professional,ids.bath]);
   for(let weekday=1;weekday<=7;weekday++)await db.query("INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) VALUES($1,$2,$3,'08:00','18:00')",[ids.a,professional,weekday]);
  }
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const bound=server.address();assert.ok(bound&&typeof bound!=='string');base=`http://127.0.0.1:${bound.port}`;
  cookie=await login('owner');foreignCookie=await login('other');dispatcherCookie=await login('dispatcher');schedulerCookie=await login('scheduler');
  for(const session of [cookie,foreignCookie])assert.equal((await call('/commercial/onboarding','POST',{plan:'free'},session)).code,200);
 });
 after(async()=>{
  if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  try{
   for(const table of ['audit_events','object_deletion_jobs','privacy_request_events','privacy_requests','business_operations','business_ledger','business_sale_items','business_sales','taxi_trips','taxi_bookings','taxi_drivers','notifications','reminder_delivery_attempts','reminder_jobs','appointment_events','appointment_services','appointments','crm_contacts','crm_tasks','waitlist','tutor_email_reminder_consent_events','pets','professional_absences','professional_breaks','professional_shifts','professional_services','professionals','services','tutors','tenant_subscriptions','memberships'])await db.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[tenants]);
   await db.query('DELETE FROM terms_acceptances WHERE user_id=ANY($1::uuid[])',[users]);
   const rateKeys=[rateKey,...users.flatMap(user=>[...privacyIps].map(ip=>createHash('sha256').update(`privacy:${user}:${ip}`).digest('hex')))];
   await db.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[rateKeys]);
   await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);
  }finally{await appPool.end();await db.end();}
 });

 test('empresas começam sem transporte e a ativação não altera a agenda comum',async()=>{
  assert.equal((await call('/settings')).data.taxi_dog_enabled,false);
  assert.equal((await call('/taxi-dog/options')).data.enabled,false);
  assert.equal((await call('/auth/me')).data.features.taxi_dog,false);
  const normal=await call('/calendar/appointments','POST',appointment(1));assert.equal(normal.code,201,JSON.stringify(normal.data));
  assert.equal((await call('/settings','PATCH',{late_tolerance_minutes:10,reminder_minutes_before:60,taxi_dog_enabled:true},dispatcherCookie)).code,403);
  await enabled();assert.equal((await call('/auth/me')).data.features.taxi_dog,true);
  assert.equal((await call('/auth/me','GET',undefined,foreignCookie)).data.features.taxi_dog,false);
  // Um formulário antigo de configurações não deve desligar silenciosamente o recurso.
  assert.equal((await call('/settings','PATCH',{late_tolerance_minutes:12,reminder_minutes_before:45})).code,200);
  assert.equal((await call('/settings')).data.taxi_dog_enabled,true);
  const services=[['taxi','Táxi ida e volta','round_trip',2500],['pickup','Táxi busca','pickup',1500],['dropoff','Táxi entrega','dropoff',1200]] as const;
  for(const [key,name,transport_mode,price_cents] of services){const result=await call('/data/services','POST',{name,description:'Transporte fictício',price_cents,service_type:'transport',transport_mode,duration_minutes:0,active:true});assert.equal(result.code,201,JSON.stringify(result.data));ids[key]=result.data.id;}
  for(const key of ['driver','secondDriver'] as const){const result=await call('/taxi-dog/drivers','POST',{name:'Motorista '+key,phone:'11900000002',active:true});assert.equal(result.code,201,JSON.stringify(result.data));ids[key]=result.data.id;}
  await db.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes,service_type,transport_mode) VALUES($1,$2,$3,9000,0,'transport','pickup')",[ids.foreignService,ids.b,foreignSecret]);
  await db.query('INSERT INTO taxi_drivers(id,tenant_id,name,phone,active) VALUES($1,$2,$3,$4,true)',[ids.foreignDriver,ids.b,foreignSecret,'11900000003']);
 });

 test('catálogo distingue transporte e não o inclui na duração nem na jornada do banhista',async()=>{
  const services=await call('/data/services');assert.equal(services.code,200);assert.equal(services.data.find((item:any)=>item.id===ids.taxi).duration_minutes,0);
  const options=await call('/calendar/options');assert.equal(options.code,200);assert.ok(!options.data.services.some((item:any)=>item.id===ids.taxi));assert.ok(options.data.taxi_dog.services.some((item:any)=>item.id===ids.taxi));
  const professionalOptions=await call('/options/professional-services');assert.ok(!professionalOptions.data.some((item:any)=>item.id===ids.taxi));
  const badSchedule=await call(`/professionals/${ids.prof}/schedule`,'PUT',{shifts:[{weekday:1,start_time:'08:00',end_time:'18:00'}],breaks:[],serviceIds:[ids.bath,ids.taxi]});assert.equal(badSchedule.code,422);
  const usedAsBath=await call('/calendar/appointments','POST',{...appointment(futureDay()),service_ids:[ids.taxi]});assert.equal(usedAsBath.code,422);
  const waiting=await call('/calendar/waitlist','POST',{tutor_id:ids.tutor,pet_id:ids.pet,service_id:ids.taxi,professional_id:ids.prof,earliest_at:when(2,9),latest_at:when(2,12),notes:''});assert.equal(waiting.code,422);
  const malformed=await call('/data/services','POST',{name:'Banho inválido',price_cents:1,duration_minutes:0,service_type:'appointment'});assert.equal(malformed.code,422);
 });

 test('novo agendamento salva busca e entrega atomicamente com preço congelado e sem alongar o banho',async()=>{
  const booked=await createBooking();assert.equal(booked.booking.price_cents,2500);assert.equal(booked.booking.mode,'round_trip');assert.equal(booked.booking.address,address);assert.equal(booked.booking.trips.length,2);
  const persisted=await db.query('SELECT extract(epoch FROM (ends_at-starts_at))/60 AS minutes FROM appointments WHERE tenant_id=$1 AND id=$2',[ids.a,booked.appointmentId]);assert.equal(Number(persisted.rows[0].minutes),60);
  const appointmentServices=await db.query('SELECT service_id FROM appointment_services WHERE tenant_id=$1 AND appointment_id=$2',[ids.a,booked.appointmentId]);assert.deepEqual(appointmentServices.rows.map(row=>row.service_id),[ids.bath]);
  const trips=await call(`/taxi-dog/trips?from=${day(booked.offset)}&to=${day(booked.offset)}`);assert.equal(trips.code,200);assert.equal(trips.data.items.length,2);assert.ok(trips.data.items.every((trip:any)=>trip.address===address&&trip.pet_name==='Luna fictícia'));
  const serializedAudit=JSON.stringify((await db.query("SELECT metadata FROM audit_events WHERE tenant_id=$1 AND action LIKE 'taxi%'",[ids.a])).rows);assert.ok(!serializedAudit.includes(address));
 });

 test('dados incoerentes, referências alheias e horários passados não deixam reservas parciais',async()=>{
  const offset=futureDay(),valid=draft(offset),count=await db.query('SELECT count(*)::int AS n FROM appointments WHERE tenant_id=$1',[ids.a]);
  const attempts=[{...valid,address:' '},{...valid,pickup:undefined},{...valid,service_id:ids.foreignService},{...valid,pickup:{...valid.pickup!,driver_id:ids.foreignDriver}},{...valid,pickup:{...valid.pickup!,ends_at:when(offset,10,30)}},{...valid,dropoff:{...valid.dropoff!,starts_at:when(offset,10,30)}},{...valid,pickup:{...valid.pickup!,starts_at:when(-1,9),ends_at:when(-1,9,30)}},{...valid,pickup:{...valid.pickup!,ends_at:when(offset,8)}}];
  for(const taxi of attempts){const result=await call('/calendar/appointments','POST',appointment(offset,taxi));assert.ok([404,422].includes(result.code),JSON.stringify(result));}
  assert.equal((await db.query('SELECT count(*)::int AS n FROM appointments WHERE tenant_id=$1',[ids.a])).rows[0].n,count.rows[0].n);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM appointments a LEFT JOIN appointment_services s ON s.tenant_id=a.tenant_id AND s.appointment_id=a.id WHERE a.tenant_id=$1 AND s.appointment_id IS NULL',[ids.a])).rows[0].n,0);
 });

 test('listas e alterações de transporte respeitam a empresa da sessão',async()=>{
  const booked=await createBooking(),trip=booked.booking.trips[0];
  const foreign=await call('/taxi-dog/drivers','GET',undefined,foreignCookie);assert.equal(foreign.code,200);assert.ok(!foreign.data.items.some((row:any)=>row.id===ids.driver));
  assert.equal((await call(`/taxi-dog/appointments/${booked.appointmentId}`,'GET',undefined,foreignCookie)).code,404);
  assert.equal((await call(`/taxi-dog/drivers/${ids.driver}`,'PATCH',{name:'Não alterar',phone:'11900000000',active:true},foreignCookie)).code,404);
  assert.equal((await tripStatus(trip,'en_route',foreignCookie)).code,404);
  const list=await call(`/taxi-dog/trips?from=${day(0)}&to=${day(31)}`,'GET',undefined,foreignCookie);assert.equal(list.code,200);assert.ok(!list.data.items.some((row:any)=>row.id===trip.id));
 });

 test('permissão de Táxi Dog não concede cadastros ou agenda e o agendador não recebe endereços',async()=>{
  assert.equal((await call('/taxi-dog/options','GET',undefined,'')).code,401);
  assert.equal((await call('/taxi-dog/options','GET',undefined,schedulerCookie)).code,403);
  assert.equal((await call('/taxi-dog/options','GET',undefined,dispatcherCookie)).code,200);
  assert.equal((await call('/calendar/options','GET',undefined,dispatcherCookie)).code,403);
  assert.equal((await call('/data/tutors','GET',undefined,dispatcherCookie)).code,403);
  assert.equal((await call('/business/sales','GET',undefined,dispatcherCookie)).code,403);
  const options=await call('/calendar/options','GET',undefined,schedulerCookie);assert.equal(options.code,200);assert.deepEqual(options.data.professionals.map((row:any)=>row.id),[ids.ownProf]);assert.equal(options.data.taxi_dog.can_manage,false);assert.deepEqual(options.data.taxi_dog.drivers,[]);
  const offset=futureDay(),denied=await call('/calendar/appointments','POST',appointment(offset,draft(offset),ids.ownProf),schedulerCookie);assert.equal(denied.code,403);
 });

 test('concorrência do motorista permite uma única reserva e reverte o atendimento perdedor',async()=>{
  const offset=futureDay(),before=await db.query('SELECT count(*)::int AS n FROM appointments WHERE tenant_id=$1',[ids.a]);
  const secondTutor=(await db.query("INSERT INTO tutors(tenant_id,name) VALUES($1,'Outro tutor da corrida concorrente') RETURNING id",[ids.a])).rows[0].id;
  const secondPet=(await db.query("INSERT INTO pets(tenant_id,tutor_id,name,species,size) VALUES($1,$2,'Outro pet da corrida concorrente','Cão','pequeno') RETURNING id",[ids.a,secondTutor])).rows[0].id;
  // Tutores e profissionais distintos evitam que outras travas serializem o
  // teste antes da disputa pela mesma agenda do motorista.
  const contenders=[{professional:ids.prof,person:{tutor:ids.tutor,pet:ids.pet}},{professional:ids.secondProf,person:{tutor:secondTutor,pet:secondPet}}];
  const results=await Promise.all(contenders.map(({professional,person})=>call('/calendar/appointments','POST',appointment(offset,draft(offset),professional,person))));assert.deepEqual(results.map(result=>result.code).sort(),[201,409],JSON.stringify(results));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM appointments WHERE tenant_id=$1',[ids.a])).rows[0].n,before.rows[0].n+1);
 });

 test('situações seguem a ordem, detectam tela antiga e preservam um pet em transporte',async()=>{
  const booked=await createBooking(),pickup=booked.booking.trips.find((trip:any)=>trip.leg==='pickup'),delivery=booked.booking.trips.find((trip:any)=>trip.leg==='dropoff');
  assert.equal((await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:'confirmed'})).code,200);
  assert.equal((await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:'in_progress'})).code,409);
  assert.equal((await tripStatus(pickup,'completed')).code,409);
  const onWay=await tripStatus(pickup,'en_route',dispatcherCookie);assert.equal(onWay.code,200,JSON.stringify(onWay.data));
  assert.equal((await tripStatus(pickup,'with_pet')).code,409);
  const withPet=await tripStatus({...pickup,status:'en_route'},'with_pet',dispatcherCookie);assert.equal(withPet.code,200);
  assert.equal((await call(`/taxi-dog/appointments/${booked.appointmentId}`,'PUT',{taxi_dog:null})).code,409);
  assert.equal((await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:'cancelled'})).code,409);
  assert.equal((await tripStatus({...pickup,status:'with_pet'},'completed',dispatcherCookie)).code,200);
  assert.equal((await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:'in_progress'})).code,200);
  assert.equal((await tripStatus(delivery,'with_pet',dispatcherCookie)).code,409);
  assert.equal((await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:'done'})).code,200);
  assert.equal((await tripStatus(delivery,'with_pet',dispatcherCookie)).code,200);
  assert.equal((await tripStatus({...delivery,status:'with_pet'},'completed',dispatcherCookie)).code,200);
 });

 test('motorista não inicia outra corrida enquanto a anterior está em andamento, mesmo após seu fim previsto',async()=>{
  const firstDay=futureDay(),secondDay=futureDay();
  const first=await createBooking(firstDay,draft(firstDay,ids.secondDriver,'pickup'));
  const second=await createBooking(secondDay,draft(secondDay,ids.secondDriver,'pickup'));
  const firstTrip=first.booking.trips[0],secondTrip=second.booking.trips[0];
  assert.equal((await tripStatus(firstTrip,'en_route',dispatcherCookie)).code,200);
  // Intervalos previstos diferentes não autorizam abandonar uma corrida efetivamente ativa.
  assert.equal((await tripStatus(secondTrip,'en_route',dispatcherCookie)).code,409);
  assert.equal((await tripStatus({...firstTrip,status:'en_route'},'with_pet',dispatcherCookie)).code,200);
  assert.equal((await tripStatus(secondTrip,'en_route',dispatcherCookie)).code,409);
  assert.equal((await tripStatus({...firstTrip,status:'with_pet'},'completed',dispatcherCookie)).code,200);
  assert.equal((await tripStatus(secondTrip,'en_route',dispatcherCookie)).code,200);
  assert.equal((await tripStatus({...secondTrip,status:'en_route'},'with_pet',dispatcherCookie)).code,200);
  assert.equal((await tripStatus({...secondTrip,status:'with_pet'},'completed',dispatcherCookie)).code,200);
 });

 test('reagendar exige transporte compatível e salva horários juntos sem duplicar corridas',async()=>{
  const booked=await createBooking(),newOffset=futureDay();
  const incompatible=await call(`/calendar/appointments/${booked.appointmentId}/move`,'POST',{starts_at:when(booked.offset,8),professional_id:ids.prof,mode:'anticipate',reason:'Antecipação fictícia',tutor_consent:true});assert.ok([409,422].includes(incompatible.code));
  assert.equal(new Date((await db.query('SELECT starts_at FROM appointments WHERE id=$1',[booked.appointmentId])).rows[0].starts_at).toISOString(),new Date(when(booked.offset,10)).toISOString());
  const moved=await call(`/calendar/appointments/${booked.appointmentId}/move`,'POST',{starts_at:when(newOffset,10),professional_id:ids.prof,mode:'reschedule',reason:'Novo dia combinado',tutor_consent:true,taxi_dog:draft(newOffset)});assert.equal(moved.code,200,JSON.stringify(moved.data));
  const current=(await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking;assert.equal(current.trips.length,2);assert.ok(current.trips.every((trip:any)=>new Date(trip.starts_at).toISOString().slice(0,10)===day(newOffset)));
 });

 test('cancelamento e falta cancelam transportes ainda não iniciados',async()=>{
  for(const status of ['cancelled','no_show']){
   const booked=await createBooking();
   // Falta só pode ser registrada depois da tolerância. A criação pela API
   // continua no futuro; este UPDATE representa um atendimento histórico.
   if(status==='no_show'){
    await db.query("UPDATE appointments SET starts_at=starts_at-interval '90 days',ends_at=ends_at-interval '90 days' WHERE tenant_id=$1 AND id=$2",[ids.a,booked.appointmentId]);
    await db.query("UPDATE taxi_trips SET starts_at=starts_at-interval '90 days',ends_at=ends_at-interval '90 days' WHERE tenant_id=$1 AND booking_id=$2",[ids.a,booked.booking.id]);
   }
   const changed=await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status});assert.equal(changed.code,200,JSON.stringify(changed.data));
   const current=(await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking;assert.ok(current.cancelled_at);assert.ok(current.trips.every((trip:any)=>trip.status==='cancelled'));
  }
  assert.equal((await call('/settings','PATCH',{late_tolerance_minutes:10,reminder_minutes_before:60,taxi_dog_enabled:false})).code,409);
 });

 test('cancelar apenas um trecho protege o restante sem recriar a busca cancelada',async()=>{
  const booked=await createBooking(),pickup=booked.booking.trips.find((trip:any)=>trip.leg==='pickup'),delivery=booked.booking.trips.find((trip:any)=>trip.leg==='dropoff');
  assert.equal((await tripStatus(pickup,'cancelled')).code,200);
  const partiallyCancelled=(await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking;
  assert.equal(partiallyCancelled.cancelled_at,null);assert.equal(partiallyCancelled.editable,false);
  const edited=await call(`/taxi-dog/appointments/${booked.appointmentId}`,'PUT',{taxi_dog:{...draft(booked.offset),address:address+' complemento novo'}});
  assert.equal(edited.code,409,JSON.stringify(edited.data));
  const unchanged=(await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking;
  assert.equal(unchanged.address,address);assert.equal(unchanged.trips.find((trip:any)=>trip.leg==='pickup').status,'cancelled');assert.equal(unchanged.trips.find((trip:any)=>trip.leg==='dropoff').status,'scheduled');
  assert.equal((await tripStatus(delivery,'cancelled')).code,200);
  assert.ok((await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking.cancelled_at);
 });

 test('reagendamento conserva o serviço inativo já reservado sem liberar novas reservas dele',async()=>{
  const booked=await createBooking(),nextOffset=futureDay();
  const archived=await call(`/data/services/${ids.taxi}`,'PATCH',{name:'Transporte novo nome',price_cents:9900,active:false});assert.equal(archived.code,200);
  try{
   const moved=await call(`/calendar/appointments/${booked.appointmentId}/move`,'POST',{starts_at:when(nextOffset,10),professional_id:ids.prof,mode:'reschedule',reason:'Novo dia combinado com o tutor',tutor_consent:true,taxi_dog:draft(nextOffset)});
   assert.equal(moved.code,200,JSON.stringify(moved.data));
   const preserved=(await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking;
   assert.equal(preserved.service_name,booked.booking.service_name);assert.equal(preserved.price_cents,2500);assert.equal(preserved.mode,'round_trip');
   assert.ok(preserved.trips.every((trip:any)=>new Date(trip.starts_at).toISOString().slice(0,10)===day(nextOffset)));
   const newOffset=futureDay(),rejected=await call('/calendar/appointments','POST',appointment(newOffset,draft(newOffset)));assert.equal(rejected.code,422,JSON.stringify(rejected.data));
  }finally{const restored=await call(`/data/services/${ids.taxi}`,'PATCH',{name:'Táxi ida e volta',price_cents:2500,active:true});assert.equal(restored.code,200);}
 });

 test('cancelar todos os trechos retira a taxa da importação da comanda',async()=>{
  const booked=await createBooking();
  for(const trip of booked.booking.trips)assert.equal((await tripStatus(trip,'cancelled')).code,200);
  const cancelled=(await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking;assert.ok(cancelled.cancelled_at);assert.ok(cancelled.trips.every((trip:any)=>trip.status==='cancelled'));
  await db.query("UPDATE appointments SET starts_at=starts_at-interval '90 days',ends_at=ends_at-interval '90 days',status='done' WHERE tenant_id=$1 AND id=$2",[ids.a,booked.appointmentId]);
  const created=await call('/business/sales','POST',{tutor_id:ids.tutor,appointment_id:booked.appointmentId,items:[],discount_cents:0,due_date:day(0),notes:'Somente banho realizado',idempotency_key:randomUUID()});
  assert.equal(created.code,201,JSON.stringify(created.data));assert.equal(created.data.total_cents,6000);assert.equal(created.data.paid_cents,0);
  const detail=await call(`/business/sales/${created.data.id}`);assert.equal(detail.code,200);assert.equal(detail.data.items.length,1);assert.equal(detail.data.items[0].service_id,ids.bath);
 });

 test('banho cancelado preserva a volta do pet e cobra somente o transporte realizado',async()=>{
  const tutor=(await db.query("INSERT INTO tutors(tenant_id,name,phone) VALUES($1,'Titular de retorno','11900000005') RETURNING id",[ids.a])).rows[0].id;
  const pet=(await db.query("INSERT INTO pets(tenant_id,tutor_id,name,species,size) VALUES($1,$2,'Pet de retorno','Cão','pequeno') RETURNING id",[ids.a,tutor])).rows[0].id;
  const offset=futureDay(),booked=await createBooking(offset,draft(offset,ids.secondDriver),ids.prof,{tutor,pet});
  const pickup=booked.booking.trips.find((trip:any)=>trip.leg==='pickup'),delivery=booked.booking.trips.find((trip:any)=>trip.leg==='dropoff');
  assert.equal((await tripStatus(pickup,'en_route')).code,200);assert.equal((await tripStatus({...pickup,status:'en_route'},'with_pet')).code,200);assert.equal((await tripStatus({...pickup,status:'with_pet'},'completed')).code,200);
  assert.equal((await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:'cancelled'})).code,200);
  const awaitingReturn=(await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking;
  assert.equal(awaitingReturn.cancelled_at,null);assert.equal(awaitingReturn.trips.find((trip:any)=>trip.leg==='dropoff').status,'scheduled');
  const anonymous=await privacyRequest(tutor,'anonymization'),body={password,confirmation:'ANONIMIZAR',reason:'subject_request',retention_reviewed:true};
  const guarded=await call(`/privacy/requests/${anonymous}/anonymize`,'POST',body);assert.equal(guarded.code,409,JSON.stringify(guarded.data));assert.match(guarded.data.error,/aguardando a entrega/i);
  assert.equal((await db.query('SELECT address FROM taxi_bookings WHERE tenant_id=$1 AND id=$2',[ids.a,booked.booking.id])).rows[0].address,address);
  assert.equal((await tripStatus(delivery,'with_pet')).code,200);assert.equal((await tripStatus({...delivery,status:'with_pet'},'completed')).code,200);
  const choices=await call('/business/options');assert.equal(choices.code,200);assert.equal(choices.data.appointments.find((item:any)=>item.id===booked.appointmentId)?.status,'cancelled');
  const created=await call('/business/sales','POST',{tutor_id:tutor,appointment_id:booked.appointmentId,items:[],discount_cents:0,due_date:day(0),notes:'Banho cancelado; transporte realizado',idempotency_key:randomUUID()});
  assert.equal(created.code,201,JSON.stringify(created.data));assert.equal(created.data.total_cents,2500);assert.equal(created.data.paid_cents,0);
  const detail=await call(`/business/sales/${created.data.id}`);assert.equal(detail.code,200);assert.equal(detail.data.items.length,1);assert.equal(detail.data.items[0].service_id,ids.taxi);assert.equal(detail.data.items[0].unit_price_cents,2500);
  const redacted=await call(`/privacy/requests/${anonymous}/anonymize`,'POST',body);assert.equal(redacted.code,200,JSON.stringify(redacted.data));
  const cleared=(await db.query('SELECT address,reference,notes FROM taxi_bookings WHERE tenant_id=$1 AND id=$2',[ids.a,booked.booking.id])).rows[0];assert.deepEqual(cleared,{address:'',reference:'',notes:''});
 });

 test('chegada com o tutor permite iniciar o banho e preserva a entrega se o banho for cancelado',async()=>{
  const booked=await createBooking(),pickup=booked.booking.trips.find((trip:any)=>trip.leg==='pickup'),delivery=booked.booking.trips.find((trip:any)=>trip.leg==='dropoff');
  // O tutor trouxe o pet por conta própria: a busca foi cancelada, mas o
  // início real do atendimento registra que o pet chegou ao estabelecimento.
  assert.equal((await tripStatus(pickup,'cancelled')).code,200);
  assert.equal((await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:'confirmed'})).code,200);
  assert.equal((await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:'in_progress'})).code,200);
  const cancelled=await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:'cancelled'});assert.equal(cancelled.code,200,JSON.stringify(cancelled.data));
  const preserved=(await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking;
  assert.equal(preserved.cancelled_at,null);assert.equal(preserved.trips.find((trip:any)=>trip.leg==='pickup').status,'cancelled');assert.equal(preserved.trips.find((trip:any)=>trip.leg==='dropoff').status,'scheduled');
  const returning=await tripStatus(delivery,'with_pet');assert.equal(returning.code,200,JSON.stringify(returning.data));
  assert.equal((await tripStatus({...delivery,status:'with_pet'},'completed')).code,200);
 });

 test('privacidade preserva endereço de entrega pendente após atendimento concluído ou cancelado',async()=>{
  for(const status of ['done','cancelled']){
   const tutor=(await db.query("INSERT INTO tutors(tenant_id,name) VALUES($1,'Titular de entrega pendente') RETURNING id",[ids.a])).rows[0].id;
   const pet=(await db.query("INSERT INTO pets(tenant_id,tutor_id,name,species,size) VALUES($1,$2,'Pet com entrega pendente','Cão','pequeno') RETURNING id",[ids.a,tutor])).rows[0].id;
   const offset=futureDay(),taxi:TaxiDraft={...draft(offset,ids.secondDriver),service_id:ids.dropoff,pickup:undefined};
   const booked=await createBooking(offset,taxi,ids.prof,{tutor,pet}),delivery=booked.booking.trips[0];
   assert.equal(delivery.leg,'dropoff');assert.equal(booked.booking.trips.length,1);
   for(const next of ['confirmed','in_progress',status]){const changed=await call(`/calendar/appointments/${booked.appointmentId}/status`,'POST',{status:next});assert.equal(changed.code,200,JSON.stringify(changed.data));}
   const anonymous=await privacyRequest(tutor,'anonymization'),body={password,confirmation:'ANONIMIZAR',reason:'subject_request',retention_reviewed:true};
   const guarded=await call(`/privacy/requests/${anonymous}/anonymize`,'POST',body);assert.equal(guarded.code,409,JSON.stringify(guarded.data));assert.match(guarded.data.error,/entrega|retorno|devolu/i);
   assert.equal((await db.query('SELECT address FROM taxi_bookings WHERE tenant_id=$1 AND id=$2',[ids.a,booked.booking.id])).rows[0].address,address);
   assert.equal((await db.query('SELECT anonymized_at FROM tutors WHERE tenant_id=$1 AND id=$2',[ids.a,tutor])).rows[0].anonymized_at,null);
   const returning=await tripStatus(delivery,'with_pet');assert.equal(returning.code,200,JSON.stringify(returning.data));
   assert.equal((await tripStatus({...delivery,status:'with_pet'},'completed')).code,200);
   const anonymized=await call(`/privacy/requests/${anonymous}/anonymize`,'POST',body);assert.equal(anonymized.code,200,JSON.stringify(anonymized.data));
   assert.equal((await db.query('SELECT address FROM taxi_bookings WHERE tenant_id=$1 AND id=$2',[ids.a,booked.booking.id])).rows[0].address,'');
  }
 });

 test('trocar reserva totalmente cancelada de ida e volta para busca não revive o trecho antigo',async()=>{
  const booked=await createBooking(),obsoleteDropoff=booked.booking.trips.find((trip:any)=>trip.leg==='dropoff');
  for(const trip of booked.booking.trips)assert.equal((await tripStatus(trip,'cancelled')).code,200);
  const replacement=await call(`/taxi-dog/appointments/${booked.appointmentId}`,'PUT',{taxi_dog:draft(booked.offset,ids.driver,'pickup')});assert.equal(replacement.code,200,JSON.stringify(replacement.data));
  const current=replacement.data.booking;assert.equal(current.mode,'pickup');assert.equal(current.cancelled_at,null);assert.equal(current.editable,true);assert.equal(current.price_cents,1500);assert.deepEqual(current.trips.map((trip:any)=>trip.leg),['pickup']);assert.equal(current.trips[0].status,'scheduled');
  const listed=await call(`/taxi-dog/trips?from=${day(booked.offset)}&to=${day(booked.offset)}`);assert.equal(listed.code,200);const relevant=listed.data.items.filter((trip:any)=>trip.booking_id===booked.booking.id);assert.deepEqual(relevant.map((trip:any)=>trip.leg),['pickup']);
  const stale=await tripStatus(obsoleteDropoff,'with_pet',cookie,'scheduled');assert.ok([404,409].includes(stale.code),JSON.stringify(stale.data));
  const edited=await call(`/taxi-dog/appointments/${booked.appointmentId}`,'PUT',{taxi_dog:{...draft(booked.offset,ids.driver,'pickup'),address:address+' complemento atualizado'}});assert.equal(edited.code,200,JSON.stringify(edited.data));
  const nextOffset=futureDay(),moved=await call(`/calendar/appointments/${booked.appointmentId}/move`,'POST',{starts_at:when(nextOffset,10),professional_id:ids.prof,mode:'reschedule',reason:'Reagendamento da busca',tutor_consent:true,taxi_dog:draft(nextOffset,ids.driver,'pickup')});assert.equal(moved.code,200,JSON.stringify(moved.data));
  const afterMove=(await call(`/taxi-dog/appointments/${booked.appointmentId}`)).data.booking;assert.equal(afterMove.mode,'pickup');assert.equal(afterMove.editable,true);assert.equal(afterMove.trips.length,1);assert.equal(new Date(afterMove.trips[0].starts_at).toISOString().slice(0,10),day(nextOffset));
 });

 test('comanda importa o transporte uma vez pelo preço reservado e congela alterações de cobrança',async()=>{
  const booked=await createBooking();
  // Representa um atendimento histórico concluído; a API continua proibindo criar no passado.
  await db.query("UPDATE appointments SET starts_at=starts_at-interval '90 days',ends_at=ends_at-interval '90 days',status='done' WHERE id=$1",[booked.appointmentId]);
  await db.query("UPDATE taxi_trips SET starts_at=starts_at-interval '90 days',ends_at=ends_at-interval '90 days',status='completed' WHERE booking_id=$1",[booked.booking.id]);
  const original=await call(`/data/services/${ids.taxi}`,'PATCH',{name:'Táxi novo preço',price_cents:8900});assert.equal(original.code,200);
  try{
   const body={tutor_id:ids.tutor,appointment_id:booked.appointmentId,items:[],discount_cents:0,due_date:day(0),notes:'Comanda fictícia',idempotency_key:randomUUID()};
   const created=await call('/business/sales','POST',body);assert.equal(created.code,201,JSON.stringify(created.data));assert.equal(created.data.total_cents,8500);assert.equal(created.data.paid_cents,0);
   const detail=await call(`/business/sales/${created.data.id}`);assert.equal(detail.code,200);const transport=detail.data.items.filter((item:any)=>item.service_id===ids.taxi);assert.equal(transport.length,1);assert.equal(transport[0].unit_price_cents,2500);assert.equal(transport[0].description,booked.booking.service_name);
   const retried=await call('/business/sales','POST',body);assert.equal(retried.code,201);assert.equal(retried.data.id,created.data.id);
   assert.equal((await call('/business/sales','POST',{...body,idempotency_key:randomUUID()})).code,409);
   assert.equal((await call(`/taxi-dog/appointments/${booked.appointmentId}`,'PUT',{taxi_dog:null})).code,409);
  }finally{const restored=await call(`/data/services/${ids.taxi}`,'PATCH',{name:'Táxi ida e volta',price_cents:2500});assert.equal(restored.code,200);}
 });

 test('exportação inclui transporte do titular e anonimização remove endereço sem perder pet em trânsito',async()=>{
  const tutor=(await db.query("INSERT INTO tutors(tenant_id,name,phone) VALUES($1,'Titular de transporte','11900000004') RETURNING id",[ids.a])).rows[0].id;
  const pet=(await db.query("INSERT INTO pets(tenant_id,tutor_id,name,species,size) VALUES($1,$2,'Pet de transporte','Cão','pequeno') RETURNING id",[ids.a,tutor])).rows[0].id;
  const offset=futureDay(),taxi={...draft(offset,ids.secondDriver,'pickup'),address:address+' DIREITO_DO_TITULAR',reference:'Referência pessoal '+tag,notes:'Nota pessoal '+tag};
  const booked=await createBooking(offset,taxi,ids.prof,{tutor,pet});
  const access=await privacyRequest(tutor,'access');const exported=await call(`/privacy/requests/${access}/export`,'POST',{password});assert.equal(exported.code,200,JSON.stringify(exported.data));
  assert.equal(exported.data.taxi_dog.bookings.length,1);assert.equal(exported.data.taxi_dog.bookings[0].address,taxi.address);assert.equal(exported.data.taxi_dog.trips.length,1);assert.ok(!JSON.stringify(exported.data).includes(foreignSecret));
  const anonymous=await privacyRequest(tutor,'anonymization'),trip=booked.booking.trips[0],body={password,confirmation:'ANONIMIZAR',reason:'subject_request',retention_reviewed:true};
  assert.equal((await tripStatus(trip,'en_route')).code,200);assert.equal((await tripStatus({...trip,status:'en_route'},'with_pet')).code,200);
  assert.equal((await call(`/privacy/requests/${anonymous}/anonymize`,'POST',body)).code,409);
  assert.equal((await db.query('SELECT anonymized_at FROM tutors WHERE id=$1',[tutor])).rows[0].anonymized_at,null);
  assert.equal((await tripStatus({...trip,status:'with_pet'},'completed')).code,200);
  const result=await call(`/privacy/requests/${anonymous}/anonymize`,'POST',body);assert.equal(result.code,200,JSON.stringify(result.data));
  const redacted=(await db.query('SELECT address,reference,notes FROM taxi_bookings WHERE tenant_id=$1 AND id=$2',[ids.a,booked.booking.id])).rows[0];assert.equal(redacted.address,'');assert.equal(redacted.reference,'');assert.equal(redacted.notes,'');
  assert.equal((await call(`/taxi-dog/appointments/${booked.appointmentId}`,'PUT',{taxi_dog:taxi})).code,409);
 });
});
