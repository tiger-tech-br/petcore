import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';

test('liveness atende sem banco ou sessão e readiness continua consultando o banco',{timeout:60000},async t=>{
 const keys=['DATABASE_URL','SESSION_SECRET','NODE_ENV'] as const;
 const saved=new Map(keys.map(key=>[key,process.env[key]]));
 const secret='health-unit-fixture-secret-'.repeat(3);
 Object.assign(process.env,{DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:1/health_test',SESSION_SECRET:secret,NODE_ENV:'test'});
 const require=createRequire(import.meta.url);
 // Impede até a leitura do .env real: a configuração deste ensaio é toda fictícia.
 const dotenv=require('dotenv') as typeof import('dotenv');
 t.mock.method(dotenv,'config',()=>({parsed:{}}));
 const {Pool}=require('pg') as typeof import('pg');
 const queries=t.mock.method(Pool.prototype,'query',(async()=>{throw Error('FIXTURE_DATABASE_UNAVAILABLE');}) as typeof Pool.prototype.query);
 const connections=t.mock.method(Pool.prototype,'connect',(async()=>{throw Error('FIXTURE_DATABASE_CONNECTION_REFUSED');}) as typeof Pool.prototype.connect);
 t.mock.method(console,'error',()=>{});
 const {createApp}=await import('../src/server.js');
 const {pool}=await import('../src/core.js');
 const server=createApp().listen(0,'127.0.0.1');
 try{
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}`;
  const sessionId='fixture-signed-session';
  const signature=createHmac('sha256',secret).update(sessionId).digest('base64').replace(/=+$/,'');
  for(const cookie of ['',`petcore.sid=${encodeURIComponent(`s:${sessionId}.${signature}`)}`]){
   const response=await fetch(base+'/api/live',{headers:cookie?{Cookie:cookie}:{},signal:AbortSignal.timeout(2000)});
   assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
   assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal(response.headers.get('x-content-type-options'),'nosniff');
   assert.match(response.headers.get('x-request-id')??'',/^[a-f0-9-]{36}$/);
  }
  assert.equal(queries.mock.callCount(),0,'O probe não consulta nem uma sessão assinada.');
  assert.equal(connections.mock.callCount(),0,'O probe não abre conexão.');
  const unavailable=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2000)});
  assert.equal(unavailable.status,500);assert.deepEqual(await unavailable.json(),{error:'Erro interno no servidor.'});
  assert.equal(queries.mock.callCount(),1);assert.equal(queries.mock.calls[0].arguments[0],'SELECT 1');
  queries.mock.mockImplementation((async()=>({command:'SELECT',rowCount:1,oid:0,fields:[],rows:[{'?column?':1}]})) as typeof Pool.prototype.query);
  const ready=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2000)});
  assert.equal(ready.status,200);assert.deepEqual(await ready.json(),{ok:true,database:true});
  assert.equal(queries.mock.callCount(),2);assert.equal(queries.mock.calls[1].arguments[0],'SELECT 1');
  assert.equal(connections.mock.callCount(),0);
 }finally{
  server.closeAllConnections();
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  await pool.end();
  for(const [key,value] of saved){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
