// Own fixtures in an exclusive *_test database. Never contact location providers.
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';

const address=process.env.TEST_DATABASE_URL;
if(!address||!decodeURIComponent(new URL(address).pathname).endsWith('_test'))throw Error('Tracking requires an isolated TEST_DATABASE_URL ending in _test, with migration 025.');
Object.assign(process.env,{DATABASE_URL:address,DATABASE_DIRECT_URL:address,NODE_ENV:'test',SESSION_SECRET:'tracking-fixture-'+randomUUID()+randomUUID(),EMAIL_PROVIDER:'none',EMAIL_API_KEY:'',RESEND_API_KEY:'',REMINDER_EMAILS_ENABLED:'false',REMINDER_EMAILS_CONFIRM_SEND:'NO',SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO',APP_ORIGIN:'https://tracking.example.test'});
process.env.DATABASE_SSL??=new URL(address).searchParams.has('sslmode')?'true':'false';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const {stopUserTracking}=await import('../src/trackingService.js');
const db=new pg.Pool({connectionString:address,max:5,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});db.on('error',()=>{});
const companies=[randomUUID(),randomUUID()],users=Array.from({length:6},()=>randomUUID()),drivers=[randomUUID(),randomUUID(),randomUUID()],tutors=[randomUUID(),randomUUID()],pets=[randomUUID(),randomUUID()],professionals=[randomUUID(),randomUUID()],services=[randomUUID(),randomUUID()],run=randomUUID();
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,base='',owner='',driver='',otherDriver='',finance='',foreign='',reader='',prepared=false,serial=0,sequence=0,external=0;
const password='Gps-fixture-'+randomUUID(),email=(i:number)=>`${users[i]}@example.test`,ips=new Set<string>(),grantRateKeys=new Set<string>(),originalFetch=globalThis.fetch;
globalThis.fetch=(async(...args:Parameters<typeof fetch>)=>{const url=new URL(args[0] instanceof Request?args[0].url:String(args[0]));if(!base||url.origin!==base){external++;throw Error('No external email, route, map, storage or tracking requests in fixtures.');}return originalFetch(...args);}) as typeof fetch;
type Reply={code:number;data:any;headers:Headers};
async function call(path:string,method='GET',payload?:unknown,cookie=owner,grant?:string):Promise<Reply>{
 const ip=`2001:db8:${run.slice(0,4)}:${run.slice(4,8)}::${(++serial).toString(16)}`;ips.add(ip);
 const r=await fetch(base+'/api'+path,{method,headers:{Origin:process.env.APP_ORIGIN!,'X-PetCore-Request':'1','X-Forwarded-For':ip,'Content-Type':'application/json',Cookie:cookie,...(grant?{Authorization:'Bearer '+grant}:{})},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});return{code:r.status,data:await r.json(),headers:r.headers};
}
async function delivery(status='out_for_delivery',assigned=drivers[0],company=companies[0]){
 const user=company===companies[0]?users[0]:users[4],tutor=company===companies[0]?tutors[0]:tutors[1];
 const sale=(await db.query('INSERT INTO business_sales(tenant_id,tutor_id,subtotal_cents,total_cents,due_date,created_by) VALUES($1,$2,1500,1500,current_date,$3) RETURNING id',[company,tutor,user])).rows[0].id;
 return(await db.query("INSERT INTO business_delivery_orders(tenant_id,sale_id,status,address,phone,driver_id,created_by,updated_by,out_for_delivery_at) VALUES($1,$2,$3,'Rua de Teste, 123','11900000000',$4,$5,$5,CASE WHEN $3='out_for_delivery' THEN now() ELSE NULL END) RETURNING id",[company,sale,status,assigned,user])).rows[0].id as string;
}
async function taxi(status='en_route'){
 const start=new Date(Date.now()+(++sequence)*86400000).toISOString(),end=new Date(new Date(start).getTime()+3600000).toISOString();
 const appointment=(await db.query("INSERT INTO appointments(tenant_id,tutor_id,pet_id,professional_id,starts_at,ends_at,status,created_by) VALUES($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING id",[companies[0],tutors[0],pets[0],professionals[0],start,end,users[0]])).rows[0].id;
 const booking=(await db.query("INSERT INTO taxi_bookings(tenant_id,appointment_id,service_id,service_name,price_cents,mode,address,created_by) VALUES($1,$2,$3,'Táxi fixture',1000,'pickup','Rua do Tutor, 10',$4) RETURNING id",[companies[0],appointment,services[0],users[0]])).rows[0].id;
 return(await db.query("INSERT INTO taxi_trips(tenant_id,booking_id,leg,driver_id,starts_at,ends_at,status) VALUES($1,$2,'pickup',$3,$4,$5,$6) RETURNING id",[companies[0],booking,drivers[0],start,end,status])).rows[0].id as string;
}
async function start(id:string,which='delivery',cookie=driver){const reply=await call(`/transport/jobs/${which}/${id}/start`,'POST',{consent:true},cookie);if(reply.data.session_id)grantRateKeys.add(createHash('sha256').update('tracking-grant:'+reply.data.session_id).digest('hex'));return reply;}
const position=(captured=new Date().toISOString(),sequence=1)=>({latitude:-23.66,longitude:-46.53,accuracy:12,captured_at:captured,sequence});
const upload=(session:any,input=position())=>call(`/transport/tracking/${session.session_id}/positions`,'POST',input,'',session.upload_token);
const heartbeat=(session:any)=>call(`/transport/tracking/${session.session_id}/heartbeat`,'POST',{},'',session.upload_token);
async function share(session:any,cookie=owner){const r=await call(`/transport/tracking/${session.session_id}/share`,'POST',{},cookie);assert.equal(r.code,200,JSON.stringify(r.data));return r.data;}
async function started(id:string,which='delivery'){const r=await start(id,which);assert.equal(r.code,201,JSON.stringify(r.data));return r.data;}
async function loginCookie(index:number){const reply=await call('/auth/login','POST',{email:email(index),password},'');assert.equal(reply.code,200,JSON.stringify(reply.data));return(reply.headers.get('set-cookie')??'').split(';')[0];}
async function startWhileEndingLogin(id:string,cookie:string,end:()=>Promise<void>){
 const blocker=await db.connect();let pending:Promise<Reply>|undefined,locked=false;
 try{
  await blocker.query('BEGIN');locked=true;const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  await blocker.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[companies[0]]);pending=start(id,'delivery',cookie);
  const deadline=Date.now()+5000;let waiting=false;
  while(Date.now()<deadline){waiting=Boolean((await db.query('SELECT 1 FROM pg_stat_activity a WHERE a.datname=current_database() AND $1=ANY(pg_blocking_pids(a.pid))',[pid])).rowCount);if(waiting)break;await new Promise(resolve=>setTimeout(resolve,25));}
  assert.ok(waiting,'The authenticated start must be waiting on this fixture tenant lock.');
  await end();await blocker.query('COMMIT');locked=false;return await pending;
 }finally{if(locked)await blocker.query('ROLLBACK');blocker.release();await pending?.catch(()=>{});}
}
before(async()=>{
 const hash=await argon2.hash(password,{type:argon2.argon2id}),setup=await db.connect();await setup.query('BEGIN');try{
  await setup.query("INSERT INTO tenants(id,name,timezone,tracking_enabled,taxi_dog_enabled,delivery_enabled,shop_address,shop_latitude,shop_longitude) VALUES($1,$2,'UTC',true,true,true,'Pet shop fixture',-23.5,-46.5),($3,$4,'UTC',true,true,true,'Foreign shop',NULL,NULL)",[companies[0],'GPS A '+run,companies[1],'GPS B '+run]);
  for(const [i,id]of users.entries())await setup.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[id,'User '+i+' '+run,email(i),hash]);
  await setup.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($1,$3,'employee',ARRAY['transport_driver']),($1,$4,'employee',ARRAY['transport_driver']),($1,$5,'employee',ARRAY['finance']),($6,$7,'admin','{}'),($1,$8,'employee',ARRAY['appointments'])",[companies[0],...users.slice(0,4),companies[1],users[4],users[5]]);
  for(const company of companies)await setup.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[company]);
  for(const [index,company]of companies.entries()){
   await setup.query('INSERT INTO tutors(id,tenant_id,name,phone) VALUES($1,$2,$3,$4)',[tutors[index],company,'Tutor GPS '+index,'11900000000']);
   await setup.query("INSERT INTO pets(id,tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,'Pet GPS','Cão','pequeno')",[pets[index],company,tutors[index]]);
   await setup.query("INSERT INTO professionals(id,tenant_id,name) VALUES($1,$2,'Professional GPS')",[professionals[index],company]);
   await setup.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes,service_type,transport_mode) VALUES($1,$2,'Taxi GPS',1000,0,'transport','pickup')",[services[index],company]);
  }
  await setup.query("INSERT INTO taxi_drivers(id,tenant_id,name,user_id) VALUES($1,$2,'Driver GPS A',$3),($4,$2,'Other driver GPS A',$5),($6,$7,'Driver GPS B',$8)",[drivers[0],companies[0],users[1],drivers[1],users[2],drivers[2],companies[1],users[4]]);
  await setup.query('COMMIT');prepared=true;
 }catch(e){await setup.query('ROLLBACK');throw e;}finally{setup.release();}
 const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const listening=server.address();assert.ok(listening&&typeof listening!=='string');base=`http://127.0.0.1:${listening.port}`;
 const cookies:string[]=[];for(const [index]of users.entries())cookies.push(await loginCookie(index));
 [owner,driver,otherDriver,finance,foreign,reader]=cookies;
});
beforeEach(async()=>{
 if(!prepared)return;for(const user of users)await stopUserTracking(db,user);
 await db.query("UPDATE taxi_trips SET status='completed' WHERE tenant_id=ANY($1::uuid[]) AND status IN ('scheduled','en_route','with_pet')",[companies]);
 await db.query("UPDATE business_delivery_orders SET status='delivered',out_for_delivery_at=COALESCE(out_for_delivery_at,now()),delivered_at=now() WHERE tenant_id=ANY($1::uuid[]) AND status IN ('preparing','out_for_delivery')",[companies]);
});
after(async()=>{
 try{
  if(server){server.closeIdleConnections?.();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  if(prepared){const cleanup=await db.connect();await cleanup.query('BEGIN');try{
   await cleanup.query('DELETE FROM "session" WHERE sess::jsonb->>\'userId\'=ANY($1::text[])',[users]);
   for(const table of ['transport_tracking_sessions','audit_events','business_operations','business_delivery_events','business_delivery_orders','business_stock_movements','business_ledger','business_sale_items','business_sales','taxi_trips','taxi_bookings','reminder_jobs','notifications','appointment_events','appointment_services','appointments','tutor_email_reminder_consent_events','pets','professionals','services','taxi_drivers','tutors','tenant_subscriptions','memberships'])await cleanup.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,[companies]);
   await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await cleanup.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[companies]);
   const keys=[...ips].flatMap(ip=>[createHash('sha256').update('/login:'+ip).digest('hex'),createHash('sha256').update('tracking-public-ip:'+ip).digest('hex')]);
   keys.push(...grantRateKeys);
   keys.push(...companies.flatMap(company=>users.flatMap(user=>['tracking-start','tracking-share'].map(prefix=>createHash('sha256').update(`${prefix}:${company}:${user}`).digest('hex')))));
   await cleanup.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[keys]);await cleanup.query('COMMIT');
  }catch(e){await cleanup.query('ROLLBACK');throw e;}finally{cleanup.release();}}
 }finally{globalThis.fetch=originalFetch;await Promise.all([db.end(),appPool.end()]);}assert.equal(external,0);
});

