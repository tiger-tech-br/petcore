// Ensaio explícito da homologação PetCore. Nunca chama e-mail ou cobrança.
// Usa somente dados fictícios e remove seus próprios registros e objetos.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {config} from 'dotenv';
import pg from 'pg';
import argon2 from 'argon2';
import sharp from 'sharp';

assert.deepEqual(process.argv.slice(2),['--confirm-test-only'],'Confirme o ensaio exclusivo de homologação.');
config({path:'.env.homologacao',override:true});
const origin='https://petcore-homologacao.up.railway.app';
const target=new URL(process.env.DATABASE_DIRECT_URL||'postgresql://invalid/missing');
assert.equal(target.hostname,'ep-damp-frog-b6b0ou91.c-2.sa-east-1.aws.neon.tech','Este script só usa o branch isolado de homologação.');
assert.equal(target.pathname,'/neondb');
target.searchParams.set('sslmode','verify-full');target.searchParams.delete('uselibpqcompat');
const db=new pg.Pool({connectionString:target.toString(),ssl:{rejectUnauthorized:true},max:2,connectionTimeoutMillis:15000,statement_timeout:30000});
const ids={a:randomUUID(),b:randomUUID(),owner:randomUUID(),other:randomUUID(),staff:randomUUID()};
const tenants=[ids.a,ids.b],users=[ids.owner,ids.other,ids.staff],tag=randomUUID().slice(0,8);
const password='Homologacao-ficticia-'+randomUUID(),sessions={};
const result={ok:false,checks:[],fixturesCreated:false,objectsCleaned:false,recordsCleaned:false};
let stage='health',created=false,petId='',tutorId='';
function checked(label){result.checks.push(label);console.log(JSON.stringify({event:'hosted_smoke_progress',check:label,ok:true}));}
function status(reply,expected){assert.equal(reply.code,expected,stage+' status inesperado');return reply;}
async function api(path,method='GET',body,person='owner',requestOrigin=origin){
 const multipart=body instanceof FormData;
 const response=await fetch(origin+'/api'+path,{method,redirect:'error',signal:AbortSignal.timeout(45000),headers:{'X-PetCore-Request':'1',Origin:requestOrigin,...(sessions[person]?{Cookie:sessions[person]}:{}),...(!multipart?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});
 let data;try{data=await response.json();}catch{data=null;}
 return {code:response.status,data,headers:response.headers};
}
async function login(person){
 const reply=status(await api('/auth/login','POST',{email:person+'-'+tag+'@example.test',password},'anonymous'),200);
 const cookie=reply.headers.get('set-cookie')||'';
 assert.match(cookie,/HttpOnly/i);assert.match(cookie,/;\s*Secure/i);assert.match(cookie,/SameSite=Lax/i);
 sessions[person]=cookie.split(';')[0];
}
async function photo(color){
 const image=await sharp({create:{width:2,height:2,channels:3,background:color}}).withMetadata({exif:{IFD0:{Artist:'Fixture ficticia PetCore'}}}).png().toBuffer();
 const form=new FormData();form.append('photo',new Blob([new Uint8Array(image)],{type:'image/png'}),'ficticio.png');
 status(await api('/pets/'+petId+'/photo','POST',form),201);
 const reply=status(await api('/pets/'+petId+'/photo-url'),200);
 assert.equal(reply.data.expiresInSeconds,900);
 const url=new URL(reply.data.url);assert.equal(url.protocol,'https:');assert.ok(decodeURIComponent(url.pathname).includes('tenants/'+ids.a+'/pets/'+petId+'/'));
 return url;
}
async function getPhoto(url){return fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{'Cache-Control':'no-cache'}});}
async function cleanObjects(){
 if(!created)return true;
 const current=await db.query('SELECT photo_key FROM pets WHERE tenant_id=$1 AND id=$2',[ids.a,petId||randomUUID()]);
 for(const row of current.rows)if(row.photo_key)await db.query('INSERT INTO object_deletion_jobs(tenant_id,request_id,object_key) VALUES($1,NULL,$2) ON CONFLICT(tenant_id,object_key) DO NOTHING',[ids.a,row.photo_key]);
 const pending=await db.query("SELECT count(*)::int AS n FROM object_deletion_jobs WHERE tenant_id=ANY($1::uuid[]) AND state<>'done'",[tenants]);
 if(pending.rows[0].n&&sessions.owner){status(await api('/privacy/cleanup-queue/retry','POST',{}),200);}
 const remaining=await db.query("SELECT count(*)::int AS n FROM object_deletion_jobs WHERE tenant_id=ANY($1::uuid[]) AND state<>'done'",[tenants]);
 return remaining.rows[0].n===0;
}
try{
 const health=status(await api('/health','GET',undefined,'anonymous'),200);assert.equal(health.data.ok,true);
 checked('https_database_health');
 stage='public_contact';const legal=status(await api('/public/legal','GET',undefined,'anonymous'),200);
 assert.equal(legal.data.published,false,'O ensaio não aceita documentos jurídicos publicados.');assert.equal(legal.data.operator.supportEmail,'tigertechbr@outlook.com');checked('public_contact_without_legal_acceptance');
 stage='fixtures';const hash=await argon2.hash(password,{type:argon2.argon2id});const client=await db.connect();
 try{await client.query('BEGIN');await client.query('INSERT INTO tenants(id,name) VALUES($1,$2),($3,$4)',[ids.a,'HomologacaoSmoke '+tag+' A',ids.b,'HomologacaoSmoke '+tag+' B']);
  for(const person of ['owner','other','staff'])await client.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[ids[person],'Fixture ficticia '+person,person+'-'+tag+'@example.test',hash]);
  await client.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($3,$4,'admin','{}'),($1,$5,'employee',ARRAY['pets'])",[ids.a,ids.owner,ids.b,ids.other,ids.staff]);await client.query('COMMIT');created=true;result.fixturesCreated=true;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 stage='login';await login('owner');await login('other');await login('staff');checked('secure_httponly_samesite_cookies');
 stage='onboarding';for(const person of ['owner','other'])status(await api('/commercial/onboarding','POST',{plan:'free'},person),200);
 const me=status(await api('/auth/me'),200).data;assert.equal(me.user.tenantId,ids.a);assert.equal(me.subscription.writable,true);assert.ok(Math.abs(Date.parse(me.subscription.trial_ends_at)-Date.parse(me.subscription.trial_started_at)-30*86400000)<2000);checked('free_30_days');
 stage='origin';status(await api('/commercial/choose-plan','POST',{plan_id:'monthly'},'owner','https://origem-nao-autorizada.example.test'),403);checked('foreign_origin_rejected');
 stage='records';tutorId=status(await api('/data/tutors','POST',{name:'Cliente ficticio '+tag,phone:'',email:'ficticio-'+tag+'@example.test',notes:'Ensaio sem dados reais',email_reminders_opt_in:false}),201).data.id;
 petId=status(await api('/data/pets','POST',{name:'Pet ficticio '+tag,tutor_id:tutorId,species:'Cao',size:'pequeno',notes:'Ensaio sem dados reais'}),201).data.id;
 const options=status(await api('/options/pet-tutors','GET',undefined,'staff'),200).data;assert.ok(options.some(row=>row.id===tutorId));assert.ok(options.every(row=>JSON.stringify(Object.keys(row).sort())==='["id","name"]'));
 status(await api('/data/tutors','GET',undefined,'staff'),403);assert.equal(status(await api('/data/pets','GET',undefined,'other'),200).data.length,0);status(await api('/data/pets/'+petId,'PATCH',{name:'Nunca alterar outro tenant'},'other'),404);checked('tenant_isolation_and_minimal_staff_grants');
 stage='photo_upload';const first=await photo('#008b93');let downloaded=await getPhoto(first);assert.equal(downloaded.status,200);const metadata=await sharp(Buffer.from(await downloaded.arrayBuffer())).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);checked('real_photo_upload_normalized_without_exif');
 const unsigned=new URL(first);unsigned.search='';assert.ok([403,404].includes((await getPhoto(unsigned)).status));status(await api('/pets/'+petId+'/photo-url','GET',undefined,'anonymous'),401);status(await api('/pets/'+petId+'/photo-url','GET',undefined,'other'),404);checked('private_bucket_and_photo_authorization');
 stage='photo_replace';const second=await photo('#08304b');status(await api('/privacy/cleanup-queue/retry','POST',{}),200);assert.ok([403,404].includes((await getPhoto(first)).status));assert.equal((await getPhoto(second)).status,200);checked('replaced_photo_deleted_current_photo_preserved');
 stage='privacy_export';const access=status(await api('/privacy/requests','POST',{tutor_id:tutorId,kind:'access',description:'Solicitacao ficticia da homologacao'}),201).data.id;
 status(await api('/privacy/requests/'+access,'PATCH',{identity_verified:true,verification_method:'other'}),200);
 const exported=status(await api('/privacy/requests/'+access+'/export','POST',{password}),200);assert.equal(exported.data.tutor.id,tutorId);assert.equal(exported.headers.get('cache-control'),'no-store');checked('verified_scoped_subject_export');
 stage='privacy_anonymize';const privacy=status(await api('/privacy/requests','POST',{tutor_id:tutorId,kind:'anonymization',description:'Solicitacao ficticia para remover fotos do ensaio'}),201).data.id;
 status(await api('/privacy/requests/'+privacy,'PATCH',{identity_verified:true,verification_method:'other'}),200);status(await api('/privacy/requests/'+privacy+'/anonymize','POST',{password,confirmation:'ANONIMIZAR',reason:'subject_request',retention_reviewed:true}),200);
 status(await api('/privacy/cleanup-queue/retry','POST',{}),200);assert.ok([403,404].includes((await getPhoto(second)).status));assert.ok((await db.query('SELECT anonymized_at FROM tutors WHERE tenant_id=$1 AND id=$2',[ids.a,tutorId])).rows[0].anonymized_at);checked('anonymization_deletes_current_photo');
 result.ok=true;
}catch(error){result.ok=false;result.failedStage=stage;result.errorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{2,80}$/.test(error.code)?error.code:'SMOKE_CHECK_FAILED';process.exitCode=1;}
finally{
 if(created){
  try{
   result.objectsCleaned=await cleanObjects();
   if(result.objectsCleaned){
    const owned=await db.query('SELECT id,name FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);assert.equal(owned.rowCount,2);assert.ok(owned.rows.every(row=>row.name.startsWith('HomologacaoSmoke '+tag+' ')));
    const client=await db.connect();try{await client.query('BEGIN');for(const table of ['privacy_request_events','object_deletion_jobs','privacy_requests','audit_events','tutor_email_reminder_consent_events','pets','tutors','tenant_subscriptions','memberships'])await client.query('DELETE FROM '+table+' WHERE tenant_id=ANY($1::uuid[])',[tenants]);
     await client.query('DELETE FROM "session" WHERE sess->>\'userId\'=ANY($1::text[])',[users]);await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);await client.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[tenants]);await client.query('COMMIT');result.recordsCleaned=true;
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
   }
  }catch{result.cleanupError='SMOKE_CLEANUP_PENDING';result.ok=false;process.exitCode=1;}
  if(!result.recordsCleaned){result.fixtureIds={tenantIds:tenants,userIds:users,petId,tutorId};result.ok=false;process.exitCode=1;}
 }
 await db.end();
}
console.log(JSON.stringify({event:'hosted_smoke_result',...result}));
