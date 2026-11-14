// Own *_test fixtures and an injected exporter stub: no client datasets or S3.
import {after,before,beforeEach,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {writeFile,lstat} from 'node:fs/promises';
import {dirname} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import express from 'express';
import pg from 'pg';
import argon2 from 'argon2';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Configure TEST_DATABASE_URL exclusivo terminado em _test.');
process.env.DATABASE_URL=testUrl;process.env.DATABASE_DIRECT_URL=testUrl;process.env.NODE_ENV='test';process.env.SESSION_SECRET='tenant-export-route-fixture-'+randomUUID()+randomUUID();
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
const {auth,platform,pool,sendError}=await import('../src/core.js');
const {createTenantExportHandler,tenantExportRequests}=await import('../src/tenantExportRoutes.js');
const db=new pg.Pool({connectionString:testUrl,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined,max:3});
const ids={a:randomUUID(),b:randomUUID(),operator:randomUUID(),admin:randomUUID(),employee:randomUUID(),ticketA:randomUUID(),ticketB:randomUUID()};
const tag=randomUUID().slice(0,8),password='Local-export-operator-'+randomUUID(),sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const rateKeys=[sha('sensitive-action:'+ids.operator),sha('tenant-export:'+ids.operator)];
let server:ReturnType<ReturnType<typeof express>['listen']>|undefined,base='',mode='ok',started:(()=>void)|undefined,aborted=false;
const exportsSeen:{args:string[];path:string}[]=[],originalFetch=globalThis.fetch,unexpected:string[]=[],logs:string[]=[];
const originalError=console.error;
const exists=async(path:string)=>{try{await lstat(path);return true;}catch{return false;}};
async function waitFor(check:()=>Promise<boolean>){const until=Date.now()+5000;while(Date.now()<until){if(await check())return;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail('O recurso temporário não foi liberado no prazo do teste.');}
async function call(path:string,body?:unknown,session='operator',signal?:AbortSignal){
 return fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Fixture-Session':session,'X-PetCore-Request':'1'},body:body===undefined?undefined:JSON.stringify(body),signal});
}
const requestBody=(changes:Record<string,unknown>={})=>({password,ticket_id:ids.ticketA,identity_verified:true,...changes});
const exportPath=(company=ids.a)=>`/api/commercial/platform/subscriptions/${company}/export`;

describe('Download de exportação: autorização, concorrência, aborto e descarte privado',{concurrency:false},()=>{
 before(async()=>{
  for(const [id,name] of [[ids.a,'Empresa export A '+tag],[ids.b,'Empresa export B '+tag]])await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[id,name]);
  const hash=await argon2.hash(password);
  for(const role of ['operator','admin','employee'] as const)await db.query('INSERT INTO users(id,name,email,password_hash,is_platform_owner) VALUES($1,$2,$3,$4,$5)',[ids[role],'Pessoa fictícia '+role,role+'-'+tag+'@example.test',hash,role==='operator']);
  await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin'),($1,$3,'employee')",[ids.a,ids.admin,ids.employee]);
  await db.query("INSERT INTO support_tickets(id,tenant_id,created_by,subject,category) VALUES($1,$2,$3,'Exportação A','privacy'),($4,$5,$3,'Exportação B','privacy')",[ids.ticketA,ids.a,ids.operator,ids.ticketB,ids.b]);
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{const key=String(req.headers['x-fixture-session']??'');const actor=key==='operator'?ids.operator:key==='admin'?ids.admin:key==='employee'?ids.employee:null;(req as any).session=actor?{userId:actor,sessionVersion:1,...(key==='operator'?{}:{tenantId:ids.a})}:{};next();});
  app.get('/api/commercial/platform/subscriptions/:id/export-requests',auth,platform,tenantExportRequests);
  app.post('/api/commercial/platform/subscriptions/:id/export',auth,platform,createTenantExportHandler({exporter:async(args,{signal})=>{
   const path=args[args.indexOf('--output')+1];exportsSeen.push({args,path});
   if(mode==='error')throw Object.assign(Error('PRIVATE_PROVIDER_SECRET must never reach an HTTP response'),{code:'TENANT_EXPORT_PROVIDER_FAILED'});
   if(mode==='wait'){
    started?.();await new Promise<void>((_resolve,reject)=>{const cancel=()=>{aborted=true;reject(Object.assign(Error('cancelled'),{code:'TENANT_EXPORT_ABORTED'}));};if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});});
   }
   await writeFile(path,gzipSync('exclusively-fictitious-export-'+ids.a),{flag:'wx',mode:0o600});
   return {archivePath:path,completeOperationalData:true};
  }}));
  app.use(sendError);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;
  globalThis.fetch=(async(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(url.origin!==base){unexpected.push(url.origin);throw Error('Saída externa bloqueada no teste de exportação.');}return originalFetch(input,init);}) as typeof fetch;
  console.error=(...values)=>{logs.push(values.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' '));};
 });
 beforeEach(async()=>{mode='ok';aborted=false;started=undefined;await db.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[rateKeys]);});
 after(async()=>{
  globalThis.fetch=originalFetch;console.error=originalError;if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
  try{
   await db.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[rateKeys]);
   await db.query('DELETE FROM support_tickets WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM memberships WHERE tenant_id=$1',[ids.a]);await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[ids.operator,ids.admin,ids.employee]]);
  }finally{await pool.end();await db.end();}
  assert.deepEqual(unexpected,[]);assert.ok(!logs.join('\n').includes('PRIVATE_PROVIDER_SECRET'));
 });

 test('somente a plataforma lê os atendimentos e inicia exportações',async()=>{
  for(const [session,status] of [['anonymous',401],['admin',403],['employee',403]] as const){
   assert.equal((await call(`/api/commercial/platform/subscriptions/${ids.a}/export-requests`,undefined,session)).status,status);
   assert.equal((await call(exportPath(),requestBody(),session)).status,status);
  }
  const before=exportsSeen.length,response=await call(`/api/commercial/platform/subscriptions/${ids.a}/export-requests`);assert.equal(response.status,200);const body=await response.json() as any;
  assert.deepEqual(body.items.map((item:any)=>item.id),[ids.ticketA]);assert.equal(exportsSeen.length,before);
 });

 test('senha, identidade, escopo do chamado e empresa da URL são obrigatórios',async()=>{
  const before=exportsSeen.length;
  assert.equal((await call(exportPath(),requestBody({password:'wrong'}))).status,403);
  assert.equal((await call(exportPath(),requestBody({identity_verified:false}))).status,422);
  assert.equal((await call(exportPath(),requestBody({ticket_id:ids.ticketB}))).status,404);
  assert.equal((await call(exportPath(),requestBody({tenant_id:ids.b}))).status,422);
  assert.equal((await call(exportPath(randomUUID()),requestBody())).status,404);
  assert.equal(exportsSeen.length,before);
 });

 test('envia um attachment privado e remove a cópia temporária após o download',async()=>{
  const response=await call(exportPath(),requestBody());assert.equal(response.status,200);assert.match(response.headers.get('content-type')??'',/application\/gzip/);assert.match(response.headers.get('content-disposition')??'',/^attachment/);assert.match(response.headers.get('cache-control')??'',/no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(gunzipSync(bytes).toString(),'exclusively-fictitious-export-'+ids.a);
  const record=exportsSeen.at(-1)!;assert.equal(record.args[record.args.indexOf('--tenant')+1],ids.a);assert.equal(record.args[record.args.indexOf('--reference')+1],'support:'+ids.ticketA);await waitFor(async()=>!await exists(dirname(record.path)));
 });

 test('falha de preparação não expõe conteúdo nem deixa cópia local',async()=>{
  mode='error';const response=await call(exportPath(),requestBody());assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE_PROVIDER_SECRET|fixture-|postgres/i);const record=exportsSeen.at(-1)!;await waitFor(async()=>!await exists(dirname(record.path)));
 });

 test('limite por operador recusa nova preparação antes de chamar o exportador',async()=>{
  await db.query("INSERT INTO auth_rate_limits(key,attempts) VALUES($1,3)",[rateKeys[1]]);const before=exportsSeen.length;assert.equal((await call(exportPath(),requestBody())).status,429);assert.equal(exportsSeen.length,before);
 });

 test('cancelar a requisição aborta a preparação, libera o lock e permite outro download',async()=>{
  mode='wait';const ready=new Promise<void>(resolve=>{started=resolve;}),controller=new AbortController();const pending=call(exportPath(),requestBody(),'operator',controller.signal);await ready;
  const second=await call(exportPath(),requestBody());assert.equal(second.status,429);controller.abort();await assert.rejects(pending);
  const record=exportsSeen.at(-1)!;await waitFor(async()=>aborted&&!await exists(dirname(record.path)));
  const client=await db.connect();try{await waitFor(async()=>{const locked=(await client.query('SELECT pg_try_advisory_lock($1) AS locked',[719381013])).rows[0].locked;if(locked)await client.query('SELECT pg_advisory_unlock($1)',[719381013]);return locked;});}finally{client.release();}
  mode='ok';const response=await call(exportPath(),requestBody());assert.equal(response.status,200);await response.arrayBuffer();await waitFor(async()=>!await exists(dirname(exportsSeen.at(-1)!.path)));
 });
});
