// Fluxo real HTTP/PostgreSQL; o único provedor externo é substituído antes de
// qualquer chamada. Nunca usa DATABASE_URL como alternativa nem envia e-mail.
import {after,before,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl||!decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'))throw Error('Auth: configure TEST_DATABASE_URL exclusivo terminado em _test.');
process.env.DATABASE_URL=testUrl;process.env.NODE_ENV='test';
process.env.SESSION_SECRET='auth-isolated-fixtures-'+randomUUID()+randomUUID();
process.env.DATABASE_SSL??=new URL(testUrl).searchParams.has('sslmode')?'true':'false';
const emailEnv=['EMAIL_PROVIDER','EMAIL_API_KEY','EMAIL_FROM','APP_ORIGIN'] as const;
const savedEnv=new Map(emailEnv.map(key=>[key,process.env[key]]));
process.env.EMAIL_PROVIDER='resend';process.env.EMAIL_API_KEY='provider-key-exclusively-fake';
process.env.EMAIL_FROM='PetCore Fictício <noreply@example.test>';process.env.APP_ORIGIN='https://petcore.example.test';
const {createApp}=await import('../src/server.js');
const {pool:appPool}=await import('../src/core.js');
const {runMaintenanceOnce}=await import('../src/maintenance.js');
const db=new pg.Pool({connectionString:testUrl,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const originalFetch=globalThis.fetch,originalLog=console.error;
const tag=randomUUID().slice(0,8),company=randomUUID(),ids=[randomUUID(),randomUUID()];
const emails=[`reset-${tag}@example.test`,`unaffected-${tag}@example.test`];
const oldPassword='Fixture-antiga-'+randomUUID(),newPassword='Fixture-nova-'+randomUUID();
const ipPrefix=`2001:db8:${randomUUID().slice(0,4)}:${randomUUID().slice(0,4)}`;
const usedIps=new Set<string>();let ipSerial=10;
let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined,base='',session='',secondSession='',otherSession='',rawToken='';
let providerMode:'ok'|'http_error'|'network_error'|'timeout'='ok';
const providerCalls:{body:any;signal:AbortSignal|undefined}[]=[],unexpected:string[]=[],safeLogs:string[]=[];
const ip=()=>{const value=ipPrefix+'::'+ipSerial++;usedIps.add(value);return value;};
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
type Reply={code:number;data:any;headers:Headers};
async function call(path:string,method='GET',body?:unknown,cookie='',source=ip()):Promise<Reply>{
 const response=await fetch(base+'/api/auth'+path,{method,headers:{'X-PetCore-Request':'1','Content-Type':'application/json','X-Forwarded-For':source,Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
 return {code:response.status,data:await response.json(),headers:response.headers};
}
async function login(email:string,password:string){const reply=await call('/login','POST',{email,password});assert.equal(reply.code,200);const cookie=(reply.headers.get('set-cookie')??'').split(';')[0];assert.ok(cookie);return cookie;}
function tokenFromLastMail(){
 const body=providerCalls.at(-1)?.body,href=/href="([^"]+)"/.exec(body?.html??'')?.[1];assert.ok(href,'O provedor simulado deve receber um link.');
 const url=new URL(href);assert.equal(url.origin,'https://petcore.example.test');const value=url.searchParams.get('reset');assert.ok(value&&/^[a-f0-9]{64}$/.test(value));return value;
}

describe('Autenticação: recuperação simulada e invalidação de sessões',{concurrency:false},()=>{
 before(async()=>{
  const hash=await argon2.hash(oldPassword,{type:argon2.argon2id});
  await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[company,'Auth fictício '+tag]);
  for(let n=0;n<ids.length;n++){await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[ids[n],'Conta fictícia '+n,emails[n],hash]);await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",[company,ids[n]]);}
  const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server!.once('listening',resolve));const binding=server.address();assert.ok(binding&&typeof binding!=='string');base=`http://127.0.0.1:${binding.port}`;
  console.error=(...args:unknown[])=>{safeLogs.push(args.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' '));};
  globalThis.fetch=(async(...args:Parameters<typeof fetch>)=>{
   const [input,init]=args;
   const destination=new URL(input instanceof URL?input.href:typeof input==='string'?input:input.url);
   if(destination.origin===base)return originalFetch(input,init);
   if(destination.href!=='https://api.resend.com/emails'){unexpected.push(destination.origin);throw Error('Saída externa bloqueada no teste.');}
   assert.equal(init?.method,'POST');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer provider-key-exclusively-fake');
   providerCalls.push({body:JSON.parse(String(init?.body)),signal:init?.signal??undefined});
   if(providerMode==='network_error')throw Error('erro simulado com dado que não pode vazar: '+emails[1]);
   if(providerMode==='timeout')return new Promise<Response>((_resolve,reject)=>{const signal=init?.signal;assert.ok(signal,'O envio precisa de prazo máximo.');if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
   return new Response(JSON.stringify(providerMode==='http_error'?{error:'provider-key-exclusively-fake '+emails[1]}:{id:'simulated-'+randomUUID()}),{status:providerMode==='http_error'?503:200,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  session=await login(emails[0],oldPassword);secondSession=await login(emails[0],oldPassword);otherSession=await login(emails[1],oldPassword);
 });
 after(async()=>{
  globalThis.fetch=originalFetch;console.error=originalLog;
  if(server){server.closeIdleConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
  try{
   await db.query('DELETE FROM password_resets WHERE user_id=ANY($1::uuid[])',[ids]);
   await db.query('DELETE FROM "session" WHERE sess->>\'userId\'=ANY($1::text[])',[ids]);
   const keys=[...usedIps].flatMap(source=>['/login:','/password/forgot:'].map(path=>sha(path+source)));
   await db.query('DELETE FROM auth_rate_limits WHERE key=ANY($1::text[])',[keys]);
   await db.query('DELETE FROM tenant_subscriptions WHERE tenant_id=$1',[company]);await db.query('DELETE FROM memberships WHERE tenant_id=$1',[company]);
   await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);await db.query('DELETE FROM tenants WHERE id=$1',[company]);
  }finally{for(const key of emailEnv){const saved=savedEnv.get(key);if(saved===undefined)delete process.env[key];else process.env[key]=saved;}await Promise.all([appPool.end(),db.end()]);}
  assert.deepEqual(unexpected,[],'Nenhum serviço externo pode ser chamado pelo teste.');
 });
 test('configuração ausente dá orientação de suporte sem expor nomes de variáveis nem existência da conta',async()=>{
  const before=providerCalls.length;process.env.EMAIL_PROVIDER='';
  try{for(const email of [emails[0],`unknown-${tag}@example.test`]){const reply=await call('/password/forgot','POST',{email});assert.equal(reply.code,503);assert.match(reply.data.error,/suporte/);assert.doesNotMatch(reply.data.error,/EMAIL_|resend|API_KEY/i);}}
  finally{process.env.EMAIL_PROVIDER='resend';}assert.equal(providerCalls.length,before);
 });
 test('conta desconhecida recebe a mensagem genérica sem chamar o provedor nem gravar token',async()=>{
  const before=providerCalls.length,reply=await call('/password/forgot','POST',{email:`unknown-${tag}@example.test`});assert.equal(reply.code,200);assert.deepEqual(reply.data,{message:'Se a conta existir, você receberá orientações por e-mail.'});assert.equal(providerCalls.length,before);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM password_resets WHERE user_id=ANY($1::uuid[])',[ids])).rows[0].n,0);
 });
 test('recuperação conhecida conserva a mensagem genérica e grava só hash com validade de30minutos',async()=>{
  providerMode='ok';const reply=await call('/password/forgot','POST',{email:' '+emails[0].toUpperCase()+' '});
  // O contrato de entrada exige e-mail válido; normalização não elimina a validação.
  assert.equal(reply.code,422);
  const sent=await call('/password/forgot','POST',{email:emails[0].toUpperCase()});assert.equal(sent.code,200);assert.deepEqual(sent.data,{message:'Se a conta existir, você receberá orientações por e-mail.'});
  const sentBody=providerCalls.at(-1)!.body;assert.deepEqual(sentBody.to,[emails[0]]);assert.equal(sentBody.from,process.env.EMAIL_FROM);assert.ok(providerCalls.at(-1)!.signal instanceof AbortSignal);
  rawToken=tokenFromLastMail();const rows=await db.query("SELECT token_hash,expires_at,expires_at BETWEEN now()+interval '29 minutes' AND now()+interval '31 minutes' AS valid_window FROM password_resets WHERE user_id=$1",[ids[0]]);
  assert.equal(rows.rowCount,1);assert.ok(rows.rows[0].token_hash!==rawToken);assert.ok(rows.rows[0].token_hash===sha(rawToken));assert.equal(rows.rows[0].valid_window,true);
 });
 test('token inválido ou expirado é recusado sem mudar senha ou sessão',async()=>{
  const expired='ab'.repeat(32);await db.query("INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2,now()-interval '1 second')",[ids[0],sha(expired)]);
  for(const token of [expired,'0'.repeat(64)])assert.equal((await call('/password/reset','POST',{token,password:newPassword})).code,410);
  assert.equal((await call('/password/reset','POST',{token:'curto',password:newPassword})).code,422);assert.equal((await call('/me','GET',undefined,session)).code,200);
 });
 test('reset concorrente usa o token uma vez, invalida sessões antigas e permite só a senha nova',async()=>{
  const before=(await db.query('SELECT session_version FROM users WHERE id=$1',[ids[0]])).rows[0].session_version;
  const replies=await Promise.all([call('/password/reset','POST',{token:rawToken,password:newPassword}),call('/password/reset','POST',{token:rawToken,password:newPassword})]);assert.deepEqual(replies.map(reply=>reply.code).sort(),[200,410]);
  assert.equal((await call('/me','GET',undefined,session)).code,401);assert.equal((await call('/me','GET',undefined,secondSession)).code,401);assert.equal((await call('/me','GET',undefined,otherSession)).code,200);
  assert.equal((await call('/login','POST',{email:emails[0],password:oldPassword})).code,401);const fresh=await login(emails[0],newPassword);assert.equal((await call('/me','GET',undefined,fresh)).code,200);
  assert.equal((await call('/password/reset','POST',{token:rawToken,password:oldPassword})).code,410);assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[ids[0]])).rows[0].session_version,before+1);
 });
 test('trocar a senha invalida links anteriores da mesma conta e preserva links de outra conta',async()=>{
  for(let n=0;n<2;n++)assert.equal((await call('/password/forgot','POST',{email:emails[0]})).code,200);
  const newest=tokenFromLastMail(),older=new URL(/href="([^"]+)"/.exec(providerCalls.at(-2)!.body.html)![1]).searchParams.get('reset')!;
  assert.equal((await call('/password/forgot','POST',{email:emails[1]})).code,200);const unrelated=tokenFromLastMail();
  const before=(await db.query('SELECT session_version FROM users WHERE id=$1',[ids[0]])).rows[0].session_version;
  assert.equal((await call('/password/reset','POST',{token:newest,password:newPassword})).code,200);
  const rejected=await call('/password/reset','POST',{token:older,password:oldPassword});assert.equal(rejected.code,410);assert.deepEqual(rejected.data,{error:'Token inválido ou expirado.'});
  assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[ids[0]])).rows[0].session_version,before+1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM password_resets WHERE user_id=$1 AND used_at IS NULL',[ids[0]])).rows[0].n,0);
  assert.equal((await db.query('SELECT used_at FROM password_resets WHERE token_hash=$1',[sha(unrelated)])).rows[0].used_at,null);
  assert.equal((await call('/me','GET',undefined,otherSession)).code,200);await login(emails[0],newPassword);
 });
 test('links diferentes concorrentes mudam a senha uma única vez e uma emissão posterior continua utilizável',async()=>{
  assert.equal((await call('/password/forgot','POST',{email:emails[0]})).code,200);const first=tokenFromLastMail();
  assert.equal((await call('/password/forgot','POST',{email:emails[0]})).code,200);const second=tokenFromLastMail();
  const passwords=['Fixture-vencedora-A-'+randomUUID(),'Fixture-vencedora-B-'+randomUUID()];
  const before=(await db.query('SELECT session_version FROM users WHERE id=$1',[ids[0]])).rows[0].session_version;
  const replies=await Promise.all([call('/password/reset','POST',{token:first,password:passwords[0]}),call('/password/reset','POST',{token:second,password:passwords[1]})]);
  assert.deepEqual(replies.map(reply=>reply.code).sort(),[200,410]);const winner=replies.findIndex(reply=>reply.code===200);
  assert.equal((await db.query('SELECT session_version FROM users WHERE id=$1',[ids[0]])).rows[0].session_version,before+1);
  assert.equal((await call('/login','POST',{email:emails[0],password:passwords[1-winner]})).code,401);await login(emails[0],passwords[winner]);
  assert.equal((await call('/password/forgot','POST',{email:emails[0]})).code,200);const fresh=tokenFromLastMail();
  assert.equal((await call('/password/reset','POST',{token:fresh,password:newPassword})).code,200);await login(emails[0],newPassword);
 });
 test('falhas HTTP e de rede viram502 seguros sem alterar a senha ou a sessão',async()=>{
  const before=(await db.query('SELECT password_hash,session_version FROM users WHERE id=$1',[ids[1]])).rows[0];
  for(const mode of ['http_error','network_error'] as const){providerMode=mode;const reply=await call('/password/forgot','POST',{email:emails[1]});assert.equal(reply.code,502);assert.match(reply.data.error,/suporte/);assert.doesNotMatch(reply.data.error,/EMAIL_|API_KEY|resend|example\.test|provider-key/i);}
  providerMode='ok';const after=(await db.query('SELECT password_hash,session_version FROM users WHERE id=$1',[ids[1]])).rows[0];assert.deepEqual(after,before);assert.equal((await call('/me','GET',undefined,otherSession)).code,200);
  assert.ok(safeLogs.every(line=>!line.includes(emails[1])&&!line.includes('provider-key-exclusively-fake')));
 });
 test('envio travado é abortado pelo prazo de10segundos e não muda a conta',async()=>{
  providerMode='timeout';const started=Date.now();const reply=await call('/password/forgot','POST',{email:emails[1]});const elapsed=Date.now()-started;providerMode='ok';
  assert.equal(reply.code,502);assert.ok(elapsed>=9000&&elapsed<25000,'O prazo deve abortar o envio sem espera indefinida.');assert.equal(providerCalls.at(-1)!.signal?.aborted,true);assert.match(reply.data.error,/suporte/);
  assert.equal((await call('/me','GET',undefined,otherSession)).code,200);assert.equal(await argon2.verify((await db.query('SELECT password_hash FROM users WHERE id=$1',[ids[1]])).rows[0].password_hash,oldPassword),true);
 });
 test('recuperação mantém o limite de tentativas inclusive para endereço desconhecido',async()=>{
  const source=ip(),before=providerCalls.length;for(let n=0;n<10;n++)assert.equal((await call('/password/forgot','POST',{email:`unknown-${tag}@example.test`},'',source)).code,200);
  assert.equal((await call('/password/forgot','POST',{email:`unknown-${tag}@example.test`},'',source)).code,429);assert.equal(providerCalls.length,before);
 });
 test('limpeza de tokens vencidos não espera uma recuperação que mantém um token bloqueado',async()=>{
  const held=randomUUID(),available=randomUUID(),lock=await db.connect();
  await db.query("INSERT INTO password_resets(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()-interval '1 day'),($4,$2,$5,now()-interval '1 day')",[held,ids[0],sha(held),available,sha(available)]);
  try{
   await lock.query('BEGIN');await lock.query('SELECT id FROM password_resets WHERE id=$1 FOR UPDATE',[held]);
   const deadline=setTimeout(()=>void lock.query('ROLLBACK'),5000);deadline.unref();
   try{const start=Date.now();const result=await runMaintenanceOnce({files:false});assert.equal(result.ok,true);assert.ok(Date.now()-start<4000,'A limpeza não deve esperar o token bloqueado.');}
   finally{clearTimeout(deadline);}
   assert.equal((await db.query('SELECT count(*)::int AS n FROM password_resets WHERE id=$1',[held])).rows[0].n,1);
   assert.equal((await db.query('SELECT count(*)::int AS n FROM password_resets WHERE id=$1',[available])).rows[0].n,0);
  }finally{await lock.query('ROLLBACK');lock.release();await db.query('DELETE FROM password_resets WHERE id=ANY($1::uuid[])',[[held,available]]);}
 });
});
