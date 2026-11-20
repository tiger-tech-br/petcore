// Explicit one-off probe for the newly migrated PetCore deployment only.
// Fictional isolated fixtures, no mail/payment calls, bounded HTTP/SQL, and
// cleanup scoped to this run's UUIDs. Never prints cookies or credentials.
const fs=require('node:fs'),crypto=require('node:crypto');
const {Pool}=require('/app/node_modules/pg');
const argon2=require('/app/node_modules/argon2');
const {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand}=require('/app/node_modules/@aws-sdk/client-s3');
const {getSignedUrl}=require('/app/node_modules/@aws-sdk/s3-request-presigner');
const ORIGIN='https://petcore.tigertech.dev.br';
const run=crypto.randomUUID(),tenantId=crypto.randomUUID(),adminId=crypto.randomUUID(),employeeId=crypto.randomUUID();
const users=[adminId,employeeId],marker='QA_VPS_'+run,uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const identities={admin:{id:adminId,email:`qa-${run}-admin@example.test`},employee:{id:employeeId,email:`qa-${run}-employee@example.test`}};
const cookies={},checks=[];let db,client,storage,storageKey,storageProbe=null,storageCleanup=false,fixturePrepared=false,tutorId=null,petId=null,stage='configuration';
function requireThat(condition,code,httpStatus){if(!condition)throw Object.assign(new Error(code),{code,...(Number.isInteger(httpStatus)?{httpStatus}:{})});}
function checked(name){checks.push(name);}
function diagnostic(error,failedStage,fallback='PUBLIC_VERIFICATION_FAILED'){
 return{failedStage,code:/^PUBLIC_[A-Z_]+$/.test(error.code||'')?error.code:fallback,sdkErrorName:/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.name||'')?error.name:null,httpStatus:Number.isInteger(error?.$metadata?.httpStatusCode)?error.$metadata.httpStatusCode:Number.isInteger(error.httpStatus)?error.httpStatus:null};
}
function saveObjectProbe(state){
 const file='/private/PUBLIC-OBJECT-PROBE.json';
 if(fs.existsSync(file)){
  const previous=JSON.parse(fs.readFileSync(file,'utf8'));
  requireThat(previous.state==='deleted'||previous.run===run&&previous.key===storageKey,'PUBLIC_PREVIOUS_PROBE_REQUIRES_CLEANUP');
 }
 const temporary=file+'.next',descriptor=fs.openSync(temporary,'wx',0o600);
 try{fs.writeFileSync(descriptor,JSON.stringify(state));fs.fsyncSync(descriptor);}finally{fs.closeSync(descriptor);}
 fs.renameSync(temporary,file);
 const directory=fs.openSync('/private','r');try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}
}
async function api(route,{method='GET',body,person='admin',origin=ORIGIN}={}){
 requireThat(/^\/api\/[a-z0-9/_-]+$/i.test(route),'PUBLIC_API_PATH_INVALID');
 const response=await fetch(ORIGIN+route,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{'X-PetCore-Request':'1',Origin:origin,'Content-Type':'application/json',...(cookies[person]?{Cookie:cookies[person]}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();requireThat(text.length<1000000,'PUBLIC_RESPONSE_TOO_LARGE');let data=null;try{data=JSON.parse(text);}catch{}
 return{status:response.status,headers:response.headers,data};
}
function status(response,expected){requireThat(response.status===expected,'PUBLIC_HTTP_STATUS_UNEXPECTED',response.status);return response.data;}
async function prepare(){
 const empty=await client.query('SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1) OR EXISTS(SELECT 1 FROM users WHERE id=ANY($2::uuid[]) OR email=ANY($3::text[])) AS used',[tenantId,users,Object.values(identities).map(i=>i.email)]);
 requireThat(!empty.rows[0].used,'PUBLIC_FIXTURE_IDENTITY_COLLISION');
 const password=crypto.randomBytes(40).toString('base64url'),hash=await argon2.hash(password,{type:argon2.argon2id});
 await client.query('BEGIN');
 try{
  await client.query('INSERT INTO tenants(id,name,timezone) VALUES($1,$2,$3)',[tenantId,marker,'America/Sao_Paulo']);
  for(const [role,identity]of Object.entries(identities))await client.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[identity.id,marker+'_'+role,identity.email,hash]);
  await client.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($1,$3,'employee','{}')",[tenantId,adminId,employeeId]);
  await client.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[tenantId]);
  await client.query('COMMIT');fixturePrepared=true;
 }catch(error){await client.query('ROLLBACK');throw error;}
 return password;
}
async function login(person,password){
 const reply=await api('/api/auth/login',{method:'POST',person:'anonymous',body:{email:identities[person].email,password}});status(reply,200);
 const cookie=reply.headers.get('set-cookie')||'';
 requireThat(/^petcore\.sid=/.test(cookie)&&/;\s*HttpOnly/i.test(cookie)&&/;\s*Secure/i.test(cookie)&&/;\s*SameSite=Lax/i.test(cookie),'PUBLIC_SESSION_COOKIE_UNSAFE');
 cookies[person]=cookie.split(';')[0];
 const me=status(await api('/api/auth/me',{person}),200);
 requireThat(me?.user?.id===identities[person].id&&me.user.tenantId===tenantId&&me.user.role===(person==='admin'?'admin':'employee')&&me.companies?.length===1&&me.companies[0].id===tenantId,'PUBLIC_CANARY_IDENTITY_MISMATCH');
}
async function cleanupDatabase(){
 if(!client||!fixturePrepared)return true;
 await client.query('BEGIN');
 try{
  const company=await client.query('SELECT name FROM tenants WHERE id=$1 FOR UPDATE',[tenantId]);
  const accounts=await client.query('SELECT id,email,is_platform_owner FROM users WHERE id=ANY($1::uuid[]) FOR UPDATE',[users]);
  requireThat(company.rowCount===1&&company.rows[0].name===marker&&accounts.rowCount===2&&accounts.rows.every(row=>!row.is_platform_owner&&Object.values(identities).some(identity=>identity.id===row.id&&identity.email===row.email)),'PUBLIC_CLEANUP_OWNERSHIP_FAILED');
  // Recover response-lost creates only inside this run's fresh UUID tenant.
  const pets=await client.query('SELECT id,name FROM pets WHERE tenant_id=$1',[tenantId]);
  const tutors=await client.query('SELECT id,name,email_reminders_opt_in FROM tutors WHERE tenant_id=$1',[tenantId]);
  requireThat(pets.rowCount<=1&&pets.rows.every(row=>[marker+'_pet',marker+'_pet_updated'].includes(row.name))&&tutors.rowCount<=1&&tutors.rows.every(row=>row.name===marker+'_tutor'&&row.email_reminders_opt_in===false),'PUBLIC_CLEANUP_FIXTURE_CHANGED');
  for(const row of pets.rows)await client.query('DELETE FROM pets WHERE tenant_id=$1 AND id=$2',[tenantId,row.id]);
  for(const row of tutors.rows)await client.query('DELETE FROM tutors WHERE tenant_id=$1 AND id=$2',[tenantId,row.id]);
  const sessions=await client.query('SELECT sid FROM "session" WHERE sess::jsonb->>\'userId\'=ANY($1::text[])',[users]);
  for(const row of sessions.rows)await client.query('DELETE FROM "session" WHERE sid=$1 AND sess::jsonb->>\'userId\'=ANY($2::text[])',[row.sid,users]);
  // Subscription rows have ON DELETE CASCADE (008); memberships do not.
  await client.query('DELETE FROM memberships WHERE tenant_id=$1 AND user_id=ANY($2::uuid[])',[tenantId,users]);
  await client.query('DELETE FROM tenants WHERE id=$1 AND name=$2',[tenantId,marker]);
  for(const identity of Object.values(identities))await client.query('DELETE FROM users WHERE id=$1 AND email=$2 AND is_platform_owner=false',[identity.id,identity.email]);
  const remaining=await client.query('SELECT EXISTS(SELECT 1 FROM tenants WHERE id=$1) OR EXISTS(SELECT 1 FROM users WHERE id=ANY($2::uuid[])) AS present',[tenantId,users]);
  requireThat(!remaining.rows[0].present,'PUBLIC_CLEANUP_INCOMPLETE');
  await client.query('COMMIT');fixturePrepared=false;return true;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
async function cleanupStorage(){
 if(!storage||!storageKey)return;
 let head;try{head=await storage.send(new HeadObjectCommand({Bucket:'petcore-fotos',Key:storageKey}),{abortSignal:AbortSignal.timeout(10000)});}catch(error){if(error?.$metadata?.httpStatusCode===404){storageCleanup=true;if(storageProbe){storageProbe.state='deleted';saveObjectProbe(storageProbe);}return;}throw error;}
 // The pre-upload receipt also proves ownership after a response is lost or a
 // compatible gateway omits metadata; never delete solely because of a prefix.
 if(head.Metadata?.['petcore-probe']!==run){
  requireThat(storageProbe?.run===run&&storageProbe.key===storageKey&&Number(head.ContentLength)===storageProbe.bytes,'PUBLIC_STORAGE_CLEANUP_OWNERSHIP_FAILED');
  const read=await storage.send(new GetObjectCommand({Bucket:'petcore-fotos',Key:storageKey}),{abortSignal:AbortSignal.timeout(10000)});
  requireThat(read.Body&&Number(read.ContentLength)===storageProbe.bytes,'PUBLIC_STORAGE_CLEANUP_OWNERSHIP_FAILED');
  const bytes=Buffer.from(await read.Body.transformToByteArray());
  requireThat(bytes.length===storageProbe.bytes&&crypto.createHash('sha256').update(bytes).digest('hex')===storageProbe.sha256,'PUBLIC_STORAGE_CLEANUP_OWNERSHIP_FAILED');
 }
 await storage.send(new DeleteObjectCommand({Bucket:'petcore-fotos',Key:storageKey}),{abortSignal:AbortSignal.timeout(10000)});storageCleanup=true;
 if(storageProbe){storageProbe.state='deleted';saveObjectProbe(storageProbe);}
}
async function execute(){
 requireThat(process.argv.length===2,'PUBLIC_ARGUMENTS_INVALID');
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8')),runtime=JSON.parse(fs.readFileSync('/private/app/runtime.json','utf8'));
 const target=new URL(runtime.DATABASE_URL||'postgresql://invalid/missing');
 requireThat(target.hostname==='petcore-db'&&target.pathname==='/petcore'&&target.username==='petcore_runtime'&&runtime.DATABASE_SSL==='true'&&target.searchParams.get('sslmode')==='verify-full'&&target.searchParams.get('sslrootcert')==='/run/petcore-ca/ca.crt','PUBLIC_DATABASE_TARGET_INVALID');
 target.username='petcore_schema_owner';target.password=state.PG_OWNER_PASSWORD;
 db=new Pool({connectionString:target.href,max:1,connectionTimeoutMillis:10000,statement_timeout:15000,idle_in_transaction_session_timeout:30000});db.on('error',()=>{});client=await db.connect();
 const ssl=client.connection.stream;requireThat(ssl.encrypted===true&&ssl.authorized===true,'PUBLIC_DATABASE_TLS_UNVERIFIED');
 const history=await client.query('SELECT filename,checksum FROM schema_migrations');
 requireThat(history.rowCount===19&&!history.rows.some(row=>row.filename.startsWith('016_'))&&history.rows.some(row=>row.filename==='020_backup_legacy_scope.sql'&&row.checksum==='bdf19081df2b221b5d40dc9a6c3956056f8b39c7f210f5fd584f6942deae1f46'),'PUBLIC_SCHEMA_INVALID');
 stage='https_health';
 requireThat(status(await api('/api/live',{person:'anonymous'}),200)?.ok===true,'PUBLIC_LIVENESS_FAILED');
 const health=status(await api('/api/health',{person:'anonymous'}),200);requireThat(health?.ok===true&&health.database===true,'PUBLIC_HEALTH_FAILED');
 status(await api('/api/auth/me',{person:'anonymous'}),401);
 const legal=status(await api('/api/public/legal',{person:'anonymous'}),200);requireThat(legal?.published===false,'PUBLIC_PREVIEW_REQUIRED');checked('https_liveness_readiness_anonymous');
 stage='canary_login';const password=await prepare();
 await login('admin',password);await login('employee',password);checked('real_canary_login_admin_employee_secure_cookies');
 stage='canary_crud';
 const tutor=status(await api('/api/data/tutors',{method:'POST',body:{name:marker+'_tutor',phone:'',email:`qa-${run}-tutor@example.test`,notes:'Fictional migration canary',email_reminders_opt_in:false}}),201);requireThat(uuid.test(tutor?.id)&&tutor.tenant_id===tenantId,'PUBLIC_TUTOR_CREATE_FAILED');tutorId=tutor.id;
 const pet=status(await api('/api/data/pets',{method:'POST',body:{name:marker+'_pet',tutor_id:tutorId,species:'Cão',size:'pequeno',notes:'Fictional migration canary'}}),201);requireThat(uuid.test(pet?.id)&&pet.tenant_id===tenantId,'PUBLIC_PET_CREATE_FAILED');petId=pet.id;
 status(await api('/api/data/pets/'+petId,{method:'PATCH',body:{name:marker+'_pet_updated'}}),200);
 const list=status(await api('/api/data/pets'),200);requireThat(Array.isArray(list)&&list.length===1&&list[0].id===petId&&list[0].name===marker+'_pet_updated'&&list[0].tenant_id===tenantId,'PUBLIC_PET_READBACK_FAILED');
 status(await api('/api/data/tutors',{person:'employee'}),403);status(await api('/api/data/pets',{person:'employee'}),403);
 status(await api('/api/auth/select-company',{method:'POST',body:{tenantId:crypto.randomUUID()}}),403);
 status(await api('/api/data/pets/'+crypto.randomUUID(),{method:'PATCH',body:{name:'Denied'}}),404);
 status(await api('/api/settings',{method:'PATCH',body:{reminder_minutes_before:60},origin:'https://foreign.example.test'}),403);checked('tutor_pet_create_update_read_role_company_origin_guards');
 stage='public_storage';
 requireThat(new URL(runtime.OBJECT_STORAGE_ENDPOINT).href===ORIGIN+'/'&&runtime.OBJECT_STORAGE_BUCKET==='petcore-fotos'&&runtime.OBJECT_STORAGE_ACCESS_KEY==='petcore-app'&&runtime.OBJECT_STORAGE_SECRET_KEY===state.STORAGE_APP_SECRET_KEY,'PUBLIC_STORAGE_TARGET_INVALID');
 storage=new S3Client({endpoint:ORIGIN,region:runtime.OBJECT_STORAGE_REGION||'us-east-1',forcePathStyle:true,maxAttempts:1,requestChecksumCalculation:'WHEN_REQUIRED',credentials:{accessKeyId:runtime.OBJECT_STORAGE_ACCESS_KEY,secretAccessKey:runtime.OBJECT_STORAGE_SECRET_KEY}});
 storageKey=`migration-checks/${run}/public-probe.bin`;const bytes=crypto.randomBytes(128);
 const preparedProbe={format:'petcore.public-object-probe.v1',run,key:storageKey,bucket:'petcore-fotos',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),state:'prepared',createdAt:new Date().toISOString()};
 saveObjectProbe(preparedProbe);storageProbe=preparedProbe;
 const put=await getSignedUrl(storage,new PutObjectCommand({Bucket:'petcore-fotos',Key:storageKey,ContentType:'application/octet-stream',IfNoneMatch:'*',Metadata:{'petcore-probe':run}}),{expiresIn:120,unhoistableHeaders:new Set(['x-amz-meta-petcore-probe'])});
 stage='public_storage_upload';
 const uploaded=await fetch(put,{method:'PUT',headers:{'Content-Type':'application/octet-stream','If-None-Match':'*','x-amz-meta-petcore-probe':run},body:bytes,redirect:'error',signal:AbortSignal.timeout(20000)});requireThat(uploaded.status===200,'PUBLIC_SIGNED_UPLOAD_FAILED',uploaded.status);
 storageProbe.state='uploaded';saveObjectProbe(storageProbe);
 stage='public_storage_readback';
 const get=await getSignedUrl(storage,new GetObjectCommand({Bucket:'petcore-fotos',Key:storageKey}),{expiresIn:120});
 requireThat(new URL(get).origin===ORIGIN,'PUBLIC_SIGNED_URL_WRONG_ORIGIN');
 const read=await fetch(get,{redirect:'error',signal:AbortSignal.timeout(20000)});requireThat(read.status===200&&Buffer.from(await read.arrayBuffer()).equals(bytes),'PUBLIC_SIGNED_READBACK_FAILED',read.status);
 stage='public_storage_anonymous';
 const anonymous=await fetch(ORIGIN+'/petcore-fotos/'+storageKey,{redirect:'error',signal:AbortSignal.timeout(10000)});requireThat(anonymous.status===403,'PUBLIC_ANONYMOUS_STORAGE_ALLOWED',anonymous.status);
 stage='public_storage_cleanup';
 await cleanupStorage();checked('https_presigned_upload_readback_anonymous_denied');
 stage='logout';
 for(const person of ['admin','employee']){status(await api('/api/auth/logout',{method:'POST',person}),200);status(await api('/api/auth/me',{person}),401);}checked('logout_invalidates_both_sessions');
}
(async()=>{
 let failure=null,databaseCleanup=false;const cleanupFailures=[];
 try{await execute();}catch(error){failure=diagnostic(error,stage);}
 finally{
  if(storage&&storageKey&&!storageCleanup){try{await cleanupStorage();}catch(error){cleanupFailures.push(diagnostic(error,'storage_cleanup','PUBLIC_STORAGE_CLEANUP_FAILED'));}}
  try{databaseCleanup=await cleanupDatabase();}catch(error){cleanupFailures.push(diagnostic(error,'database_cleanup','PUBLIC_DATABASE_CLEANUP_FAILED'));}
  client?.release(true);await db?.end().catch(()=>{});storage?.destroy();
 }
 const result={ok:!failure&&cleanupFailures.length===0,event:'petcore_public_verified',checks,canaryFixtureCleanup:databaseCleanup,probeObjectCleanup:storageCleanup,noEmailOrPaymentAttempted:true,sharedAuthRateLimitsPreserved:true,...failure,cleanupFailures};
 try{fs.writeFileSync('/private/PUBLIC-VERIFIED.json',JSON.stringify(result),{mode:0o600});}catch{result.ok=false;result.receiptWriteFailed=true;if(!result.code)result.code='PUBLIC_RECEIPT_WRITE_FAILED';}
 console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
})();
