import test from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import express from 'express';
import {createOriginGuard} from '../src/originGuard.ts';

const desktopOrigin='http://localhost:5173';
const mobileOrigin='http://192.168.0.9:5173';
const writeMethods=['POST','PUT','PATCH','DELETE'];

async function withGuard(
 run:(request:(method:string,origin?:string,securityHeader?:string)=>Promise<{status:number;body:any}>)=>Promise<void>,
 additionalOrigins:string|undefined=mobileOrigin
){
 const app=express();
 app.use('/api',createOriginGuard(desktopOrigin,additionalOrigins));
 app.all('/api/probe',(_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const request=async(method:string,origin?:string,securityHeader='1')=>{
  const headers:Record<string,string>={};
  if(origin!==undefined)headers.Origin=origin;
  if(securityHeader)headers['X-PetCore-Request']=securityHeader;
  const response=await fetch(base+'/api/probe',{method,headers});
  const text=await response.text();
  return {status:response.status,body:text?JSON.parse(text):undefined};
 };
 try{await run(request);}finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
}

test('mantém localhost e permite o login pela origem de celular explicitamente configurada',async()=>{
 await withGuard(async request=>{
  for(const method of writeMethods){
   for(const origin of [desktopOrigin,mobileOrigin]){
    const response=await request(method,origin);
    assert.equal(response.status,200,`${method} ${origin}`);
    assert.deepEqual(response.body,{ok:true});
   }
  }
 });
});

test('aceita várias origens configuradas com espaços entre os itens',async()=>{
 const anotherOrigin='http://192.168.0.10:5173';
 await withGuard(async request=>{
  assert.equal((await request('POST',mobileOrigin)).status,200);
  assert.equal((await request('POST',anotherOrigin)).status,200);
 },` ${mobileOrigin}/, ${anotherOrigin} `);
});

test('continua rejeitando outras origens, inclusive outros IPs, portas, protocolos e origem null',async()=>{
 await withGuard(async request=>{
  for(const origin of [
   'http://192.168.0.8:5173',
   'http://192.168.0.9:5174',
   'https://192.168.0.9:5173',
   'https://untrusted.example',
   `${mobileOrigin}/`,
   `${desktopOrigin}, ${mobileOrigin}`,
   'null'
  ]){
   const response=await request('POST',origin);
   assert.equal(response.status,403,origin);
   assert.deepEqual(response.body,{error:'Origem não permitida.'});
  }
 });
});

test('recusa configurações com curinga, credenciais ou partes que não pertencem a uma origem',()=>{
 for(const additionalOrigin of [
  '*',
  'https://*.example.com',
  'null',
  'not-a-url',
  `${mobileOrigin}/outro-caminho`,
  `${mobileOrigin}?origem=outra`,
  `${mobileOrigin}#fragmento`,
  'http://nome:senha@192.168.0.9:5173'
 ]){
  assert.throws(()=>createOriginGuard(desktopOrigin,additionalOrigin),additionalOrigin);
 }
});

test('não libera automaticamente a rede local quando a origem extra não está configurada',async()=>{
 await withGuard(async request=>{
  assert.equal((await request('POST',desktopOrigin)).status,200);
  assert.equal((await request('POST',mobileOrigin)).status,403);
 },'');
});

test('mantém obrigatório o cabeçalho de segurança em todos os métodos de escrita',async()=>{
 await withGuard(async request=>{
  for(const method of writeMethods){
   for(const securityHeader of ['', '0']){
    const response=await request(method,mobileOrigin,securityHeader);
    assert.equal(response.status,403,`${method} header=${securityHeader}`);
    assert.deepEqual(response.body,{error:'Cabeçalho de segurança obrigatório.'});
   }
  }
 });
});

test('preserva pedidos sem Origin com o cabeçalho obrigatório e métodos de leitura sem esse cabeçalho',async()=>{
 await withGuard(async request=>{
  assert.equal((await request('POST')).status,200);
  for(const method of ['GET','HEAD','OPTIONS']){
   assert.equal((await request(method,'https://untrusted.example','')).status,200,method);
  }
 });
});
