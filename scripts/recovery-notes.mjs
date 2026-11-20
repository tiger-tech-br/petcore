// Exportação local explícita. Não usa rede, cofre, .env raiz ou geração de chaves.
import {readFile,lstat,realpath,open,mkdir,unlink,rmdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,relative,isAbsolute,dirname,join,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse} from 'dotenv';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),PRIVATE=join(ROOT,'deploy/private'),SIGNING=join(ROOT,'.android-signing');
const FORMAT='petcore.recovery-note.v1',MAX_BYTES=65536,PART_LENGTH=3500,MAX_NOTES=32,NOTE_LENGTH=5000;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,hex=/^[a-fA-F0-9]{64}$/;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const ensure=(condition,code)=>{if(!condition)fail(code);};
const hash=value=>createHash('sha256').update(value).digest('hex');
function json(value,code){try{return JSON.parse(value);}catch{fail(code);}}
const within=(parent,path)=>{const part=relative(parent,path);return part!==''&&part!=='..'&&!part.startsWith('..'+sep)&&!isAbsolute(part);};
function privatePath(value){const path=resolve(ROOT,value);ensure(within(PRIVATE,path),'RECOVERY_PRIVATE_PATH_REQUIRED');return path;}
async function noLinks(path){
 ensure(path===ROOT||within(ROOT,path),'RECOVERY_PATH_OUTSIDE_PROJECT');
 let current=ROOT;ensure(!(await lstat(current)).isSymbolicLink(),'RECOVERY_LINK_REFUSED');
 for(const part of relative(ROOT,path).split(sep).filter(Boolean)){current=join(current,part);ensure(!(await lstat(current)).isSymbolicLink(),'RECOVERY_LINK_REFUSED');}
 const target=await realpath(path),root=await realpath(ROOT);ensure(target===root||within(root,target),'RECOVERY_LINK_REFUSED');
}
async function inputFile(path,limit){
 await noLinks(path);const info=await lstat(path);ensure(info.isFile()&&info.size>0&&info.size<=limit,'RECOVERY_INPUT_SIZE_INVALID');ensure(info.nlink===1,'RECOVERY_HARDLINK_REFUSED');return readFile(path);
}
async function outputFile(path,content){
 await noLinks(dirname(path));let handle,created=false;
 try{handle=await open(path,'wx',0o600);created=true;await handle.writeFile(content);await handle.sync();}
 catch(error){if(handle){await handle.close();handle=null;}if(created)await unlink(path).catch(()=>{});if(error?.code==='EEXIST')fail('RECOVERY_OUTPUT_EXISTS');throw error;}
 finally{await handle?.close();}
}
function androidConfig(value){
 ensure(value&&value.alias==='petcore'&&value.state==='ready'&&typeof value.password==='string'&&/^[a-f0-9]{64}$/.test(value.password),'RECOVERY_ANDROID_CONFIG_INVALID');
 ensure(Object.keys(value).every(key=>['alias','password','state','createdAt'].includes(key)),'RECOVERY_ANDROID_CONFIG_UNREVIEWED');
 if(value.createdAt!==undefined)ensure(typeof value.createdAt==='string'&&value.createdAt.length<=50&&Number.isFinite(Date.parse(value.createdAt)),'RECOVERY_ANDROID_CONFIG_INVALID');
 return {alias:value.alias,password:value.password,state:'ready',...(value.createdAt?{createdAt:value.createdAt}:{})};
}
function payload(value){ensure(value&&value.format===FORMAT&&uuid.test(value.setId),'RECOVERY_NOTE_FORMAT_INVALID');return value;}

