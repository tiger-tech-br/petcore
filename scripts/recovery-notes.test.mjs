// Somente fixtures fictícias privadas; nunca lê .android-signing real.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,readdir,realpath,rm,symlink,access,link,unlink} from 'node:fs/promises';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRecoveryNotes,restoreRecoveryNotes} from './recovery-notes.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..'),PRIVATE=join(ROOT,'deploy/private');
async function fixture(run){
 const directory=await mkdtemp(join(PRIVATE,'recovery-notes-fixture-')),source=join(directory,'fake-android');await mkdir(source);
 const config={alias:'petcore',password:randomBytes(32).toString('hex'),state:'ready',createdAt:'2026-11-15T12:00:00.000Z'},pkcs12=randomBytes(12000),backupKey=randomBytes(32).toString('hex');
 await writeFile(join(source,'config.json'),JSON.stringify(config));await writeFile(join(source,'petcore-release.p12'),pkcs12);
 const backupEnv=join(directory,'fake-backup.env');await writeFile(backupEnv,`BACKUP_KEY_ID=fixture-key\nBACKUP_ENCRYPTION_KEY=${backupKey}\nDATABASE_URL=postgresql://unrelated:must-not-export@fake.example.test/fixture\n`);
 const output=join(directory,'import.json');
 const create=options=>createRecoveryNotes({output,androidSource:source,confirmSensitiveExport:true,...options});
 try{await run({directory,source,config,pkcs12,backupKey,backupEnv,output,create});}
 finally{const target=await realpath(directory),parent=await realpath(PRIVATE);assert.equal(dirname(target),parent);assert.ok(basename(target).startsWith('recovery-notes-fixture-'));await rm(target,{recursive:true,force:true});}
}
const missing=async path=>assert.rejects(access(path),{code:'ENOENT'});

test('cria notas pequenas compatíveis com JSON Bitwarden e reconstrói bytes/config/backup fictícios',async()=>fixture(async f=>{
 const result=await f.create({backupEnv:f.backupEnv});assert.equal(result.backupIncluded,true);assert.equal(result.externalCustodyVerified,false);assert.ok(result.androidParts>1);
 const json=JSON.parse(await readFile(f.output,'utf8'));assert.equal(json.encrypted,false);assert.equal(json.items.length,result.noteCount);
 assert.ok(json.items.every(item=>item.type===2&&item.secureNote.type===0&&item.organizationId===null&&item.notes.length<=5000));
 assert.ok(!(await readFile(f.output,'utf8')).includes('must-not-export'),'A conexão e outros segredos do env não entram no pacote.');
 const destination=join(f.directory,'restored'),restored=await restoreRecoveryNotes({input:f.output,outputDir:destination,confirmPrivateRestore:true});
 assert.equal(restored.backupIncluded,true);assert.equal(restored.externalCustodyVerified,false);assert.deepEqual(await readFile(join(destination,'petcore-release.p12')),f.pkcs12);
 assert.deepEqual(JSON.parse(await readFile(join(destination,'config.json'),'utf8')),f.config);assert.equal(await readFile(join(destination,'backup-key.env'),'utf8'),`BACKUP_KEY_ID=fixture-key\nBACKUP_ENCRYPTION_KEY=${f.backupKey}\n`);
}));

test('sem arquivo de backup explícito informa false e nunca cria arquivo enganoso de chave',async()=>fixture(async f=>{
 const result=await f.create();assert.equal(result.backupIncluded,false);
 const destination=join(f.directory,'android-only');const restored=await restoreRecoveryNotes({input:f.output,outputDir:destination,confirmPrivateRestore:true});assert.equal(restored.backupIncluded,false);await missing(join(destination,'backup-key.env'));
}));

test('conteúdo copiado somente das notas próprias em NDJSON restaura independente da ordem',async()=>fixture(async f=>{
 await f.create({backupEnv:f.backupEnv});const json=JSON.parse(await readFile(f.output,'utf8')),input=join(f.directory,'copied-notes.ndjson');
 await writeFile(input,json.items.reverse().map(item=>item.notes).join('\n')+'\n');
 const destination=join(f.directory,'from-copied-notes');await restoreRecoveryNotes({input,outputDir:destination,confirmPrivateRestore:true});assert.deepEqual(await readFile(join(destination,'petcore-release.p12')),f.pkcs12);
}));

