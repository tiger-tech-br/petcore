import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';
import sharp from 'sharp';

const address=new URL(process.env.TEST_DATABASE_URL||'postgresql://invalid/missing');
if(!decodeURIComponent(address.pathname).endsWith('_test'))throw Error('Uploads: use um banco exclusivo *_test.');
process.env.DATABASE_URL=address.toString();process.env.NODE_ENV='test';
process.env.SESSION_SECRET='uploads-local-fixtures-'+randomUUID()+randomUUID();
process.env.DATABASE_SSL??=address.searchParams.has('sslmode')?'true':'false';
for(const key of ['OBJECT_STORAGE_ENDPOINT','OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_ACCESS_KEY','OBJECT_STORAGE_SECRET_KEY'])process.env[key]='';
const {createApp}=await import('../src/server.js');
const {pool}=await import('../src/core.js');
const db=new pg.Pool({connectionString:address.toString(),ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
const company=randomUUID(),user=randomUUID(),tutor=randomUUID(),pet=randomUUID(),missingPet=randomUUID(),password='Local-upload-fixture-'+randomUUID();
const sourceIp=`2001:db8:${randomUUID().slice(0,4)}::7`;
let server:ReturnType<ReturnType<typeof createApp>['listen']>,base='',cookie='',image:Buffer;
const originalFetch=globalThis.fetch;
async function request(path:string,method='GET',body?:unknown,session=cookie){
 const multipart=body instanceof FormData;
 const response=await fetch(base+'/api'+path,{method,headers:{'X-PetCore-Request':'1','X-Forwarded-For':sourceIp,...(!multipart?{'Content-Type':'application/json'}:{}),Cookie:session},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});
 return {code:response.status,data:await response.json() as any,headers:response.headers};
}
function photo(field='photo',bytes:Buffer=image){const form=new FormData();form.append(field,new Blob([new Uint8Array(bytes)],{type:'image/png'}),'pet.png');return form;}
before(async()=>{
 const app=createApp();app.set('trust proxy','loopback');server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));const binding=server.address();assert.ok(binding&&typeof binding!=='string');base=`http://127.0.0.1:${binding.port}`;
 globalThis.fetch=(async(input:any,init?:any)=>{const destination=new URL(typeof input==='string'?input:input.url??String(input));assert.equal(destination.origin,base,'Testes de upload não acessam serviços externos.');return originalFetch(input,init);}) as typeof fetch;
 await db.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[company,'Upload isolado '+company]);
 await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[user,'Upload fixture',user+'@example.test',await argon2.hash(password)]);
 await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'admin')",[company,user]);
 await db.query("INSERT INTO tutors(id,tenant_id,name) VALUES($1,$2,'Cliente fictício')",[tutor,company]);
 await db.query("INSERT INTO pets(id,tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,'Pet fictício','Cão','pequeno')",[pet,company,tutor]);
 const login=await request('/auth/login','POST',{email:user+'@example.test',password},'');assert.equal(login.code,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
 assert.equal((await request('/commercial/onboarding','POST',{plan:'free'})).code,200);
 image=await sharp({create:{width:2,height:2,channels:3,background:'#008b93'}}).png().toBuffer();
});
after(async()=>{
 globalThis.fetch=originalFetch;
 if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
 try{
  await db.query('DELETE FROM "session" WHERE sess->>\'userId\'=$1',[user]);
  await db.query('DELETE FROM audit_events WHERE tenant_id=$1',[company]);
  await db.query('DELETE FROM tenant_subscriptions WHERE tenant_id=$1',[company]);
  await db.query('DELETE FROM pets WHERE tenant_id=$1',[company]);await db.query('DELETE FROM tutors WHERE tenant_id=$1',[company]);
  await db.query('DELETE FROM memberships WHERE tenant_id=$1',[company]);
  await db.query('DELETE FROM tenants WHERE id=$1',[company]);await db.query('DELETE FROM users WHERE id=$1',[user]);
 }finally{await Promise.all([db.end(),pool.end()]);}
});
test('upload continua exigindo sessão antes de processar multipart',async()=>{assert.equal((await request(`/pets/${missingPet}/photo`,'POST',photo(),'')).code,401);});
test('multipart rejeita campos extras simples ou aninhados antes de acumular o conteúdo',async()=>{
 for(const name of ['extra','extra[0][valor]']){const form=new FormData();form.append(name,'x'.repeat(1024));assert.equal((await request(`/pets/${missingPet}/photo`,'POST',form)).code,413);}
 const many=new FormData();for(let n=0;n<200;n++)many.append('extra'+n,'x'.repeat(1024));assert.equal((await request(`/pets/${missingPet}/photo`,'POST',many)).code,413);
 const form=photo();form.append('extra','conteúdo adicional');assert.equal((await request(`/pets/${missingPet}/photo`,'POST',form)).code,413);
});
test('multipart limita quantidade, tamanho e nome dos arquivos',async()=>{
 assert.equal((await request(`/pets/${missingPet}/photo`,'POST',photo('outro'))).code,400);
 assert.equal((await request(`/pets/${missingPet}/photo`,'POST',photo('x'.repeat(65)))).code,413);
 const duplicate=photo();duplicate.append('photo',new Blob([new Uint8Array(image)],{type:'image/png'}),'outro.png');assert.ok([400,413].includes((await request(`/pets/${missingPet}/photo`,'POST',duplicate)).code));
 assert.equal((await request(`/pets/${missingPet}/photo`,'POST',photo('photo',Buffer.alloc(5*1024*1024+1)))).code,413);
});
test('uma imagem legítima atravessa o parser e mantém validação de propriedade do pet',async()=>{
 const response=await request(`/pets/${missingPet}/photo`,'POST',photo());assert.equal(response.code,404);assert.equal(response.data.error,'Pet não encontrado.');
 const own=await request(`/pets/${pet}/photo`,'POST',photo());assert.equal(own.code,503);assert.match(own.data.error,/Armazenamento em nuvem não configurado/);
 assert.equal((await db.query('SELECT photo_key FROM pets WHERE id=$1',[pet])).rows[0].photo_key,null);
 assert.ok(response.headers.get('x-request-id'));assert.equal(response.headers.get('cache-control'),'no-store');
});
