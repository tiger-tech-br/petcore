import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {open,stat,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const MAGIC=Buffer.from('PCTBKP1\n','ascii'),IV_BYTES=12,TAG_BYTES=16,HEADER_BYTES=MAGIC.length+IV_BYTES;
export class BackupIntegrityError extends Error{code='BACKUP_INTEGRITY_FAILURE';constructor(){super('O arquivo de backup não passou na verificação de integridade.');}}
export function parseBackupKey(value:string|undefined):Buffer{
 if(!value||!/^[a-fA-F0-9]{64}$/.test(value))throw Object.assign(new Error('Configure BACKUP_ENCRYPTION_KEY com 64 caracteres hexadecimais aleatórios.'),{code:'BACKUP_KEY_INVALID'});
 return Buffer.from(value,'hex');
}
function checkKey(key:Buffer){if(!Buffer.isBuffer(key)||key.length!==32)throw Object.assign(new Error('Chave de backup inválida.'),{code:'BACKUP_KEY_INVALID'});}
function distinctPaths(input:string,output:string){if(resolve(input)===resolve(output))throw Object.assign(new Error('Origem e destino devem ser diferentes.'),{code:'BACKUP_SAME_PATH'});}
export async function hashBackupFile(path:string):Promise<{sha256:string;sizeBytes:number}>{
 const hash=createHash('sha256');let sizeBytes=0;
 for await(const chunk of createReadStream(path)){hash.update(chunk);sizeBytes+=chunk.length;}
 return{sha256:hash.digest('hex'),sizeBytes};
}
async function readExactly(handle:Awaited<ReturnType<typeof open>>,length:number,position:number){
 const buffer=Buffer.alloc(length);let offset=0;
 while(offset<length){const result=await handle.read(buffer,offset,length-offset,position+offset);if(!result.bytesRead)throw new BackupIntegrityError();offset+=result.bytesRead;}
 return buffer;
}

// Envelope: magic/version(8), nonce(12), ciphertext(N), GCM tag(16).
// O cabeçalho também é autenticado como AAD e cada arquivo recebe nonce novo.
export async function encryptBackupFile(input:string,output:string,key:Buffer){
 checkKey(key);distinctPaths(input,output);
 let created=false;
 try{
  const info=await stat(input);if(!info.isFile())throw Object.assign(new Error('A origem deve ser um arquivo regular.'),{code:'BACKUP_INPUT_INVALID'});
  const iv=randomBytes(IV_BYTES),header=Buffer.concat([MAGIC,iv]);
  const cipher=createCipheriv('aes-256-gcm',key,iv,{authTagLength:TAG_BYTES});cipher.setAAD(header);
  const stream=createWriteStream(output,{flags:'wx',mode:0o600});stream.once('open',()=>{created=true;});stream.write(header);
  await pipeline(createReadStream(input),cipher,stream);
  const target=await open(output,'a');try{await target.write(cipher.getAuthTag());await target.sync();}finally{await target.close();}
  return await hashBackupFile(output);
 }catch(error){if(created)await unlink(output).catch(()=>{});throw error;}
}

// Nenhum arquivo restaurável é entregue até a autenticação GCM concluir.
// Uma saída parcial criada por esta chamada é removida em qualquer falha.
export async function decryptBackupFile(input:string,output:string,key:Buffer,expectedSha256?:string){
 checkKey(key);distinctPaths(input,output);
 if(expectedSha256!==undefined){
  if(!/^[a-fA-F0-9]{64}$/.test(expectedSha256))throw new BackupIntegrityError();
  const actual=await hashBackupFile(input);
  if(!timingSafeEqual(Buffer.from(actual.sha256,'hex'),Buffer.from(expectedSha256,'hex')))throw new BackupIntegrityError();
 }
 const source=await open(input,'r');let sourceClosed=false,created=false;
 try{
  const info=await source.stat();if(!info.isFile()||info.size<HEADER_BYTES+TAG_BYTES)throw new BackupIntegrityError();
  const header=await readExactly(source,HEADER_BYTES,0);
  if(!timingSafeEqual(header.subarray(0,MAGIC.length),MAGIC))throw new BackupIntegrityError();
  const tag=await readExactly(source,TAG_BYTES,info.size-TAG_BYTES);
  const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(MAGIC.length),{authTagLength:TAG_BYTES});decipher.setAAD(header);decipher.setAuthTag(tag);
  const bodySize=info.size-HEADER_BYTES-TAG_BYTES;
  await source.close();sourceClosed=true;
  const encrypted=bodySize?createReadStream(input,{start:HEADER_BYTES,end:info.size-TAG_BYTES-1}):Readable.from([]);
  const stream=createWriteStream(output,{flags:'wx',mode:0o600});stream.once('open',()=>{created=true;});
  try{await pipeline(encrypted,decipher,stream);}catch(error){if((error as {code?:string}).code==='EEXIST')throw error;throw new BackupIntegrityError();}
  return await hashBackupFile(output);
 }catch(error){if(created)await unlink(output).catch(()=>{});throw error;}
 finally{if(!sourceClosed)await source.close();}
}
