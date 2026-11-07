// Teste operacional explícito; não é executado pela suíte comum. Requer PostgreSQL
// local e TEST_DATABASE_URL terminado em _test. Nunca recebe DATABASE_URL real.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readdir,realpath,lstat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {Pool} from 'pg';

const source=new URL(process.env.TEST_DATABASE_URL||'postgresql://invalid/missing');
const sourceName=decodeURIComponent(source.pathname.slice(1));
assert.ok(['postgres:','postgresql:'].includes(source.protocol),'Use PostgreSQL local de testes.');
assert.ok(['127.0.0.1','localhost'].includes(source.hostname),'O roundtrip só aceita loopback.');
assert.match(sourceName,/^[a-z][a-z0-9_]*_test$/,'A origem precisa terminar em _test.');
assert.ok(source.port,'Informe a porta local explicitamente.');
assert.equal(source.searchParams.size,0,'A conexão local de teste não recebe opções de SSL ou arquivos.');
process.env.DATABASE_URL=source.toString();
process.env.DATABASE_DIRECT_URL=source.toString();
process.env.DATABASE_SSL='false';
process.env.NODE_ENV='test';
const encryptionKey=randomBytes(32).toString('hex');
process.env.BACKUP_ENCRYPTION_KEY=encryptionKey;
const {runBackup,rowCounts,safeCode}=await import('../scripts/backup.mjs');
const {checkRestore}=await import('../scripts/restore-check.mjs');

const destinationName='petcore_'+randomBytes(8).toString('hex')+'_restore_test';
assert.notEqual(destinationName,sourceName);
const destination=new URL(source);destination.pathname='/'+destinationName;
const adminAddress=new URL(source);adminAddress.pathname='/postgres';
const admin=new Pool({connectionString:adminAddress.toString(),max:1});
const original=new Pool({connectionString:source.toString(),max:1});
let restored,created=false,output;
const result={ok:false,checks:[]};
async function rejected(args,expectedCode){
 await assert.rejects(checkRestore(args),error=>error?.code===expectedCode);
 result.checks.push(expectedCode);
}
async function encryptedFiles(directory){
 const names=await readdir(directory);
 assert.equal(names.length,2,'O diretório de saída só pode conter os dois arquivos criptografados.');
 assert.ok(names.every(name=>name.endsWith('.enc')));
 const dump=names.find(name=>name.endsWith('.dump.enc'));
 const manifest=names.find(name=>name.endsWith('.manifest.enc'));
 assert.ok(dump&&manifest);
 return ['--file',join(directory,dump),'--manifest',join(directory,manifest)];
}
try{
 // O nome aleatório foi gerado e validado acima; nunca remove banco preexistente.
 await admin.query('CREATE DATABASE "'+destinationName+'"');created=true;
 restored=new Pool({connectionString:destination.toString(),max:1});
 output=await mkdtemp(join(tmpdir(),'petcore-roundtrip-'));
 const manifest=await runBackup(['--local','--output',output]);
 const files=await encryptedFiles(output);
 process.env.RESTORE_DATABASE_URL=destination.toString();
 process.env.BACKUP_ENCRYPTION_KEY=randomBytes(32).toString('hex');
 await rejected(files,'BACKUP_INTEGRITY_FAILURE');
 assert.deepEqual(await rowCounts(restored),[],'Chave incorreta não cria tabelas no destino.');
 process.env.BACKUP_ENCRYPTION_KEY=encryptionKey;
 const verified=await checkRestore([...files,'--record']);
 assert.equal(verified.ok,true);assert.equal(verified.recorded,true);
 const counts=await rowCounts(restored);
 assert.deepEqual(counts,manifest.tables,'Todas as tabelas devem manter a contagem do snapshot.');
 assert.ok(counts.length>0);
 const run=(await original.query('SELECT state,verified_at FROM backup_runs WHERE id=$1',[manifest.backupId])).rows[0];
 assert.equal(run.state,'verified');assert.ok(run.verified_at);
 result.tablesVerified=counts.length;
 result.rowsVerified=counts.reduce((sum,table)=>sum+Number(table.rows),0);
 result.checks.push('RESTORE_ROW_COUNTS_MATCH','BACKUP_RUN_VERIFIED');
 await rejected(files,'RESTORE_TARGET_NOT_EMPTY');
 assert.deepEqual(await rowCounts(restored),counts,'Destino não vazio permanece intacto.');
 const sourceCounts=await rowCounts(original);
 process.env.RESTORE_DATABASE_URL=source.toString();
 await rejected(files,'RESTORE_ISOLATED_DATABASE_REQUIRED');
 assert.deepEqual(await rowCounts(original),sourceCounts,'Tentativa de usar a origem não modifica seus dados.');
 result.checks.push('ORIGINAL_SOURCE_PRESERVED');
 // Também cobre a proteção por fingerprint quando a própria origem tem o
 // sufixo permitido para restauração. Usa somente o banco criado nesta execução.
 process.env.DATABASE_URL=destination.toString();
 process.env.DATABASE_DIRECT_URL=destination.toString();
 process.env.RESTORE_DATABASE_URL=destination.toString();
 const ownOutput=join(output,'owned-source');
 await runBackup(['--local','--output',ownOutput]);
 const ownCounts=await rowCounts(restored);
 await rejected(await encryptedFiles(ownOutput),'RESTORE_SOURCE_EQUALS_TARGET');
 assert.deepEqual(await rowCounts(restored),ownCounts,'Proteção por fingerprint não modifica a origem.');
 result.ok=true;
}catch(error){
 result.errorCode=safeCode(error,'ROUNDTRIP_ASSERTION_FAILED');process.exitCode=1;
}finally{
 // Validação de identidade e localização antes de toda remoção recursiva.
 await restored?.end();await original.end();
 if(created){
  const address=new URL(destination);
  assert.ok(['127.0.0.1','localhost'].includes(address.hostname));
  assert.equal(address.port,source.port);
  assert.equal(decodeURIComponent(address.pathname.slice(1)),destinationName);
  assert.match(destinationName,/^petcore_[a-f0-9]{16}_restore_test$/);
  assert.notEqual(destinationName,sourceName);
  // Não usa FORCE: conexões inesperadas impedem a exclusão em vez de serem mortas.
  await admin.query('DROP DATABASE "'+destinationName+'"');
  result.databaseCleaned=true;
 }
 await admin.end();
 if(output){
  const target=await realpath(output),parent=await realpath(tmpdir()),info=await lstat(output);
  assert.equal(info.isSymbolicLink(),false);
  assert.equal(dirname(target),parent);
  assert.equal(basename(target),basename(output));
  assert.ok(basename(target).startsWith('petcore-roundtrip-'));
  await rm(target,{recursive:true,force:true});result.filesCleaned=true;
 }
 process.env.BACKUP_ENCRYPTION_KEY='';
}
console.log(JSON.stringify({event:'backup_roundtrip_test',...result}));