export async function createRecoveryNotes({output,androidSource='.android-signing',backupEnv,confirmSensitiveExport=false}={}){
 ensure(confirmSensitiveExport===true,'RECOVERY_EXPLICIT_EXPORT_REQUIRED');ensure(typeof output==='string','RECOVERY_OUTPUT_REQUIRED');
 const destination=privatePath(output),source=resolve(ROOT,androidSource);
 ensure(destination.endsWith('.json'),'RECOVERY_JSON_OUTPUT_REQUIRED');ensure(source===SIGNING||within(PRIVATE,source),'RECOVERY_ANDROID_SOURCE_REFUSED');
 await noLinks(source);await noLinks(dirname(destination));
 const config=androidConfig(json((await inputFile(join(source,'config.json'),4096)).toString('utf8'),'RECOVERY_ANDROID_CONFIG_INVALID'));
 const pkcs12=await inputFile(join(source,'petcore-release.p12'),MAX_BYTES),setId=randomUUID(),base64=pkcs12.toString('base64');
 const parts=Array.from({length:Math.ceil(base64.length/PART_LENGTH)},(_,index)=>base64.slice(index*PART_LENGTH,(index+1)*PART_LENGTH));
 let backup=null;
 if(backupEnv!==undefined){
  ensure(typeof backupEnv==='string','RECOVERY_BACKUP_FILE_REQUIRED');const env=parse(await inputFile(privatePath(backupEnv),65536));
  ensure(typeof env.BACKUP_KEY_ID==='string'&&/^[a-zA-Z0-9._-]{1,80}$/.test(env.BACKUP_KEY_ID),'RECOVERY_BACKUP_KEY_ID_REQUIRED');
  ensure(typeof env.BACKUP_ENCRYPTION_KEY==='string'&&hex.test(env.BACKUP_ENCRYPTION_KEY),'RECOVERY_BACKUP_KEY_INVALID');
  backup={keyId:env.BACKUP_KEY_ID,keyHex:env.BACKUP_ENCRYPTION_KEY};
 }
 const common={format:FORMAT,setId};
 const manifest={...common,kind:'manifest',createdAt:new Date().toISOString(),androidBytes:pkcs12.length,androidSha256:hash(pkcs12),androidParts:parts.length,configSha256:hash(JSON.stringify(config)),backupIncluded:backup!==null,...(backup?{backupSha256:hash(JSON.stringify(backup))}:{})};
 const notes=[manifest,{...common,kind:'android-config',config},...parts.map((base64,index)=>({...common,kind:'android-part',index:index+1,total:parts.length,base64})),...(backup?[{...common,kind:'backup',backup}]:[])];
 ensure(notes.length<=MAX_NOTES,'RECOVERY_TOO_MANY_NOTES');
 const items=notes.map(note=>{
  const text=JSON.stringify(note);ensure(text.length<=NOTE_LENGTH,'RECOVERY_NOTE_TOO_LARGE');
  return {id:randomUUID(),organizationId:null,folderId:null,type:2,name:`PetCore ${setId} ${note.kind}${note.index?' '+note.index+'/'+note.total:''}`,notes:text,secureNote:{type:0},favorite:false};
 });
 await outputFile(destination,JSON.stringify({encrypted:false,folders:[],items},null,2)+'\n');
 return {ok:true,event:'recovery_notes_prepared',setId,noteCount:items.length,androidParts:parts.length,backupIncluded:backup!==null,externalCustodyVerified:false};
}