test('notas incompletas, partes corrompidas ou senha alterada falham antes de criar a restauração',async()=>fixture(async f=>{
 await f.create({backupEnv:f.backupEnv});const original=JSON.parse(await readFile(f.output,'utf8'));
 for(const mode of ['missing-part','tamper-part','tamper-password','missing-backup']){
  const json=structuredClone(original),part=json.items.find(item=>JSON.parse(item.notes).kind==='android-part');
  if(mode==='missing-part')json.items=json.items.filter(item=>item!==part);
  if(mode==='tamper-part'){const note=JSON.parse(part.notes);note.base64=(note.base64.startsWith('A')?'B':'A')+note.base64.slice(1);part.notes=JSON.stringify(note);}
  if(mode==='tamper-password'){const item=json.items.find(item=>JSON.parse(item.notes).kind==='android-config'),note=JSON.parse(item.notes);note.config.password='ab'.repeat(32);item.notes=JSON.stringify(note);}
  if(mode==='missing-backup')json.items=json.items.filter(item=>JSON.parse(item.notes).kind!=='backup');
  const input=join(f.directory,mode+'.json'),destination=join(f.directory,mode);await writeFile(input,JSON.stringify(json));await assert.rejects(restoreRecoveryNotes({input,outputDir:destination,confirmPrivateRestore:true}));await missing(destination);
 }
}));

test('exige confirmação e limita todas as entradas/saídas ao escopo privado permitido',async()=>fixture(async f=>{
 await assert.rejects(createRecoveryNotes({output:f.output,androidSource:f.source}),{code:'RECOVERY_EXPLICIT_EXPORT_REQUIRED'});
 await assert.rejects(f.create({output:join(ROOT,'public-import.json')}),{code:'RECOVERY_PRIVATE_PATH_REQUIRED'});
 await assert.rejects(f.create({androidSource:ROOT}),{code:'RECOVERY_ANDROID_SOURCE_REFUSED'});
 await assert.rejects(f.create({backupEnv:join(ROOT,'.env')}),{code:'RECOVERY_PRIVATE_PATH_REQUIRED'});
 await f.create();await assert.rejects(restoreRecoveryNotes({input:f.output,outputDir:join(f.directory,'no-confirm')}),{code:'RECOVERY_EXPLICIT_RESTORE_REQUIRED'});
 await assert.rejects(restoreRecoveryNotes({input:f.output,outputDir:join(ROOT,'public-restore'),confirmPrivateRestore:true}),{code:'RECOVERY_PRIVATE_PATH_REQUIRED'});
}));

test('recusa sobrescrita e fontes/pastas de saída com symlink ou junction',async()=>fixture(async f=>{
 await f.create();const original=await readFile(f.output);await assert.rejects(f.create(),{code:'RECOVERY_OUTPUT_EXISTS'});assert.deepEqual(await readFile(f.output),original);
 const sourceLink=join(f.directory,'linked-source'),targetLink=join(f.directory,'linked-output');await symlink(f.source,sourceLink,process.platform==='win32'?'junction':'dir');await symlink(f.directory,targetLink,process.platform==='win32'?'junction':'dir');
 await assert.rejects(f.create({androidSource:sourceLink,output:join(f.directory,'other.json')}),{code:'RECOVERY_LINK_REFUSED'});
 await assert.rejects(f.create({output:join(targetLink,'other.json')}),{code:'RECOVERY_LINK_REFUSED'});
 const existing=join(f.directory,'existing');await mkdir(existing);await writeFile(join(existing,'keep.txt'),'KEEP');await assert.rejects(restoreRecoveryNotes({input:f.output,outputDir:existing,confirmPrivateRestore:true}),{code:'RECOVERY_OUTPUT_EXISTS'});assert.equal(await readFile(join(existing,'keep.txt'),'utf8'),'KEEP');
}));

