import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

const testUrl=process.env.TEST_DATABASE_URL;
if(!testUrl)throw Error('Configure TEST_DATABASE_URL exclusivo terminado em _test.');
const address=new URL(testUrl);
if(!decodeURIComponent(address.pathname).endsWith('_test'))throw Error('O ensaio de desconexão exige banco exclusivo *_test.');
const secure=process.env.DATABASE_SSL==='true'||Boolean(address.searchParams.get('sslmode')&&address.searchParams.get('sslmode')!=='disable');

test('O processo sobrevive à perda real de uma conexão ociosa e atende a próxima consulta sem expor o cliente',{timeout:20000},async()=>{
 const admin=new pg.Pool({connectionString:testUrl,max:1,connectionTimeoutMillis:5000,ssl:secure?{rejectUnauthorized:true}:undefined});
 const source=`
  import {pool} from ${JSON.stringify(new URL('../src/core.ts',import.meta.url).href)};
  process.on('message',async command=>{
   if(command==='recover'){
    const result=await pool.query('SELECT pg_backend_pid()::int AS pid,42::int AS answer');
    process.send({kind:'recovered',...result.rows[0]});
   }else if(command==='unsafe-error'){
    pool.emit('error',Object.assign(new Error('private-email@example.test private-password'),{code:'PRIVATE-SECRET'}),{connectionParameters:{password:'private-password'}});
    process.send({kind:'handled'});
   }else if(command==='stop'){
    await pool.end();process.disconnect();
   }
  });
  const result=await pool.query('SELECT pg_backend_pid()::int AS pid');
  process.send({kind:'ready',pid:result.rows[0].pid,idleCount:pool.idleCount});
 `;
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','--eval',source],{
  cwd:fileURLToPath(new URL('../../',import.meta.url)),
  env:{...process.env,DATABASE_URL:testUrl,DATABASE_SSL:secure?'true':'false',NODE_ENV:'test',SESSION_SECRET:'isolated-database-probe-'+randomUUID()+randomUUID()},
  stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,
 });
 let stderr='';child.stderr!.on('data',chunk=>{stderr+=String(chunk);});
 const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),15000);
 const nextMessage=async()=>{
  const message=once(child,'message',{signal:controller.signal});
  const exit=once(child,'exit',{signal:controller.signal}).then(([code])=>{throw Error('O processo encerrou antes da resposta: '+code);});
  return (await Promise.race([message,exit]))[0] as {kind:string;pid:number;idleCount?:number;answer?:number};
 };
 try{
  const ready=await nextMessage();assert.equal(ready.kind,'ready');assert.equal(ready.idleCount,1);
  // Only terminate the backend opened by this disposable child, never other sessions.
  const idleError=once(child.stderr!,'data',{signal:controller.signal});
  const terminated=await admin.query('SELECT pg_terminate_backend($1) AS ok',[ready.pid]);assert.equal(terminated.rows[0].ok,true);
  await idleError;
  const recovery=nextMessage();child.send('recover');const recovered=await recovery;
  assert.equal(recovered.kind,'recovered');assert.equal(recovered.answer,42);assert.notEqual(recovered.pid,ready.pid);
  const handled=nextMessage();child.send('unsafe-error');assert.equal((await handled).kind,'handled');
  const stopped=once(child,'exit',{signal:controller.signal});child.send('stop');assert.equal((await stopped)[0],0);
  const logs=stderr.trim().split(/\r?\n/).map(line=>JSON.parse(line));
  assert.deepEqual(logs,[{event:'database_idle_connection_lost'},{event:'database_idle_connection_lost'}]);
  assert.doesNotMatch(stderr,/private-email|private-password|PRIVATE-SECRET|connectionParameters/);
 }finally{
  clearTimeout(deadline);controller.abort();if(child.exitCode===null)child.kill();await admin.end();
 }
});