function decodedNotes(text,path){
 let notes;
 if(path.endsWith('.ndjson'))notes=text.split(/\r?\n/).filter(line=>line.trim()).map(line=>json(line,'RECOVERY_NOTE_FORMAT_INVALID'));
 else{
  const input=json(text,'RECOVERY_IMPORT_SCOPE_INVALID');ensure(input.encrypted===false&&Array.isArray(input.items)&&input.items.length<=MAX_NOTES,'RECOVERY_IMPORT_SCOPE_INVALID');
  notes=input.items.map(item=>{ensure(item.type===2&&item.organizationId==null&&typeof item.notes==='string'&&item.notes.length<=NOTE_LENGTH,'RECOVERY_IMPORT_SCOPE_INVALID');return json(item.notes,'RECOVERY_NOTE_FORMAT_INVALID');});
 }
 ensure(notes.length>=3&&notes.length<=MAX_NOTES&&notes.every(note=>JSON.stringify(note).length<=NOTE_LENGTH),'RECOVERY_IMPORT_SCOPE_INVALID');
 return notes.map(payload);
}
export async function restoreRecoveryNotes({input,outputDir,confirmPrivateRestore=false}={}){
 ensure(confirmPrivateRestore===true,'RECOVERY_EXPLICIT_RESTORE_REQUIRED');ensure(typeof input==='string'&&typeof outputDir==='string','RECOVERY_RESTORE_ARGUMENT_REQUIRED');
 const source=privatePath(input),destination=privatePath(outputDir);ensure(/\.(json|ndjson)$/.test(source),'RECOVERY_IMPORT_FILE_INVALID');
 await noLinks(dirname(destination));const notes=decodedNotes((await inputFile(source,1024*1024)).toString('utf8'),source);
 const ids=new Set(notes.map(note=>note.setId));ensure(ids.size===1,'RECOVERY_MIXED_SETS_REFUSED');
 ensure(notes.every(note=>['manifest','android-config','android-part','backup'].includes(note.kind)),'RECOVERY_NOTE_KIND_INVALID');
 const manifests=notes.filter(note=>note.kind==='manifest'),configs=notes.filter(note=>note.kind==='android-config'),backups=notes.filter(note=>note.kind==='backup');
 ensure(manifests.length===1&&configs.length===1,'RECOVERY_REQUIRED_NOTE_MISSING');const manifest=manifests[0],config=androidConfig(configs[0].config);
 ensure(Number.isSafeInteger(manifest.androidBytes)&&manifest.androidBytes>0&&manifest.androidBytes<=MAX_BYTES&&Number.isSafeInteger(manifest.androidParts)&&manifest.androidParts>=1&&manifest.androidParts<=Math.ceil(Math.ceil(MAX_BYTES/3)*4/PART_LENGTH),'RECOVERY_MANIFEST_INVALID');
 ensure(typeof manifest.backupIncluded==='boolean'&&hex.test(manifest.androidSha256||'')&&hex.test(manifest.configSha256||''),'RECOVERY_MANIFEST_INVALID');
 const parts=notes.filter(note=>note.kind==='android-part').sort((a,b)=>a.index-b.index);
 ensure(parts.length===manifest.androidParts&&parts.every((part,index)=>part.index===index+1&&part.total===parts.length&&typeof part.base64==='string'&&part.base64.length>0&&part.base64.length<=PART_LENGTH),'RECOVERY_PARTS_INCOMPLETE');
 const encoded=parts.map(part=>part.base64).join('');ensure(/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)&&encoded.length%4===0,'RECOVERY_BASE64_INVALID');
 const pkcs12=Buffer.from(encoded,'base64');ensure(pkcs12.toString('base64')===encoded&&pkcs12.length===manifest.androidBytes&&hash(pkcs12)===manifest.androidSha256&&hash(JSON.stringify(config))===manifest.configSha256,'RECOVERY_CHECKSUM_FAILED');
 let backup=null;
 if(manifest.backupIncluded){
  ensure(backups.length===1,'RECOVERY_BACKUP_NOTE_MISSING');backup=backups[0].backup;
  ensure(backup&&typeof backup.keyId==='string'&&/^[a-zA-Z0-9._-]{1,80}$/.test(backup.keyId)&&typeof backup.keyHex==='string'&&hex.test(backup.keyHex)&&hash(JSON.stringify({keyId:backup.keyId,keyHex:backup.keyHex}))===manifest.backupSha256,'RECOVERY_BACKUP_CHECKSUM_FAILED');
 }else ensure(backups.length===0,'RECOVERY_BACKUP_FLAG_MISMATCH');
 const created=[];let made=false;
 try{
  try{await mkdir(destination,{mode:0o700});made=true;}catch(error){if(error?.code==='EEXIST')fail('RECOVERY_OUTPUT_EXISTS');throw error;}
  for(const [name,content] of [['config.json',JSON.stringify(config,null,2)+'\n'],['petcore-release.p12',pkcs12],...(backup?[['backup-key.env',`BACKUP_KEY_ID=${backup.keyId}\nBACKUP_ENCRYPTION_KEY=${backup.keyHex}\n`]]:[])]){
   const path=join(destination,name);await outputFile(path,content);created.push(path);
  }
 }catch(error){for(const path of created.reverse())await unlink(path).catch(()=>{});if(made)await rmdir(destination).catch(()=>{});throw error;}
 return {ok:true,event:'recovery_notes_restored',setId:manifest.setId,androidRestored:true,backupIncluded:backup!==null,externalCustodyVerified:false};
}

async function main(){
 const args=process.argv.slice(2),command=args.shift();
 if(!command||command==='--help'){console.log('create --output deploy/private/IMPORT.json --confirm-sensitive-export [--backup-env deploy/private/CHAVES.env] [--android-source deploy/private/FIXTURE]\nrestore --input deploy/private/NOTAS.json|.ndjson --output-dir deploy/private/PASTA_NOVA --confirm-private-restore');return;}
 const options={},flags=new Set(['--confirm-sensitive-export','--confirm-private-restore']);
 const allowed=command==='create'?new Set(['--output','--android-source','--backup-env','--confirm-sensitive-export']):command==='restore'?new Set(['--input','--output-dir','--confirm-private-restore']):new Set();
 ensure(allowed.size>0,'RECOVERY_COMMAND_INVALID');
 while(args.length){const key=args.shift();ensure(allowed.has(key)&&!Object.hasOwn(options,key),'RECOVERY_ARGUMENT_INVALID');const value=flags.has(key)?true:args.shift();ensure(value&&!(typeof value==='string'&&value.startsWith('--')),'RECOVERY_ARGUMENT_VALUE_REQUIRED');options[key]=value;}
 const result=command==='create'?await createRecoveryNotes({output:options['--output'],androidSource:options['--android-source'],backupEnv:options['--backup-env'],confirmSensitiveExport:options['--confirm-sensitive-export']===true}):await restoreRecoveryNotes({input:options['--input'],outputDir:options['--output-dir'],confirmPrivateRestore:options['--confirm-private-restore']===true});
 console.log(JSON.stringify(result));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^RECOVERY_[A-Z_]+$/.test(error?.code||'')?error.code:'RECOVERY_OPERATION_FAILED'}));process.exitCode=1;});