test('settings and account binding are scoped to administrators and valid driver memberships',async()=>{
 assert.equal((await call('/transport/settings','GET',undefined,'')).code,401);assert.equal((await call('/transport/options','GET',undefined,driver)).code,403);
 assert.equal((await call('/transport/drivers','GET',undefined,finance)).code,200);
 assert.equal((await call(`/transport/drivers/${drivers[0]}/account`,'PATCH',{user_id:users[4]})).code,422);
 assert.equal((await call(`/transport/drivers/${drivers[0]}/account`,'PATCH',{user_id:users[3]})).code,422);
 assert.equal((await call('/transport/drivers','POST',{name:'Fresh driver '+run,user_id:users[1]})).code,409);
 const result=await call('/transport/options');assert.ok(result.data.users.some((u:any)=>u.id===users[1]));assert.ok(!result.data.users.some((u:any)=>u.id===users[4]));
});
test('drivers list only their assigned jobs while office permissions follow each source',async()=>{
 const own=await delivery(),other=await delivery('out_for_delivery',drivers[1]),externalJob=await delivery('out_for_delivery',drivers[2],companies[1]);
 const list=await call('/transport/my-jobs','GET',undefined,driver);assert.equal(list.code,200);assert.ok(list.data.items.some((job:any)=>job.id===own));assert.ok(!list.data.items.some((job:any)=>[other,externalJob].includes(job.id)));
 assert.equal((await call(`/transport/jobs/delivery/${own}`,'GET',undefined,finance)).code,200);
 assert.equal((await call(`/transport/jobs/delivery/${own}`,'GET',undefined,otherDriver)).code,403);
 assert.equal((await call(`/transport/jobs/delivery/${externalJob}`,'GET',undefined,driver)).code,404);
 assert.equal((await call(`/transport/jobs/delivery/${own}`,'GET',undefined,reader)).code,403);
});
test('sharing requires an explicit gesture, own assignment and an active source step',async()=>{
 const pending=await delivery('preparing');assert.equal((await start(pending)).code,409);
 const id=await delivery();assert.equal((await call(`/transport/jobs/delivery/${id}/start`,'POST',{consent:false},driver)).code,422);
 for(const cookie of [owner,otherDriver,foreign])assert.equal((await start(id,'delivery',cookie)).code,404);
 const startedSession=await started(id);assert.match(startedSession.upload_token,/^[a-f0-9]{64}$/);assert.ok(new Date(startedSession.expires_at).getTime()<=Date.now()+12*3600000);
 assert.equal(startedSession.upload_url,`${process.env.APP_ORIGIN}/api/transport/tracking/${startedSession.session_id}/positions`);
 const saved=(await db.query('SELECT * FROM transport_tracking_sessions WHERE id=$1',[startedSession.session_id])).rows[0];assert.notEqual(saved.upload_token_hash,startedSession.upload_token);assert.equal(saved.latitude,null);
});
test('upload validates coordinates, clocks and strict fields without accepting a caller-selected company',async()=>{
 const session=await started(await delivery());for(const wrong of [{...position(),latitude:91},{...position(),accuracy:-1},{...position(),captured_at:new Date(Date.now()-180000).toISOString()},{...position(),captured_at:new Date(Date.now()+60000).toISOString()},{...position(),tenant_id:companies[1]}])assert.equal((await upload(session,wrong)).code,422);
 assert.equal((await call(`/transport/tracking/${session.session_id}/positions`,'POST',position(),driver)).code,401);
 assert.equal((await call(`/transport/tracking/${session.session_id}/positions`,'POST',position(),'','f'.repeat(64))).code,410);
 assert.equal((await upload(session)).code,200);
});
test('an upload uses only its transaction connection when the rest of the application pool is busy',{timeout:20000},async()=>{
 const session=await started(await delivery()),maximum=appPool.options.max??10;
 assert.ok(maximum>=2,'The fixture needs at least two application connections.');
 const occupied:pg.PoolClient[]=[];let pending:Promise<Reply>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
 try{
  for(let index=0;index<maximum-1;index++)occupied.push(await appPool.connect());
  pending=upload(session);
  const reply=await Promise.race([pending,new Promise<never>((_resolve,reject)=>{deadline=setTimeout(()=>reject(Error('The upload requested a second connection outside its transaction.')),4000);})]);
  assert.equal(reply.code,200,JSON.stringify(reply.data));
 }finally{
  clearTimeout(deadline);for(const client of occupied)client.release();
  // Drain the request even on regression, after releasing this fixture's reservations.
  await pending?.catch(()=>{});
 }
 assert.equal((await db.query('SELECT sequence FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rows[0].sequence,'1');
});

test('retries are idempotent, old sequence cannot move the marker and updates are throttled',async()=>{
 const session=await started(await delivery()),first=position();assert.equal((await upload(session,first)).code,200);assert.equal((await upload(session,first)).data.duplicate,true);
 assert.equal((await upload(session,{...first,longitude:-45})).code,409);
 assert.equal((await upload(session,position(new Date(Date.now()+1000).toISOString(),2))).code,429);
 await db.query("UPDATE transport_tracking_sessions SET received_at=now()-interval '6 seconds' WHERE id=$1",[session.session_id]);
 assert.equal((await upload(session,position(new Date(Date.now()+2000).toISOString(),2))).code,200);
 const saved=(await db.query('SELECT longitude,sequence FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rows[0];assert.equal(saved.longitude,-46.53);assert.equal(Number(saved.sequence),2);
 assert.equal((await upload(session,first)).code,409);
});
test('public links contain only the latest authorized fix and explicitly mark stale locations',async()=>{
 const session=await started(await delivery()),shared=await share(session);assert.match(shared.token,/^[a-f0-9]{48}$/);assert.equal(shared.path,`/acompanhar/${shared.token}`);
 const waiting=await call('/public/tracking/'+shared.token,'GET',undefined,'');assert.equal(waiting.data.status,'waiting');assert.equal(waiting.data.position,null);
 assert.equal((await upload(session)).code,200);const live=await call('/public/tracking/'+shared.token,'GET',undefined,'');assert.equal(live.data.status,'live');assert.equal(live.data.position.latitude,-23.66);
 assert.deepEqual(Object.keys(live.data).sort(),['expires_at','position','status','updated_at']);assert.doesNotMatch(JSON.stringify(live.data),/driver|user_id|tenant|address|phone|upload_token/);
 await db.query("UPDATE transport_tracking_sessions SET received_at=now()-interval '91 seconds' WHERE id=$1",[session.session_id]);assert.equal((await call('/public/tracking/'+shared.token,'GET',undefined,'')).data.status,'stale');
 const rotated=await share(session);assert.equal((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code,404);assert.equal((await call('/public/tracking/'+rotated.token,'GET',undefined,'')).code,200);
});
test('finishing a delivery revokes its upload and client links without recording payment',async()=>{
 const id=await delivery(),session=await started(id),shared=await share(session);await upload(session);
 const done=await call(`/transport/jobs/delivery/${id}/status`,'POST',{status:'delivered',expected_status:'out_for_delivery'},driver);assert.equal(done.code,200,JSON.stringify(done.data));
 assert.equal((await heartbeat(session)).code,410);assert.equal((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code,404);
 const row=(await db.query('SELECT latitude,upload_token_hash,public_token_hash,stopped_at FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rows[0];assert.equal(row.latitude,null);assert.equal(row.upload_token_hash,null);assert.equal(row.public_token_hash,null);assert.ok(row.stopped_at);
 assert.equal((await db.query('SELECT 1 FROM business_ledger WHERE tenant_id=$1',[companies[0]])).rowCount,0);
});
test('driver status cannot cancel a sale, skip a step or act on another driver assignment',async()=>{
 const id=await delivery('preparing');assert.equal((await call(`/transport/jobs/delivery/${id}/status`,'POST',{status:'delivered',expected_status:'preparing'},driver)).code,409);
 assert.equal((await call(`/transport/jobs/delivery/${id}/status`,'POST',{status:'cancelled',expected_status:'preparing'},driver)).code,409);
 assert.equal((await call(`/transport/jobs/delivery/${id}/status`,'POST',{status:'out_for_delivery',expected_status:'preparing'},otherDriver)).code,404);
 const response=await call(`/transport/jobs/delivery/${id}/status`,'POST',{status:'out_for_delivery',expected_status:'preparing'},driver);assert.equal(response.code,200,JSON.stringify(response.data));assert.equal(response.data.status,'out_for_delivery');
});
test('reassignment immediately stops old sharing and removes the job from the former driver',async()=>{
 const id=await delivery(),session=await started(id),shared=await share(session);await upload(session);
 const reassigned=await call(`/transport/deliveries/${id}/driver`,'PATCH',{driver_id:drivers[1]},finance);assert.equal(reassigned.code,200,JSON.stringify(reassigned.data));
 assert.equal((await heartbeat(session)).code,410);assert.equal((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code,404);assert.equal((await start(id)).code,404);
 assert.equal((await start(id,'delivery',otherDriver)).code,201);
});
test('a revoked membership, disabled feature or ended subscription cannot continue providing positions',async()=>{
 for(const scenario of ['membership','feature','subscription']){
  const id=await delivery(),session=await started(id);await upload(session);const shared=await share(session);
  try{
   if(scenario==='membership')await db.query('UPDATE memberships SET active=false WHERE tenant_id=$1 AND user_id=$2',[companies[0],users[1]]);
   if(scenario==='feature')await db.query('UPDATE tenants SET tracking_enabled=false WHERE id=$1',[companies[0]]);
   if(scenario==='subscription')await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()-interval '1 day' WHERE tenant_id=$1",[companies[0]]);
   assert.equal((await heartbeat(session)).code,410);assert.ok([404,410].includes((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code));
   assert.equal((await db.query('SELECT latitude FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rows[0].latitude,null);
  }finally{await db.query('UPDATE memberships SET active=true WHERE tenant_id=$1 AND user_id=$2',[companies[0],users[1]]);await db.query('UPDATE tenants SET tracking_enabled=true WHERE id=$1',[companies[0]]);await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()+interval '30 days' WHERE tenant_id=$1",[companies[0]]);}
 }
});
test('password session version and logout revocation invalidate a native grant even without GPS fixes',async()=>{
 const first=await started(await delivery());assert.equal((await heartbeat(first)).code,200);await stopUserTracking(db,users[1],companies[0]);assert.equal((await heartbeat(first)).code,410);
 const second=await started(await delivery());await db.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[users[1]]);assert.equal((await heartbeat(second)).code,410);
 const login=await call('/auth/login','POST',{email:email(1),password},'');assert.equal(login.code,200);driver=(login.headers.get('set-cookie')??'').split(';')[0];
});
test('only one job can share a driver location at once, including concurrent starts',async()=>{
 const a=await delivery(),b=await delivery(),results=await Promise.all([start(a),start(b)]);assert.deepEqual(results.map(r=>r.code).sort(),[201,409]);
 const alive=results.find(r=>r.code===201)!.data;const repeated=await start(results[0].code===201?a:b);assert.equal(repeated.code,201);assert.notEqual(repeated.data.session_id,alive.session_id);assert.equal((await heartbeat(alive)).code,410);
});

test('logout closes a queued authenticated start while another login stays usable',{timeout:20000},async()=>{
 const original=await started(await delivery()),cookie=await loginCookie(1),id=await delivery();
 const reply=await startWhileEndingLogin(id,cookie,async()=>{assert.equal((await call('/auth/logout','POST',{},cookie)).code,200);});
 assert.equal(reply.code,401,JSON.stringify(reply.data));assert.equal((await db.query('SELECT 1 FROM transport_tracking_sessions WHERE delivery_id=$1',[id])).rowCount,0);
 assert.equal((await call('/auth/me','GET',undefined,driver)).code,200);assert.equal((await heartbeat(original)).code,200);assert.equal((await call('/auth/me','GET',undefined,cookie)).code,401);
});

test('switching company closes a queued start from the former company without ending another login',{timeout:20000},async()=>{
 const cookie=await loginCookie(1),id=await delivery();await db.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'employee',ARRAY['transport_driver'])",[companies[1],users[1]]);
 try{
  const reply=await startWhileEndingLogin(id,cookie,async()=>{assert.equal((await call('/auth/select-company','POST',{tenantId:companies[1]},cookie)).code,200);});
  assert.equal(reply.code,401,JSON.stringify(reply.data));assert.equal((await db.query('SELECT 1 FROM transport_tracking_sessions WHERE delivery_id=$1',[id])).rowCount,0);
  assert.equal((await call('/auth/me','GET',undefined,cookie)).data.user.tenantId,companies[1]);assert.equal((await call('/auth/me','GET',undefined,driver)).data.user.tenantId,companies[0]);
 }finally{await db.query('DELETE FROM "session" WHERE sess::jsonb->>\'userId\'=$1 AND sess::jsonb->>\'tenantId\'=$2',[users[1],companies[1]]);await db.query('DELETE FROM memberships WHERE tenant_id=$1 AND user_id=$2',[companies[1],users[1]]);}
});

test('grants revalidate their originating login and cannot survive its expiry, company change or deletion',async()=>{
 for(const scenario of ['expiry','company','deletion','logout']){
  const cookie=await loginCookie(1),reply=await start(await delivery(),'delivery',cookie);assert.equal(reply.code,201);const session=reply.data,shared=await share(session);assert.equal((await upload(session)).code,200);
  const saved=(await db.query('SELECT auth_session_id FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rows[0];assert.ok(saved.auth_session_id);assert.doesNotMatch(JSON.stringify(session),/auth_session_id|session_version/);
  if(scenario==='expiry')await db.query('UPDATE "session" SET expire=now()-interval \'1 minute\' WHERE sid=$1',[saved.auth_session_id]);
  if(scenario==='company')await db.query('UPDATE "session" SET sess=jsonb_set(sess::jsonb,\'{tenantId}\',to_jsonb($2::text)) WHERE sid=$1',[saved.auth_session_id,companies[1]]);
  if(scenario==='deletion'){await db.query('DELETE FROM "session" WHERE sid=$1',[saved.auth_session_id]);assert.equal((await db.query('SELECT 1 FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rowCount,0);}
  if(scenario==='logout'){assert.equal((await call('/auth/logout','POST',{},cookie)).code,200);assert.equal((await db.query('SELECT 1 FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rowCount,0);}
  assert.equal((await heartbeat(session)).code,410);assert.ok([404,410].includes((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code));
  if(!['deletion','logout'].includes(scenario))assert.equal((await db.query('SELECT latitude FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rows[0].latitude,null);
 }
 assert.equal((await call('/auth/me','GET',undefined,driver)).code,200);
});
test('stopping remains possible after losing subscription write access and strips the last point',async()=>{
 const session=await started(await delivery()),shared=await share(session);await upload(session);
 await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()-interval '1 day' WHERE tenant_id=$1",[companies[0]]);
 try{assert.equal((await call(`/transport/tracking/${session.session_id}/stop`,'POST',{},driver)).code,200);assert.equal((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code,404);assert.equal((await heartbeat(session)).code,410);}
 finally{await db.query("UPDATE tenant_subscriptions SET trial_ends_at=now()+interval '30 days' WHERE tenant_id=$1",[companies[0]]);}
});
test('source feature changes invalidate a grant even when the general tracking switch remains enabled',async()=>{
 const session=await started(await delivery()),shared=await share(session);await upload(session);
 await db.query('UPDATE tenants SET delivery_enabled=false WHERE id=$1',[companies[0]]);
 try{assert.equal((await heartbeat(session)).code,410);assert.ok([404,410].includes((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code));}
 finally{await db.query('UPDATE tenants SET delivery_enabled=true WHERE id=$1',[companies[0]]);}
});
test('taxi tracking changes destination after pickup and retains the existing custody transitions',async()=>{
 const id=await taxi('scheduled');assert.equal((await start(id,'taxi')).code,409);
 assert.equal((await call(`/transport/jobs/taxi/${id}/status`,'POST',{status:'en_route',expected_status:'scheduled'},driver)).code,200);
 const session=await started(id,'taxi');await upload(session);const shared=await share(session);
 const pickup=await call(`/transport/jobs/taxi/${id}/status`,'POST',{status:'with_pet',expected_status:'en_route'},driver);assert.equal(pickup.code,200,JSON.stringify(pickup.data));assert.equal(pickup.data.destination.address,'Pet shop fixture');assert.equal(pickup.data.destination.latitude,-23.5);
 assert.equal((await call(`/transport/jobs/taxi/${id}/status`,'POST',{status:'completed',expected_status:'with_pet'},driver)).code,200);
 assert.ok([404,410].includes((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code));assert.equal((await heartbeat(session)).code,410);
});
test('delivery and taxi departures cannot overlap for the same assigned driver',async()=>{
 const taxiId=await taxi('en_route'),deliveryId=await delivery('preparing');
 assert.equal((await call(`/transport/jobs/delivery/${deliveryId}/status`,'POST',{status:'out_for_delivery',expected_status:'preparing'},driver)).code,409);
 await db.query("UPDATE taxi_trips SET status='completed' WHERE id=$1",[taxiId]);assert.equal((await call(`/transport/jobs/delivery/${deliveryId}/status`,'POST',{status:'out_for_delivery',expected_status:'preparing'},driver)).code,200);
 const next=await taxi('scheduled');assert.equal((await call(`/transport/jobs/taxi/${next}/status`,'POST',{status:'en_route',expected_status:'scheduled'},driver)).code,409);
});
test('reads revalidate the live source and assignment even if a change bypasses the tracking helper',async()=>{
 for(const mutation of ['driver','terminal']){
  const id=await delivery(),session=await started(id),shared=await share(session);await upload(session);
  if(mutation==='driver')await db.query('UPDATE business_delivery_orders SET driver_id=$2 WHERE id=$1',[id,drivers[1]]);
  else await db.query("UPDATE business_delivery_orders SET status='delivered',delivered_at=now() WHERE id=$1",[id]);
  assert.ok([404,410].includes((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code));assert.equal((await heartbeat(session)).code,410);
  assert.equal((await db.query('SELECT latitude FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rows[0].latitude,null);
 }
});
test('expired sessions and shortened client-link validity never expose a retained coordinate',async()=>{
 const session=await started(await delivery()),shared=await share(session);await upload(session);
 await db.query("UPDATE transport_tracking_sessions SET public_expires_at=now()-interval '1 second' WHERE id=$1",[session.session_id]);
 assert.equal((await call('/public/tracking/'+shared.token,'GET',undefined,'')).code,410);assert.equal((await heartbeat(session)).code,200);
 await db.query("UPDATE transport_tracking_sessions SET started_at=now()-interval '13 hours',expires_at=now()-interval '1 hour',public_expires_at=NULL WHERE id=$1",[session.session_id]);
 assert.equal((await heartbeat(session)).code,410);assert.equal((await db.query('SELECT latitude FROM transport_tracking_sessions WHERE id=$1',[session.session_id])).rows[0].latitude,null);
});
test('a delayed fix is marked stale even when it has just reached the server',async()=>{
 const session=await started(await delivery()),shared=await share(session);
 assert.equal((await upload(session,position(new Date(Date.now()-110000).toISOString()))).code,200);
 const response=await call('/public/tracking/'+shared.token,'GET',undefined,'');assert.equal(response.code,200);assert.equal(response.data.status,'stale');
});
