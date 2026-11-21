// Real HTTP + PostgreSQL checks. No .env fallback, external service or real mail.
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const address=process.env.TEST_DATABASE_URL;
if(!address||!decodeURIComponent(new URL(address).pathname).endsWith('_test'))throw Error('Client registration: TEST_DATABASE_URL must name a dedicated *_test database.');
Object.assign(process.env,{DATABASE_URL:address,NODE_ENV:'test',SESSION_SECRET:'client-registration-isolated-'+randomUUID()+randomUUID(),EMAIL_PROVIDER:'none',EMAIL_API_KEY:'',EMAIL_FROM:'',RESEND_API_KEY:'',RESEND_FROM_EMAIL:'',REMINDER_EMAILS_ENABLED:'false',REMINDER_EMAILS_CONFIRM_SEND:'NO',SUPPORT_EMAILS_ENABLED:'false',SUPPORT_EMAILS_CONFIRM_SEND:'NO',APP_ORIGIN:'https://client-registration.example.test'});
process.env.DATABASE_SSL??=new URL(address).searchParams.has('sslmode')?'true':'false';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:address,max:3});db.on('error',()=>{});
const run=randomUUID(),suffix=run.replaceAll('-',''),tenants=[randomUUID(),randomUUID()],users=[randomUUID(),randomUUID(),randomUUID()];
const ownRateKeys=new Set<string>();let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,base='',adminA='',adminB='',staff='',prepared=false;
let ipSerial=0;
const email=(label:string)=>`${label}-${run}@example.test`;
const body=(label:string)=>({tutor:{name:`${label} ${run}`,phone:'(11) 90000-0000',email:email(label)},pets:[{name:`Pet ${label} ${run}`,species:'Cão',size:'medio'}],idempotency_key:randomUUID()});
async function call(path:string,method='GET',payload?:unknown,cookie=adminA):Promise<{code:number;data:any;headers:Headers}>{
 const ip=`fd7e:${suffix.slice(0,4)}::${++ipSerial}`;
 if(path==='/auth/login')ownRateKeys.add(createHash('sha256').update('/login:'+ip).digest('hex'));
 const response=await fetch(base+'/api'+path,{method,headers:{Origin:process.env.APP_ORIGIN!,'X-PetCore-Request':'1','X-Forwarded-For':ip,'Content-Type':'application/json',Cookie:cookie},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 return{code:response.status,data:await response.json(),headers:response.headers};
}
async function login(who:string,password:string){const reply=await call('/auth/login','POST',{email:email(who),password},'');assert.equal(reply.code,200);return(reply.headers.get('set-cookie')||'').split(';')[0];}
async function counts(company=tenants[0]){
 const r=await db.query(`SELECT (SELECT count(*)::int FROM tutors WHERE tenant_id=$1) AS tutors,
 (SELECT count(*)::int FROM pets WHERE tenant_id=$1) AS pets,
 (SELECT count(*)::int FROM tutor_email_reminder_consent_events WHERE tenant_id=$1) AS consents,
 (SELECT count(*)::int FROM business_operations WHERE tenant_id=$1) AS operations`,[company]);return r.rows[0];
}
before(async()=>{
 assert.equal((await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0]?.published,false,'Use an unpublished dedicated test configuration.');
 const password='Client-registration-test-'+randomUUID(),hash=await argon2.hash(password);
 const setup=await db.connect();await setup.query('BEGIN');
 try{
  await setup.query('INSERT INTO tenants(id,name) VALUES($1,$2),($3,$4)',[tenants[0],'Client registration A '+run,tenants[1],'Client registration B '+run]);
  for(const [i,who]of ['admin-a','admin-b','staff'].entries())await setup.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[users[i],who+' '+run,email(who),hash]);
  await setup.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($3,$4,'admin','{}'),($1,$5,'employee',ARRAY['tutors','pets'])",[tenants[0],users[0],tenants[1],users[1],users[2]]);
  for(const company of tenants)await setup.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[company]);
  await setup.query('COMMIT');prepared=true;
 }catch(error){await setup.query('ROLLBACK');throw error;}finally{setup.release();}
 const app=createApp();app.set('trust proxy',1);server=app.listen(0);await new Promise<void>(resolve=>server!.once('listening',resolve));
 const listening=server.address();assert.ok(listening&&typeof listening!=='string');base='http://127.0.0.1:'+listening.port;
 adminA=await login('admin-a',password);adminB=await login('admin-b',password);staff=await login('staff',password);
});
after(async()=>{
 try{
 if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
 if(prepared){
  const cleanup=await db.connect();await cleanup.query('BEGIN');try{
   await cleanup.query('DELETE FROM "session" WHERE sess::jsonb->>\'userId\'=ANY($1::text[])',[users]);
   await cleanup.query('DELETE FROM audit_events WHERE tenant_id=ANY($1::uuid[])',[tenants]);
   await cleanup.query('DELETE FROM business_operations WHERE tenant_id=ANY($1::uuid[])',[tenants]);
   await cleanup.query('DELETE FROM tutor_email_reminder_consent_events WHERE tenant_id=ANY($1::uuid[])',[tenants]);
   await cleanup.query('DELETE FROM professionals WHERE tenant_id=ANY($1::uuid[])',[tenants]);
   await cleanup.query('DELETE FROM pets WHERE tenant_id=ANY($1::uuid[])',[tenants]);
   await cleanup.query('DELETE FROM tutors WHERE tenant_id=ANY($1::uuid[])',[tenants]);
   await cleanup.query('DELETE FROM tenant_subscriptions WHERE tenant_id=ANY($1::uuid[])',[tenants]);
   await cleanup.query('DELETE FROM memberships WHERE tenant_id=ANY($1::uuid[]) AND user_id=ANY($2::uuid[])',[tenants,users]);
   await cleanup.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);
   await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);
   await cleanup.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[[...ownRateKeys]]);
   await cleanup.query('COMMIT');
  }catch(error){await cleanup.query('ROLLBACK');throw error;}finally{cleanup.release();}
 }
 }finally{await appPool.end();await db.end();}
});

