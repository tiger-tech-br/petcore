// Teste de recuperação remota com cifra real e S3/SQL inteiramente bloqueados.
// Não usa credenciais operacionais nem abre conexões com bancos/provedores.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdtemp,readdir,rm,realpath} from 'node:fs/promises';
import {dirname,basename,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import {tmpdir} from 'node:os';
import pg from 'pg';
import {GetObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {encryptBackupFile} from '../dist/backupCrypto.js';

const privateRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../deploy/private');
const {checkRestore}=await import('../scripts/restore-check.mjs');
const {safeCode}=await import('../scripts/backup.mjs');
const manifestLimit=5*1024*1024+36;
const hash=value=>createHash('sha256').update(value).digest('hex');
const keys=['DATABASE_URL','DATABASE_DIRECT_URL','DATABASE_SSL','NODE_ENV','RESTORE_DATABASE_URL','RESTORE_RETENTION_PAUSED','BACKUP_ENCRYPTION_KEY','BACKUP_STORAGE_ENDPOINT','BACKUP_STORAGE_REGION','BACKUP_STORAGE_BUCKET','BACKUP_STORAGE_ACCESS_KEY','BACKUP_STORAGE_SECRET_KEY','BACKUP_STORAGE_PREFIX','OBJECT_STORAGE_ENDPOINT','OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_ACCESS_KEY','OBJECT_STORAGE_SECRET_KEY','PG_RESTORE_PATH','TEMP','TMP'];

async function fixture(run){
 const directory=await mkdtemp(join(privateRoot,'restore-download-fixture-'));
 const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const originalSend=S3Client.prototype.send,originalConnect=pg.Pool.prototype.connect;
 const key=randomBytes(32),backupId=randomUUID(),objectKey='restore-bounds/fake-'+backupId+'.dump.enc',manifestKey=objectKey.replace(/\.dump\.enc$/,'.manifest.enc');
 const requests=[],streams=[];let databaseConnections=0;
 try{
  Object.assign(process.env,{DATABASE_URL:'postgresql://fixture:fake@127.0.0.1:1/source_test',DATABASE_DIRECT_URL:'postgresql://fixture:fake@127.0.0.1:1/source_test',DATABASE_SSL:'false',NODE_ENV:'test',RESTORE_DATABASE_URL:'postgresql://fixture:fake@127.0.0.1:1/separate_restore_test',RESTORE_RETENTION_PAUSED:'YES',BACKUP_ENCRYPTION_KEY:key.toString('hex'),BACKUP_STORAGE_ENDPOINT:'https://storage.example.test',BACKUP_STORAGE_REGION:'auto',BACKUP_STORAGE_BUCKET:'fake-backups',BACKUP_STORAGE_ACCESS_KEY:'fake-access',BACKUP_STORAGE_SECRET_KEY:'fake-secret',BACKUP_STORAGE_PREFIX:'restore-bounds',OBJECT_STORAGE_ENDPOINT:'',OBJECT_STORAGE_BUCKET:'',OBJECT_STORAGE_ACCESS_KEY:'',OBJECT_STORAGE_SECRET_KEY:'',PG_RESTORE_PATH:join(directory,'not-a-real-pg-restore.exe'),TEMP:directory,TMP:directory});
  assert.equal(resolve(tmpdir()),directory,'Temporários do teste ficam somente na pasta privada própria.');
  const plaintext=Buffer.from('Only a fictional dump; no real database contents.');
  await writeFile(join(directory,'fixture.dump'),plaintext,{flag:'wx'});
  const encrypted=join(directory,'fixture.dump.enc'),metadata=await encryptBackupFile(join(directory,'fixture.dump'),encrypted,key),dump=await readFile(encrypted);
  const manifest={format:'petcore.backup.v1',backupId,sourceFingerprint:hash('127.0.0.1:1/source_test'),dumpSha256:metadata.sha256,dumpBytes:metadata.sizeBytes,plaintextSha256:hash(plaintext),plaintextBytes:plaintext.length,tables:[]};
  async function encryptedManifest(overrides={}){
   const id=randomUUID(),plain=join(directory,id+'.json'),target=plain+'.enc';
   await writeFile(plain,JSON.stringify({...manifest,...overrides}),{flag:'wx'});await encryptBackupFile(plain,target,key);return readFile(target);
  }
  const validManifest=await encryptedManifest();
  const response=(content,ContentLength=content.length)=>{
   const Body=Buffer.isBuffer(content)?Readable.from([content]):content;streams.push(Body);return {Body,ContentLength};
  };
  let responder=async command=>response(command.input.Key===manifestKey?validManifest:dump);
  S3Client.prototype.send=async function(command){
   assert.ok(command instanceof GetObjectCommand,'Nenhuma escrita no armazenamento é permitida.');
   assert.equal(command.input.Bucket,'fake-backups');assert.ok([objectKey,manifestKey].includes(command.input.Key));requests.push(command.input.Key);return responder(command);
  };
  pg.Pool.prototype.connect=async function(){databaseConnections++;throw Error('A recuperação incompleta nunca pode acessar o banco de destino.');};
  await run({directory,dump,manifest,objectKey,manifestKey,validManifest,encryptedManifest,response,requests,setResponder:value=>{responder=value;}});
  assert.equal(databaseConnections,0);
  assert.equal((await readdir(directory)).filter(name=>name.startsWith('petcore-backup-')).length,0,'Toda cópia parcial criada pela recuperação foi removida.');
  assert.ok(streams.every(stream=>stream.destroyed),'Os streams do provedor foram encerrados.');
 }finally{
  S3Client.prototype.send=originalSend;pg.Pool.prototype.connect=originalConnect;
  for(const name of keys){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}
  const target=await realpath(directory),parent=await realpath(privateRoot);
  assert.equal(dirname(target),parent);assert.ok(basename(target).startsWith('restore-download-fixture-'));await rm(target,{recursive:true,force:true});
 }
}

test('manifesto com tamanho excessivo é recusado antes de ler o corpo ou pedir o dump',async()=>fixture(async f=>{
 let bytesRead=false;
 f.setResponder(async()=>f.response(Readable.from((async function*(){bytesRead=true;yield Buffer.from('never consumed');})()),manifestLimit+1));
 await assert.rejects(checkRestore(['--object-key',f.objectKey]),{code:'RESTORE_MANIFEST_TOO_LARGE'});
 assert.equal(bytesRead,false);assert.deepEqual(f.requests,[f.manifestKey]);
}));

test('manifesto sem Content-Length continua limitado durante o download',async()=>fixture(async f=>{
 f.setResponder(async()=>f.response(Readable.from([Buffer.alloc(manifestLimit+1)]),undefined));
 await assert.rejects(checkRestore(['--object-key',f.objectKey]),{code:'RESTORE_MANIFEST_TOO_LARGE'});assert.deepEqual(f.requests,[f.manifestKey]);
}));

test('metadados de tamanho autenticados precisam ser inteiros seguros e corresponder ao envelope',async()=>fixture(async f=>{
 for(const invalid of [{dumpBytes:String(f.manifest.dumpBytes)},{dumpBytes:-1},{dumpBytes:1.5},{dumpBytes:Number.MAX_SAFE_INTEGER+1},{plaintextBytes:-1},{plaintextBytes:f.manifest.plaintextBytes+1}]){
  const manifest=await f.encryptedManifest(invalid);f.setResponder(async()=>f.response(manifest));
  await assert.rejects(checkRestore(['--object-key',f.objectKey]),{code:'RESTORE_MANIFEST_INVALID'});
 }
 assert.ok(f.requests.every(key=>key===f.manifestKey));
}));

test('chave errada recusa a recuperação antes de pedir o dump',async()=>fixture(async f=>{
 process.env.BACKUP_ENCRYPTION_KEY=randomBytes(32).toString('hex');
 await assert.rejects(checkRestore(['--object-key',f.objectKey]),{code:'BACKUP_INTEGRITY_FAILURE'});
 assert.deepEqual(f.requests,[f.manifestKey]);
}));

test('origem autenticada igual ao destino não baixa o dump',async()=>fixture(async f=>{
 const manifest=await f.encryptedManifest({sourceFingerprint:hash('127.0.0.1:1/separate_restore_test')});f.setResponder(async()=>f.response(manifest));
 await assert.rejects(checkRestore(['--object-key',f.objectKey]),{code:'RESTORE_SOURCE_EQUALS_TARGET'});assert.deepEqual(f.requests,[f.manifestKey]);
}));

test('dump com Content-Length divergente é recusado sem ler seus bytes',async()=>fixture(async f=>{
 let bytesRead=false;f.setResponder(async command=>command.input.Key===f.manifestKey?f.response(f.validManifest):f.response(Readable.from((async function*(){bytesRead=true;yield f.dump;})()),f.dump.length+1));
 await assert.rejects(checkRestore(['--object-key',f.objectKey]),{code:'RESTORE_DUMP_SIZE_INVALID'});assert.equal(bytesRead,false);assert.deepEqual(f.requests,[f.manifestKey,f.objectKey]);
}));

test('dump sem Content-Length é recusado se ultrapassar ou não alcançar o tamanho autenticado',async()=>fixture(async f=>{
 for(const body of [Buffer.concat([f.dump,Buffer.from([0])]),f.dump.subarray(0,-1)]){
  f.setResponder(async command=>command.input.Key===f.manifestKey?f.response(f.validManifest):f.response(Readable.from([body]),undefined));
  await assert.rejects(checkRestore(['--object-key',f.objectKey]),{code:'RESTORE_DUMP_SIZE_INVALID'});
 }
 assert.deepEqual(f.requests,[f.manifestKey,f.objectKey,f.manifestKey,f.objectKey]);
}));

test('interrupção após bytes parciais encerra o download sem expor a mensagem do provedor na saída CLI',async()=>fixture(async f=>{
 const upstream=Object.assign(new Error('Detalhe fictício privado do provedor: fixture-secret-do-not-publish'),{code:'ECONNRESET'});
 f.setResponder(async command=>command.input.Key===f.manifestKey?f.response(f.validManifest):f.response(Readable.from((async function*(){
  yield f.dump.subarray(0,Math.floor(f.dump.length/2));
  await new Promise(resolve=>setImmediate(resolve));
  throw upstream;
 })()),f.dump.length));
 await assert.rejects(checkRestore(['--object-key',f.objectKey]),error=>{
  assert.equal(error.code,'ECONNRESET');
  // A entrada CLI serializa exclusivamente safeCode, nunca message/stack.
  const cliOutput=JSON.stringify({ok:false,code:safeCode(error,'RESTORE_FAILED')});
  assert.equal(cliOutput,'{"ok":false,"code":"ECONNRESET"}');
  assert.ok(!cliOutput.includes('fixture-secret')&&!cliOutput.includes('provedor'));
  return true;
 });
 assert.deepEqual(f.requests,[f.manifestKey,f.objectKey]);
}));

test('backup database-only v1 com tamanho correto autentica e alcança a checagem do pg_restore',async()=>fixture(async f=>{
 await assert.rejects(checkRestore(['--object-key',f.objectKey]),{code:'POSTGRES_PROGRAM_UNAVAILABLE'});
 assert.deepEqual(f.requests,[f.manifestKey,f.objectKey]);
}));
