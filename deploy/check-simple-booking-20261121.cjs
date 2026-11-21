// One disposable tenant, no mail/payment, never reads or changes another tenant.
const fs=require('fs');
const {randomUUID,randomBytes}=require('crypto');
const {Pool}=require('/work/source/node_modules/pg');
const argon2=require('/work/source/node_modules/argon2');
async function main(){
 const release=JSON.parse(fs.readFileSync('/work/RELEASE-READY.json','utf8'));
 if(release.revision!=='7b9a9990d617c788ee7cf7869cecfd306664e936')throw Error('CANARY_RELEASE_MISMATCH');
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const url=new URL('postgresql://petcore_schema_owner@petcore-db:5432/petcore');url.password=state.PG_OWNER_PASSWORD;url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert','/run/petcore-ca/ca.crt');
 const db=new Pool({connectionString:url.href,max:2,statement_timeout:15000});
 const company=randomUUID(),user=randomUUID(),professional=randomUUID(),service=randomUUID(),tag=randomUUID().slice(0,8);
 const email=`booking-canary-${tag}@example.test`,password=randomBytes(24).toString('hex');
 fs.writeFileSync('/private/BOOKING-CANARY-IDS-20261121.json',JSON.stringify({company,user,professional,service}),{flag:'wx',mode:0o600});
 const checks=[];let cookie='',cleaned=false;
 function check(condition,label){if(!condition)throw Error('CANARY_'+label);checks.push(label);}
 async function call(path,method='GET',body){
  const response=await fetch('https://petcore.tigertech.dev.br/api'+path,{method,headers:{Origin:'https://petcore.tigertech.dev.br','X-PetCore-Request':'1','Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  return{status:response.status,data:await response.json(),headers:response.headers};
 }
 try{
  const legal=(await db.query('SELECT published FROM commercial_settings WHERE singleton=true')).rows[0];check(legal?.published===false,'LEGAL_DRAFT_GUARD');
  const hash=await argon2.hash(password);
  await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[company,'Verificação automática PetCore '+tag]);
  await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Verificação temporária PetCore',email,hash]);
  await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",[company,user]);
  await db.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[company]);
  await db.query('INSERT INTO professionals(id,tenant_id,user_id,name) VALUES($1,$2,$3,$4)',[professional,company,user,'Responsável de teste']);
  await db.query("INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes) VALUES($1,$2,'Banho de teste',3500,30)",[service,company]);
  await db.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3)',[company,professional,service]);
  await db.query("INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) SELECT $1,$2,n,'08:00','18:00' FROM generate_series(1,7) n",[company,professional]);
  const login=await call('/auth/login','POST',{email,password});check(login.status===200,'LOGIN');cookie=(login.headers.get('set-cookie')||'').split(';')[0];check(Boolean(cookie),'COOKIE');
  const accounts=await call('/options/professional-accounts');check(accounts.status===200&&accounts.data.some(row=>row.id===user),'OWNER_CAN_ATTEND');
  const payload={idempotency_key:randomUUID(),tutor:{name:'Responsável fictício '+tag,phone:'11900000000',email:null,email_reminders_opt_in:false},pets:[{name:'Pet fictício A',species:'Cachorro',size:'pequeno'},{name:'Pet fictício B',species:'Gato',size:'medio'}]};
  const created=await call('/data/clients-with-pets','POST',payload);check(created.status===201&&created.data.pets?.length===2,'CLIENT_WITH_TWO_PETS');
  const repeated=await call('/data/clients-with-pets','POST',payload);check(repeated.status===201&&repeated.data.tutor.id===created.data.tutor.id&&repeated.data.pets[0].id===created.data.pets[0].id,'IDEMPOTENT_RETRY');
  const day=new Date(Date.now()+2*86400000).toISOString().slice(0,10),starts_at=day+'T12:00:00.000Z';
  const booking=await call('/calendar/appointments','POST',{tutor_id:created.data.tutor.id,pet_id:created.data.pets[0].id,service_ids:[service],starts_at});check(booking.status===201&&booking.data.professional_id===professional,'AUTOMATIC_OWNER_ASSIGNMENT');
  const busy=await call('/calendar/check','POST',{starts_at,service_ids:[service]});check(busy.status===200&&busy.data.available===false,'OCCUPIED_TIME_REJECTED');
  const profile=await call('/settings','PATCH',{operation_mode:'essential'});check(profile.status===200,'ESSENTIAL_PROFILE');
  const me=await call('/auth/me');check(me.status===200&&me.data.features?.retail===false&&me.data.features?.operation_mode==='essential','ESSENTIAL_SESSION_FEATURES');
  const settings=await call('/public-booking/settings');check(settings.status===200&&settings.data.enabled===false&&settings.data.legal_ready===false&&/^[a-f0-9]{48}$/.test(settings.data.token),'PRIVATE_LINK_AND_LEGAL_GUARD');
  const publicResponse=await call('/public/booking/'+settings.data.token);check(publicResponse.status===404,'PUBLIC_LINK_STAYS_DISABLED');
  const counts=(await db.query('SELECT (SELECT count(*)::int FROM tutors WHERE tenant_id=$1) AS tutors,(SELECT count(*)::int FROM pets WHERE tenant_id=$1) AS pets,(SELECT count(*)::int FROM appointments WHERE tenant_id=$1) AS appointments',[company])).rows[0];check(counts.tutors===1&&counts.pets===2&&counts.appointments===1,'NO_DUPLICATED_RECORDS');
 }finally{
  try{
   const client=await db.connect();try{await client.query('BEGIN');
    await client.query('DELETE FROM "session" WHERE sess::jsonb->>\'userId\'=$1',[user]);
    for(const table of ['notifications','reminder_delivery_attempts','reminder_jobs','appointment_events','appointment_services','public_booking_request_services','public_booking_requests','appointments','public_booking_settings','business_operations','audit_events','professional_shifts','professional_services','pets','tutors','professionals','services','tenant_subscriptions','memberships'])await client.query(`DELETE FROM ${table} WHERE tenant_id=$1`,[company]);
    await client.query('DELETE FROM terms_acceptances WHERE user_id=$1',[user]);await client.query('DELETE FROM users WHERE id=$1',[user]);await client.query('DELETE FROM tenants WHERE id=$1',[company]);await client.query('COMMIT');cleaned=true;
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }finally{await db.end();}
  if(!cleaned)throw Error('CANARY_CLEANUP_REQUIRED');
 }
 const record={ok:true,event:'live_simple_booking_verified',revision:release.revision,checks,temporaryRecordsRemoved:cleaned,emailsSent:0,paymentsAttempted:0,legalPublished:false,at:new Date().toISOString()};fs.writeFileSync('/private/BOOKING-LIVE-VERIFIED-20261121.json',JSON.stringify(record),{mode:0o600});console.log(JSON.stringify(record));
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^CANARY_[A-Z_]+$/.test(error.message||'')?error.message:(/^[A-Z0-9_]+$/.test(error.code||'')?error.code:'CANARY_FAILED')}));process.exitCode=1;});
