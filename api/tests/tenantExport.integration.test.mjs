// Exclusive *_test database, own UUID fixtures, S3 mocked. No live email/storage.
import {after,before,describe,mock,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs';
import {mkdtemp,readFile,readdir,rm,mkdir,writeFile} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {Readable} from 'node:stream';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Pool} from 'pg';
import sharp from 'sharp';

const testUrl=process.env.TEST_DATABASE_URL;
assert.ok(testUrl&&decodeURIComponent(new URL(testUrl).pathname).endsWith('_test'),'Use TEST_DATABASE_URL exclusivo terminado em _test.');
const address=new URL(testUrl),secure=process.env.DATABASE_SSL==='true'||Boolean(address.searchParams.get('sslmode')&&address.searchParams.get('sslmode')!=='disable');
process.env.DATABASE_URL=testUrl;process.env.DATABASE_DIRECT_URL=testUrl;process.env.NODE_ENV='test';
const {exportTenant,parseExportArguments,assertTenantExportSchema}=await import('../scripts/export-tenant.mjs');
const db=new Pool({connectionString:testUrl,max:3,ssl:secure?{rejectUnauthorized:true}:undefined});
const ids=Object.fromEntries(['a','b','operator','admin','other','tutorA','tutorB','petA','petB','ticketA','ticketB','messageA','invitation','operation','event'].map(key=>[key,randomUUID()]));
const suffix=randomUUID().slice(0,8),photoKeyA=`tenants/${ids.a}/pets/${ids.petA}/${randomUUID()}.webp`,photoKeyB=`tenants/${ids.b}/pets/${ids.petB}/${randomUUID()}.webp`;
let directory,photo,storageMode='ok';const seen=[];
const storage={bucket:'fixture-photos',client:{async send(command){
 assert.equal(command.constructor.name,'GetObjectCommand');assert.equal(command.input.Bucket,'fixture-photos');assert.equal(command.input.Key,photoKeyA);seen.push(command.input.Key);
 if(storageMode==='failed')throw Error('Private provider details must never become an archive');
 if(storageMode==='revoke')await db.query('UPDATE users SET is_platform_owner=false WHERE id=$1',[ids.operator]);
 return {ContentLength:photo.length,Body:Readable.from([photo])};
},destroy(){}}};
const args=(name='result',overrides={})=>{
 const options={tenant:ids.a,operator:ids.operator,reference:'support:'+ids.ticketA,'identity-verified':'YES','confirm-export':'YES',output:join(directory,name+'.tar.gz'),...overrides};
 return Object.entries(options).flatMap(([key,value])=>['--'+key,value]);
};
const execute=(name,overrides)=>exportTenant(args(name,overrides),{storage});
const noPartial=async()=>assert.equal((await readdir(directory)).some(name=>name.endsWith('.partial')),false);
const run=promisify(execFile);
function interceptExportDb(afterQuery){
 return {async connect(){
  const client=await db.connect();
  return new Proxy(client,{get(target,key){
   if(key==='query')return async(...values)=>{const result=await target.query(...values);await afterQuery({client:target,sql:values[0],result});return result;};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
 }};
}

describe('Exportação assistida: empresa inteira, fotos e entrega privada',{concurrency:false},()=>{
 before(async()=>{
  directory=await mkdtemp(join(tmpdir(),'petcore-export-test-'));
  photo=await sharp({create:{width:4,height:4,channels:3,background:'#16a0a4'}}).webp().toBuffer();
  for(const [id,name] of [[ids.a,'Empresa A '+suffix],[ids.b,'OTHER-COMPANY-SECRET '+suffix]])await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[id,name]);
  for(const [key,platform] of [['operator',true],['admin',false],['other',false]])await db.query('INSERT INTO users(id,name,email,password_hash,is_platform_owner) VALUES($1,$2,$3,$4,$5)',[ids[key],'Pessoa '+key,key+'-'+suffix+'@example.test','PRIVATE_BANNED_PASSWORD_HASH',platform]);
  await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin'),($3,$4,'admin')",[ids.a,ids.admin,ids.b,ids.other]);
  for(const [company,tutor,pet,name,key] of [[ids.a,ids.tutorA,ids.petA,'Luna exportável',photoKeyA],[ids.b,ids.tutorB,ids.petB,'OTHER-COMPANY-SECRET',photoKeyB]]){
   await db.query('INSERT INTO tutors(id,tenant_id,name,email) VALUES($1,$2,$3,$4)',[tutor,company,name,'tutor-'+tutor+'@example.test']);
   await db.query("INSERT INTO pets(id,tenant_id,tutor_id,name,species,size,photo_key) VALUES($1,$2,$3,$4,'Cão','pequeno',$5)",[pet,company,tutor,name,key]);
   await db.query("INSERT INTO tenant_subscriptions(tenant_id,status) VALUES($1,'trial')",[company]);
  }
  await db.query("INSERT INTO support_tickets(id,tenant_id,created_by,subject,category) VALUES($1,$2,$3,'Exportação fictícia','privacy'),($4,$5,$6,'Pedido de outra empresa','privacy')",[ids.ticketA,ids.a,ids.admin,ids.ticketB,ids.b,ids.other]);
  await db.query('INSERT INTO support_messages(id,tenant_id,ticket_id,actor_user_id,body) VALUES($1,$2,$3,$4,$5)',[ids.messageA,ids.a,ids.ticketA,ids.admin,'Pedido fictício de entrega dos registros da empresa.']);
  await db.query("INSERT INTO invitations(id,tenant_id,email,role,token_hash,expires_at,created_by) VALUES($1,$2,'invite@example.test','employee',$3,now()+interval '1 day',$4)",[ids.invitation,ids.a,'PRIVATE_BANNED_INVITATION_TOKEN',ids.admin]);
  await db.query("INSERT INTO business_operations(tenant_id,idempotency_key,kind,payload_hash,response,created_by) VALUES($1,$2,'fixture','PRIVATE_BANNED_REPLAY_HASH',$3::jsonb,$4)",[ids.a,ids.operation,JSON.stringify({secret:'PRIVATE_BANNED_REPLAY_PAYLOAD'}),ids.admin]);
  await db.query("INSERT INTO audit_events(id,tenant_id,actor_user_id,action,metadata) VALUES($1,$2,$3,'fixture',$4::jsonb)",[ids.event,ids.a,ids.admin,JSON.stringify({token:'PRIVATE_BANNED_AUDIT_METADATA'})]);
  await db.query("INSERT INTO support_email_notifications(tenant_id,ticket_id,message_id,event_kind,recipient_kind,recipient_email,payload_json) VALUES($1,$2,$3,'customer_message','operator','operator@example.test',$4::jsonb)",[ids.a,ids.ticketA,ids.messageA,JSON.stringify({text:'PRIVATE_BANNED_PROVIDER_PAYLOAD'})]);
 });
 after(async()=>{
  try{
   await db.query('DELETE FROM support_email_notifications WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM business_operations WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM audit_events WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM invitations WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM support_messages WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM support_tickets WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM tenant_subscriptions WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM pets WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);await db.query('DELETE FROM tutors WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM memberships WHERE tenant_id=ANY($1::uuid[])',[[ids.a,ids.b]]);await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])',[[ids.a,ids.b]]);
   await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[ids.operator,ids.admin,ids.other]]);
  }finally{
   await db.end();if(directory){const target=resolve(directory);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('petcore-export-test-'));await rm(target,{recursive:true,force:true});}
  }
 });

 test('exige UUIDs, confirmação explícita, referência e arquivo absoluto novo',async()=>{
  assert.throws(()=>parseExportArguments(args('missing',{'identity-verified':'NO'})),{code:'TENANT_EXPORT_CONFIRMATION_REQUIRED'});
  assert.throws(()=>parseExportArguments(args('bad',{tenant:'not-a-company'})),{code:'TENANT_EXPORT_ID_REQUIRED'});
  assert.throws(()=>parseExportArguments(args('bad',{reference:'someone@example.test'})),{code:'TENANT_EXPORT_REFERENCE_REQUIRED'});
  assert.throws(()=>parseExportArguments(args('bad',{output:'relative.tar.gz'})),{code:'TENANT_EXPORT_NEW_ABSOLUTE_ARCHIVE_REQUIRED'});
  const occupied=join(directory,'occupied.tar.gz');await writeFile(occupied,'keep this');await assert.rejects(execute('occupied'),{code:'TENANT_EXPORT_OUTPUT_EXISTS'});assert.equal(await readFile(occupied,'utf8'),'keep this');
 });

 test('exporta registros próprios e bytes das fotos sem senhas, tokens, payloads ou outra empresa',async()=>{
  seen.length=0;const result=await execute('complete');assert.equal(result.completeOperationalData,true);assert.equal(result.photos,1);assert.equal(result.automaticDelivery,false);assert.deepEqual(seen,[photoKeyA]);
  const extracted=join(directory,'extracted');await mkdir(extracted);await run('tar',['-xzf',result.archivePath,'-C',extracted]);
  const bundle=join(extracted,'bundle'),manifest=JSON.parse(await readFile(join(bundle,'manifest.json'),'utf8'));
  assert.equal(manifest.tenantId,ids.a);assert.equal(manifest.delivery.archiveEncrypted,false);assert.equal(manifest.photos.length,1);assert.ok(manifest.datasets.length>=38);
  let all='';for(const file of manifest.files){const bytes=await readFile(join(bundle,file.path));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);if(file.path.endsWith('.ndjson'))all+=bytes.toString('utf8');}
  assert.match(all,/Luna exportável/);assert.match(all,/Pedido fictício de entrega/);assert.doesNotMatch(all,/OTHER-COMPANY-SECRET|PRIVATE_BANNED|password_hash|token_hash|idempotency_key|photo_key/);
  assert.deepEqual(await readFile(join(bundle,`photos/${ids.petA}.webp`)),photo);
  const audit=await db.query("SELECT metadata FROM audit_events WHERE tenant_id=$1 AND action='tenant.export_assisted' ORDER BY created_at DESC LIMIT 1",[ids.a]);assert.equal(audit.rowCount,1);assert.equal(audit.rows[0].metadata.archiveSha256,result.sha256);assert.equal(audit.rows[0].metadata.referenceHash,createHash('sha256').update('support:'+ids.ticketA).digest('hex'));
  await noPartial();
 });

 test('recusa operador comum e referência de chamado de outra empresa',async()=>{
  await assert.rejects(execute('staff',{operator:ids.admin}),{code:'TENANT_EXPORT_PLATFORM_OPERATOR_REQUIRED'});
  await assert.rejects(execute('other-ticket',{reference:'Support:'+ids.ticketB.toUpperCase()}),{code:'TENANT_EXPORT_REFERENCE_COMPANY_MISMATCH'});
  await noPartial();
 });

 test('não declara completa uma estrutura nova ainda não revisada',async()=>{
  await assert.rejects(assertTenantExportSchema({query:async()=>({rows:[{table_name:'new_unreviewed_collection'}]})}),{code:'TENANT_EXPORT_SCHEMA_REVIEW_REQUIRED'});
  await assert.rejects(assertTenantExportSchema({query:async sql=>({rows:sql.includes("c.column_name='tenant_id'")?[{table_name:'pets'}]:[{table_name:'pets',column_name:'new_unreviewed_field'}]})}),{code:'TENANT_EXPORT_SCHEMA_REVIEW_REQUIRED'});
 });

 test('chave de foto cruzada ou falha no armazenamento não deixa entrega parcial',async()=>{
  await db.query('UPDATE pets SET photo_key=$2 WHERE id=$1',[ids.petA,photoKeyB]);
  try{await assert.rejects(execute('wrong-photo'),{code:'PHOTO_BACKUP_SOURCE_KEY_INVALID'});}finally{await db.query('UPDATE pets SET photo_key=$2 WHERE id=$1',[ids.petA,photoKeyA]);}
  storageMode='failed';try{await assert.rejects(execute('provider-failed'));}finally{storageMode='ok';}
  const names=await readdir(directory);assert.ok(!names.includes('wrong-photo.tar.gz'));assert.ok(!names.includes('provider-failed.tar.gz'));await noPartial();
 });

 test('aguarda a exclusão de fotos em vez de exportar snapshot inconsistente',async()=>{
  const lock=await db.connect();await lock.query('SELECT pg_advisory_lock($1)',[719381011]);
  try{await assert.rejects(execute('locked'),{code:'TENANT_EXPORT_PHOTO_CLEANUP_BUSY'});}finally{await lock.query('SELECT pg_advisory_unlock($1)',[719381011]);lock.release();}
  await noPartial();
 });

 test('revogação do operador durante a cópia impede a entrega final',async()=>{
  storageMode='revoke';try{await assert.rejects(execute('revoked'),{code:'TENANT_EXPORT_OPERATOR_ACCESS_CHANGED'});}finally{storageMode='ok';await db.query('UPDATE users SET is_platform_owner=true WHERE id=$1',[ids.operator]);}
  assert.ok(!(await readdir(directory)).includes('revoked.tar.gz'));await noPartial();
 });

 test('valida o destino direto e recusa pooler antes de abrir a conexão de exportação',async()=>{
  const original={DATABASE_URL:process.env.DATABASE_URL,DATABASE_DIRECT_URL:process.env.DATABASE_DIRECT_URL,TEST_DATABASE_URL:process.env.TEST_DATABASE_URL};
  try{
   const other=new URL(testUrl);other.pathname+='_other_test';process.env.DATABASE_DIRECT_URL=other.href;
   await assert.rejects(execute('wrong-direct-target'),{code:'DATABASE_LOCK_TARGET_MISMATCH'});
   const pooled=new URL(testUrl);pooled.hostname='fixture-pooler.invalid';
   process.env.DATABASE_URL=pooled.href;process.env.DATABASE_DIRECT_URL=pooled.href;process.env.TEST_DATABASE_URL=pooled.href;
   await assert.rejects(execute('pooled-connection'),{code:'DATABASE_LOCK_DIRECT_CONNECTION_REQUIRED'});
  }finally{Object.assign(process.env,original);}
  assert.ok(!(await readdir(directory)).includes('wrong-direct-target.tar.gz'));assert.ok(!(await readdir(directory)).includes('pooled-connection.tar.gz'));await noPartial();
 });

 test('cancelamento entre blocos do hash impede publicação e descarta o arquivo parcial',async()=>{
  const controller=new AbortController(),originalReadStream=fs.createReadStream;let chunks=0;
  const intercepted=mock.method(fs,'createReadStream',(path,options)=>{
   const source=originalReadStream(path,{...options,highWaterMark:32});
   if(!String(path).endsWith('.partial'))return source;
   return Readable.from((async function*(){for await(const chunk of source){chunks++;if(chunks===2)controller.abort();yield chunk;}})());
  });
  syncBuiltinESMExports();
  try{await assert.rejects(exportTenant(args('cancelled-hash'),{storage,signal:controller.signal}),{code:'TENANT_EXPORT_ABORTED'});}
  finally{intercepted.mock.restore();syncBuiltinESMExports();}
  assert.ok(chunks>=2);assert.ok(!(await readdir(directory)).includes('cancelled-hash.tar.gz'));await noPartial();
 });

 for(const mode of ['cancelled','connection-lost'])test(`${mode} após a auditoria não retorna sucesso nem mantém o arquivo final`,async()=>{
  const controller=new AbortController();let auditId;
  const intercepted=interceptExportDb(({client,sql,result})=>{
   if(!sql.startsWith('INSERT INTO audit_events('))return;
   assert.equal(result.rowCount,1);auditId=result.rows[0].id;
   if(mode==='cancelled')controller.abort();else client.emit('error',Error('Fixture connection lost after preparation audit.'));
  });
  const original={DATABASE_URL:process.env.DATABASE_URL,DATABASE_DIRECT_URL:process.env.DATABASE_DIRECT_URL};
  try{
   // A trusted injected fixture must not resolve any environment database URL.
   process.env.DATABASE_URL='fixture-db-injected';process.env.DATABASE_DIRECT_URL='fixture-db-injected';
   await assert.rejects(exportTenant(args(mode+'-audit'),{db:intercepted,storage,signal:controller.signal}),{code:mode==='cancelled'?'TENANT_EXPORT_ABORTED':'TENANT_EXPORT_CONNECTION_LOST'});
  }finally{Object.assign(process.env,original);}
  assert.ok(auditId);const audit=await db.query('SELECT metadata FROM audit_events WHERE id=$1 AND tenant_id=$2',[auditId,ids.a]);
  assert.equal(audit.rowCount,1);assert.deepEqual(Object.keys(audit.rows[0].metadata).sort(),['archiveSha256','datasets','exportId','photos','referenceHash','rows'].sort());
  assert.ok(!(await readdir(directory)).includes(mode+'-audit.tar.gz'));await noPartial();
 });
});