test('requires an authenticated account and creates the client with every pet in one submission',async()=>{
 assert.equal((await call('/data/clients-with-pets','POST',body('anonymous'),'')).code,401);
 const input=body('multiple');input.pets.push({name:'Segundo pet '+run,species:'Gato',size:'pequeno'});
 const reply=await call('/data/clients-with-pets','POST',input);assert.equal(reply.code,201);
 assert.equal(reply.data.tutor.name,input.tutor.name);assert.equal(reply.data.tutor.tenant_id,tenants[0]);
 assert.equal(reply.data.tutor.email_reminders_opt_in,false);assert.equal(reply.data.tutor.email_reminders_opt_in_at,null);assert.equal(reply.data.tutor.email_reminders_opt_in_by,null);
 assert.equal(reply.data.pets.length,2);assert.deepEqual(reply.data.pets.map((p:any)=>p.name),input.pets.map(p=>p.name));
 assert.ok(reply.data.pets.every((p:any)=>p.tenant_id===tenants[0]&&p.tutor_id===reply.data.tutor.id));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM tutor_email_reminder_consent_events WHERE tutor_id=$1',[reply.data.tutor.id])).rows[0].n,0);
});

test('rejects invalid or forged child input without leaving a client or operation behind',async()=>{
 const before=await counts(),invalid=body('invalid');
 assert.equal((await call('/data/clients-with-pets','POST',{...invalid,pets:[...invalid.pets,{name:'',species:'Cão',size:'gigante'}]})).code,422);
 assert.equal((await call('/data/clients-with-pets','POST',{...invalid,pets:[]})).code,422);
 assert.equal((await call('/data/clients-with-pets','POST',{...invalid,pets:Array.from({length:11},()=>invalid.pets[0])})).code,422);
 assert.equal((await call('/data/clients-with-pets','POST',{...invalid,tenant_id:tenants[1]})).code,422);
 assert.equal((await call('/data/clients-with-pets','POST',{...invalid,tutor:{...invalid.tutor,tenant_id:tenants[1]}})).code,422);
 assert.equal((await call('/data/clients-with-pets','POST',{...invalid,pets:[{...invalid.pets[0],tutor_id:randomUUID()}]})).code,422);
 assert.deepEqual(await counts(),before);
});

