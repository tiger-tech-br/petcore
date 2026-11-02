import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {decryptBackupFile,encryptBackupFile,hashBackupFile,parseBackupKey} from '../src/backupCrypto.ts';

async function temporary(run:(directory:string)=>Promise<void>){
 const root=resolve(tmpdir()),directory=await mkdtemp(join(root,'petcore-backup-unit-'));
 try{await run(directory);}finally{if(dirname(resolve(directory))!==root||!basename(directory).startsWith('petcore-backup-unit-'))throw Error('Destino de limpeza inesperado.');await rm(directory,{recursive:true,force:true});}
}
test('chave aceita somente 256 bits em hexadecimal e nunca mostra seu conteúdo em erros',()=>{
 const secret=randomBytes(32).toString('hex');assert.equal(parseBackupKey(secret).length,32);
 for(const invalid of [undefined,'','abc','g'.repeat(64),'a'.repeat(63),' '+secret])assert.throws(()=>parseBackupKey(invalid),{code:'BACKUP_KEY_INVALID'});
});
test('cifra e restaura conteúdo grande por stream, preservando os bytes e o checksum',async()=>temporary(async directory=>{
 const key=randomBytes(32),content=randomBytes(2*1024*1024+37),input=join(directory,'source.dump'),encrypted=join(directory,'backup.enc'),output=join(directory,'restored.dump');
 await writeFile(input,content);const manifest=await encryptBackupFile(input,encrypted,key);
 assert.equal(manifest.sizeBytes,content.length+36);assert.ok(!(await readFile(encrypted)).equals(content));
 const restored=await decryptBackupFile(encrypted,output,key,manifest.sha256);assert.equal(restored.sha256,(await hashBackupFile(input)).sha256);assert.deepEqual(await readFile(output),content);
}));
test('cifra de um arquivo vazio é autenticada e usa nonce distinto a cada execução',async()=>temporary(async directory=>{
 const input=join(directory,'empty'),key=randomBytes(32);await writeFile(input,Buffer.alloc(0));
 await encryptBackupFile(input,join(directory,'one.enc'),key);await encryptBackupFile(input,join(directory,'two.enc'),key);
 assert.notDeepEqual(await readFile(join(directory,'one.enc')),await readFile(join(directory,'two.enc')));
 await decryptBackupFile(join(directory,'one.enc'),join(directory,'plain'),key);assert.equal((await stat(join(directory,'plain'))).size,0);
}));
test('alteração de payload, nonce ou tag falha e não deixa saída parcial',async()=>temporary(async directory=>{
 const input=join(directory,'source'),key=randomBytes(32);await writeFile(input,randomBytes(4096));await encryptBackupFile(input,join(directory,'source.enc'),key);
 const original=await readFile(join(directory,'source.enc'));
 for(const [index,position] of [10,25,original.length-1].entries()){
  const damaged=Buffer.from(original);damaged[position]^=1;const encrypted=join(directory,`damaged${index}.enc`),output=join(directory,`damaged${index}.dump`);await writeFile(encrypted,damaged);
  await assert.rejects(decryptBackupFile(encrypted,output,key),{code:'BACKUP_INTEGRITY_FAILURE'});await assert.rejects(stat(output),{code:'ENOENT'});
 }
}));
test('chave errada, checksum incorreto e envelope truncado são rejeitados',async()=>temporary(async directory=>{
 const input=join(directory,'source'),encrypted=join(directory,'source.enc'),key=randomBytes(32);await writeFile(input,'DADOS FICTÍCIOS');await encryptBackupFile(input,encrypted,key);
 await assert.rejects(decryptBackupFile(encrypted,join(directory,'wrongkey'),randomBytes(32)),{code:'BACKUP_INTEGRITY_FAILURE'});
 await assert.rejects(decryptBackupFile(encrypted,join(directory,'wronghash'),key,'0'.repeat(64)),{code:'BACKUP_INTEGRITY_FAILURE'});
 const truncated=join(directory,'short.enc');await writeFile(truncated,(await readFile(encrypted)).subarray(0,15));await assert.rejects(decryptBackupFile(truncated,join(directory,'truncated'),key),{code:'BACKUP_INTEGRITY_FAILURE'});
}));
test('não sobrescreve arquivo existente nem usa a origem como destino',async()=>temporary(async directory=>{
 const input=join(directory,'source'),encrypted=join(directory,'source.enc'),existing=join(directory,'existing'),key=randomBytes(32);await writeFile(input,'ORIGEM');await writeFile(existing,'PRESERVAR');await encryptBackupFile(input,encrypted,key);
 await assert.rejects(encryptBackupFile(input,existing,key),{code:'EEXIST'});await assert.rejects(decryptBackupFile(encrypted,existing,key),{code:'EEXIST'});assert.equal(await readFile(existing,'utf8'),'PRESERVAR');
 await assert.rejects(encryptBackupFile(input,input,key),{code:'BACKUP_SAME_PATH'});assert.equal(await readFile(input,'utf8'),'ORIGEM');
}));