test('recusa hardlinks para arquivos próprios fora do escopo privado em todas as entradas sensíveis',async()=>fixture(async f=>{
 await f.create({backupEnv:f.backupEnv});const importJson=await readFile(f.output,'utf8'),importNdjson=JSON.parse(importJson).items.map(item=>item.notes).join('\n');
 const external=await mkdtemp(join(ROOT,'.qa-recovery-hardlinks-'));
 try{
  for(const [file,content] of [['config.json',JSON.stringify(f.config)],['petcore-release.p12',f.pkcs12]]){
   const outside=join(external,file),inside=join(f.source,file),output=join(f.directory,'hardlink-'+file+'.json');await writeFile(outside,content);await unlink(inside);await link(outside,inside);
   try{await assert.rejects(f.create({output}),{code:'RECOVERY_HARDLINK_REFUSED'});await missing(output);}
   finally{await unlink(inside);await writeFile(inside,content);}
  }
  const outsideEnv=join(external,'backup.env'),insideEnv=join(f.directory,'linked-backup.env');await writeFile(outsideEnv,await readFile(f.backupEnv));await link(outsideEnv,insideEnv);
  const output=join(f.directory,'hardlink-env.json');await assert.rejects(f.create({output,backupEnv:insideEnv}),{code:'RECOVERY_HARDLINK_REFUSED'});await missing(output);
  for(const [extension,content] of [['json',importJson],['ndjson',importNdjson]]){
   const outside=join(external,'notes.'+extension),inside=join(f.directory,'linked-notes.'+extension),outputDir=join(f.directory,'hardlink-restore-'+extension);await writeFile(outside,content);await link(outside,inside);
   await assert.rejects(restoreRecoveryNotes({input:inside,outputDir,confirmPrivateRestore:true}),{code:'RECOVERY_HARDLINK_REFUSED'});await missing(outputDir);
  }
 }finally{
  const target=await realpath(external),root=await realpath(ROOT);assert.equal(dirname(target),root);assert.ok(basename(target).startsWith('.qa-recovery-hardlinks-'));await rm(target,{recursive:true,force:true});
 }
}));

test('recusa cofre inteiro, itens de outro tipo e metadados que ampliem o escopo',async()=>fixture(async f=>{
 await f.create();const original=JSON.parse(await readFile(f.output,'utf8'));
 for(const mode of ['too-many','foreign','mixed-set','unknown']){
  const json=structuredClone(original);
  if(mode==='too-many')json.items=Array.from({length:33},()=>json.items[0]);
  if(mode==='foreign')json.items.push({type:1,name:'Unrelated vault login',notes:'private'});
  if(mode==='mixed-set'){const note=JSON.parse(json.items[0].notes);note.setId='00000000-0000-4000-8000-000000000000';json.items[0].notes=JSON.stringify(note);}
  if(mode==='unknown'){const note=JSON.parse(json.items[0].notes);note.kind='unsupported';json.items[0].notes=JSON.stringify(note);}
  const input=join(f.directory,mode+'.json'),outputDir=join(f.directory,mode);await writeFile(input,JSON.stringify(json));await assert.rejects(restoreRecoveryNotes({input,outputDir,confirmPrivateRestore:true}));await missing(outputDir);
 }
}));

test('arquivo excessivo e JSON inválido são recusados sem exportar conteúdo ou erro sensível',async()=>fixture(async f=>{
 await writeFile(join(f.source,'petcore-release.p12'),Buffer.alloc(65537));await assert.rejects(f.create(),{code:'RECOVERY_INPUT_SIZE_INVALID'});await missing(f.output);
 await writeFile(join(f.source,'petcore-release.p12'),f.pkcs12);await writeFile(join(f.source,'config.json'),'{"password":"fixture-private-invalid-json"');
 await assert.rejects(f.create(),error=>{assert.equal(error.code,'RECOVERY_ANDROID_CONFIG_INVALID');assert.ok(!String(error).includes('fixture-private-invalid-json'));return true;});await missing(f.output);
}));

test('CLI imprime apenas contagens/flags e nunca senha, chave ou bytes Base64',async()=>fixture(async f=>{
 const result=spawnSync(process.execPath,[join(ROOT,'scripts/recovery-notes.mjs'),'create','--android-source',f.source,'--backup-env',f.backupEnv,'--output',f.output,'--confirm-sensitive-export'],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0);const summary=JSON.parse(result.stdout);assert.equal(summary.backupIncluded,true);assert.equal(summary.externalCustodyVerified,false);
 for(const secret of [f.config.password,f.backupKey,f.pkcs12.toString('base64').slice(0,128),'must-not-export'])assert.ok(!result.stdout.includes(secret)&&!result.stderr.includes(secret));
 const failure=spawnSync(process.execPath,[join(ROOT,'scripts/recovery-notes.mjs'),'create','--android-source',f.source,'--output',f.output,'--confirm-sensitive-export'],{encoding:'utf8',windowsHide:true});assert.equal(failure.status,1);assert.equal(failure.stdout,'');assert.deepEqual(JSON.parse(failure.stderr),{ok:false,code:'RECOVERY_OUTPUT_EXISTS'});
}));