test('requires both client and pet permissions, including on a repeated request',async()=>{
 const input=body('staff'),before=await counts();
 for(const permissions of [[],['tutors'],['pets']]){
  await db.query('UPDATE memberships SET permissions=$3 WHERE tenant_id=$1 AND user_id=$2',[tenants[0],users[2],permissions]);
  assert.equal((await call('/data/clients-with-pets','POST',input,staff)).code,403);
 }
 assert.deepEqual(await counts(),before);
 await db.query("UPDATE memberships SET permissions=ARRAY['tutors','pets'] WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[2]]);
 assert.equal((await call('/data/clients-with-pets','POST',input,staff)).code,201);
 try{
  await db.query("UPDATE memberships SET permissions=ARRAY['tutors'] WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[2]]);
  assert.equal((await call('/data/clients-with-pets','POST',input,staff)).code,403);
 }finally{await db.query("UPDATE memberships SET permissions=ARRAY['tutors','pets'] WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[2]]);}
});

test('records only explicit valid email consent and preserves the actor and address',async()=>{
 const invalid={...body('consent-invalid'),tutor:{...body('consent-invalid').tutor,email_reminders_opt_in:true}},before=await counts();
 assert.equal((await call('/data/clients-with-pets','POST',invalid)).code,422);assert.deepEqual(await counts(),before);
 const input=body('consent'),recipient=`consent-${run}@example.com.br`;
 const reply=await call('/data/clients-with-pets','POST',{...input,tutor:{...input.tutor,email:recipient,email_reminders_opt_in:true}});assert.equal(reply.code,201);
 assert.equal(reply.data.tutor.email_reminders_opt_in,true);assert.ok(reply.data.tutor.email_reminders_opt_in_at);assert.equal(reply.data.tutor.email_reminders_opt_in_by,users[0]);
 const events=await db.query('SELECT email,action,actor_user_id FROM tutor_email_reminder_consent_events WHERE tenant_id=$1 AND tutor_id=$2',[tenants[0],reply.data.tutor.id]);
 assert.deepEqual(events.rows,[{email:recipient,action:'granted',actor_user_id:users[0]}]);
});

test('database failure on the second pet rolls back the first pet, client, consent and retry key',async()=>{
 const trigger='client_registration_fail_'+suffix,functionName='client_registration_fn_'+suffix;
 const rejected='REJECT_'+run,input=body('rollback'),before=await counts();
 input.pets.push({name:rejected,species:'Cão',size:'medio'});
 await db.query(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='${rejected}' AND NEW.tenant_id='${tenants[0]}'::uuid THEN RAISE EXCEPTION 'isolated child failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`);
 try{
  await db.query(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON pets FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
  const reply=await call('/data/clients-with-pets','POST',{...input,tutor:{...input.tutor,email:`rollback-${run}@example.com.br`,email_reminders_opt_in:true}});assert.equal(reply.code,422);
  assert.deepEqual(await counts(),before);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM tutors WHERE tenant_id=$1 AND name=$2',[tenants[0],input.tutor.name])).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM business_operations WHERE tenant_id=$1 AND idempotency_key=$2',[tenants[0],input.idempotency_key])).rows[0].n,0);
 }finally{await db.query(`DROP TRIGGER IF EXISTS "${trigger}" ON pets`);await db.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);}
});

test('concurrent retries return one client, preserve pet order and store only IDs',async()=>{
 const input=body('retry'),before=await counts();
 const replies=await Promise.all([0,1,2].map(()=>call('/data/clients-with-pets','POST',input)));assert.ok(replies.every(reply=>reply.code===201));
 assert.equal(new Set(replies.map(reply=>reply.data.tutor.id)).size,1);assert.equal(new Set(replies.map(reply=>reply.data.pets[0].id)).size,1);
 const after=await counts();assert.equal(after.tutors,before.tutors+1);assert.equal(after.pets,before.pets+1);assert.equal(after.operations,before.operations+1);
 const record=(await db.query('SELECT response FROM business_operations WHERE tenant_id=$1 AND idempotency_key=$2',[tenants[0],input.idempotency_key])).rows[0].response;
 assert.deepEqual(record,{id:replies[0].data.tutor.id,petIds:[replies[0].data.pets[0].id]});
 const mismatched=await call('/data/clients-with-pets','POST',{...input,tutor:{...input.tutor,name:'Changed '+run}});assert.equal(mismatched.code,409);assert.deepEqual(await counts(),after);
});

test('the same retry key is scoped to its company and never returns another company data',async()=>{
 const input=body('scope'),a=await call('/data/clients-with-pets','POST',input),b=await call('/data/clients-with-pets','POST',input,adminB);
 assert.equal(a.code,201);assert.equal(b.code,201);assert.notEqual(a.data.tutor.id,b.data.tutor.id);assert.notEqual(a.data.pets[0].id,b.data.pets[0].id);
 assert.equal(a.data.tutor.tenant_id,tenants[0]);assert.equal(b.data.tutor.tenant_id,tenants[1]);
 const listB=await call('/data/tutors','GET',undefined,adminB);assert.ok(!listB.data.some((t:any)=>t.id===a.data.tutor.id));
});

test('subscription write protection also covers the combined form',async()=>{
 const before=await counts();await db.query("UPDATE tenant_subscriptions SET status='pending' WHERE tenant_id=$1",[tenants[0]]);
 try{assert.equal((await call('/data/clients-with-pets','POST',body('blocked'))).code,402);assert.deepEqual(await counts(),before);}
 finally{await db.query("UPDATE tenant_subscriptions SET status='trial' WHERE tenant_id=$1",[tenants[0]]);}
});

test('the pre-existing separate client and pet endpoints remain compatible',async()=>{
 const input=body('legacy');
 const person=await call('/data/tutors','POST',input.tutor);assert.equal(person.code,201);
 const animal=await call('/data/pets','POST',{...input.pets[0],tutor_id:person.data.id});assert.equal(animal.code,201);assert.equal(animal.data.tutor_id,person.data.id);
});

test('operation profile starts complete and can be changed without losing products or client data',async()=>{
 const original=await call('/settings');assert.equal(original.code,200);assert.equal(original.data.operation_mode,'complete');
 const originalMe=await call('/auth/me');assert.equal(originalMe.code,200);assert.equal(originalMe.data.features.operation_mode,'complete');assert.equal(originalMe.data.features.retail,true);
 const product=randomUUID(),before=await counts();
 await db.query('INSERT INTO business_products(id,tenant_id,name,price_cents,stock_quantity) VALUES($1,$2,$3,777,3)',[product,tenants[0],'Preserved product '+run]);
 try{
  const changed=await call('/settings','PATCH',{operation_mode:'essential'});assert.equal(changed.code,200);assert.equal(changed.data.operation_mode,'essential');
  const me=await call('/auth/me');assert.equal(me.data.features.operation_mode,'essential');assert.equal(me.data.features.retail,false);
  assert.equal(me.data.user.role,'admin');assert.deepEqual(await counts(),before);
  const saved=(await db.query('SELECT name,price_cents,stock_quantity,active FROM business_products WHERE tenant_id=$1 AND id=$2',[tenants[0],product])).rows[0];
  assert.deepEqual(saved,{name:'Preserved product '+run,price_cents:777,stock_quantity:3,active:true});
  const other=await call('/settings','GET',undefined,adminB);assert.equal(other.data.operation_mode,'complete');
  const restored=await call('/settings','PATCH',{operation_mode:'complete'});assert.equal(restored.code,200);
  const restoredMe=await call('/auth/me');assert.equal(restoredMe.data.features.retail,true);assert.equal(restoredMe.data.features.operation_mode,'complete');
  assert.deepEqual(await counts(),before);
  const events=await db.query("SELECT metadata->>'operation_mode' AS mode FROM audit_events WHERE tenant_id=$1 AND action='shop.operation_mode.update' ORDER BY created_at,id",[tenants[0]]);
  assert.deepEqual(events.rows.map(row=>row.mode),['essential','complete']);
 }finally{
  await db.query('DELETE FROM business_products WHERE tenant_id=$1 AND id=$2',[tenants[0],product]);
  await db.query("UPDATE tenants SET operation_mode='complete' WHERE id=$1",[tenants[0]]);
 }
});

test('only the administrator may change operation profile and invalid profiles are rejected',async()=>{
 const permissions=(await db.query('SELECT permissions FROM memberships WHERE tenant_id=$1 AND user_id=$2',[tenants[0],users[2]])).rows[0].permissions;
 assert.equal((await call('/settings','PATCH',{operation_mode:'essential'},staff)).code,403);
 assert.equal((await call('/settings','PATCH',{operation_mode:'unsupported'})).code,422);
 assert.equal((await call('/settings','PATCH',{operation_mode:'essential',tenant_id:tenants[1]})).code,422);
 await assert.rejects(db.query("UPDATE tenants SET operation_mode='unsupported' WHERE id=$1",[tenants[0]]),{code:'23514'});
 assert.equal((await call('/settings')).data.operation_mode,'complete');
 assert.equal((await call('/settings','GET',undefined,adminB)).data.operation_mode,'complete');
 assert.deepEqual((await db.query('SELECT permissions FROM memberships WHERE tenant_id=$1 AND user_id=$2',[tenants[0],users[2]])).rows[0].permissions,permissions);
});

test('professional selector includes active owners and staff, scoped to company, and an owner can work alone',async()=>{
 const initial=await call('/options/professional-accounts');assert.equal(initial.code,200);
 assert.deepEqual(initial.data.map((row:any)=>row.id).sort(),[users[0],users[2]].sort());
 assert.ok(initial.data.every((row:any)=>Object.keys(row).sort().join(',')==='id,name'));assert.ok(!initial.data.some((row:any)=>row.id===users[1]));
 const owner=await call('/data/professionals','POST',{name:'Owner professional '+run,user_id:users[0],active:true});assert.equal(owner.code,201);assert.equal(owner.data.user_id,users[0]);
 try{
  await db.query("UPDATE memberships SET permissions=ARRAY['professionals'] WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[2]]);
  const permitted=await call('/options/professional-accounts','GET',undefined,staff);assert.equal(permitted.code,200);assert.deepEqual(permitted.data,initial.data);
  await db.query('UPDATE memberships SET active=false WHERE tenant_id=$1 AND user_id=$2',[tenants[0],users[2]]);
  const inactive=await call('/options/professional-accounts');assert.equal(inactive.code,200);assert.deepEqual(inactive.data.map((row:any)=>row.id),[users[0]]);
  assert.equal((await call('/options/professional-accounts','GET',undefined,staff)).code,403);
 }finally{await db.query("UPDATE memberships SET active=true,permissions=ARRAY['tutors','pets'] WHERE tenant_id=$1 AND user_id=$2",[tenants[0],users[2]]);}
});
