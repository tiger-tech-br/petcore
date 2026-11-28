import {afterEach,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {captureState,refreshNativeCapture,startCapture,stopAllTracking} from '../src/trackingCapture.ts';
import type {TrackingGrant} from '../src/trackingTypes.ts';

const origin='https://petcore.example.test',session='a1111111-1111-4111-8111-111111111111';
const globals=['window','document','navigator','location','fetch'] as const;
let descriptors:Map<string,PropertyDescriptor|undefined>,now:number,realNow:()=>number;
let callbacks:Map<number,{callback:()=>void;delay:number;kind:'interval'|'timeout'}>,serial:number;
let geoSuccess:PositionCallback|undefined,geoError:PositionErrorCallback|undefined,watchCalls:number,cleared:number[];
let requests:{url:string;init:RequestInit}[],uploadStatuses:number[],nativeMessages:any[];
let doc:EventTarget&{hidden:boolean},win:EventTarget&Record<string,any>,nav:Record<string,any>;
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
const grant=(extra:Partial<TrackingGrant>={}):TrackingGrant=>({session_id:session,upload_token:'a'.repeat(64),upload_url:`${origin}/api/transport/tracking/${session}/positions`,stop_url:`${origin}/api/transport/tracking/${session}/stop`,expires_at:new Date(now+60000).toISOString(),...extra});
function position(timestamp=now):GeolocationPosition{return{timestamp,coords:{latitude:-23.65,longitude:-46.53,accuracy:12,altitude:null,altitudeAccuracy:null,heading:null,speed:null},toJSON(){return{};}} as GeolocationPosition;}
const uploads=()=>requests.filter(request=>request.url.endsWith('/positions'));
const stops=()=>requests.filter(request=>request.url.endsWith('/stop'));
async function pulse(){now+=15000;for(const value of [...callbacks.values()])if(value.kind==='interval')value.callback();await settle();}
beforeEach(async()=>{
 descriptors=new Map(globals.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));now=Date.parse('2026-11-27T16:00:00Z');realNow=Date.now;Date.now=()=>now;
 callbacks=new Map();serial=0;geoSuccess=undefined;geoError=undefined;watchCalls=0;cleared=[];requests=[];uploadStatuses=[];nativeMessages=[];
 doc=Object.assign(new EventTarget(),{hidden:false});win=Object.assign(new EventTarget(),{isSecureContext:true,setInterval:(callback:()=>void,delay:number)=>{const id=++serial;callbacks.set(id,{callback,delay,kind:'interval'});return id;},clearInterval:(id:number)=>callbacks.delete(id),setTimeout:(callback:()=>void,delay:number)=>{const id=++serial;callbacks.set(id,{callback,delay,kind:'timeout'});return id;},clearTimeout:(id:number)=>callbacks.delete(id)});
 nav={userAgent:'UnitBrowser',geolocation:{watchPosition:(success:PositionCallback,error:PositionErrorCallback)=>{watchCalls++;geoSuccess=success;geoError=error;return watchCalls;},clearWatch:(id:number)=>cleared.push(id)}};
 const values={window:win,document:doc,navigator:nav,location:{origin},fetch:async(input:unknown,init:RequestInit={})=>{const url=String(input);requests.push({url,init});const status=url.endsWith('/positions')?(uploadStatuses.shift()??200):200;return new Response('{}',{status});}};
 for(const key of globals)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:values[key]});
 await stopAllTracking();requests=[];
});
afterEach(async()=>{await stopAllTracking();Date.now=realNow;for(const key of globals){const descriptor=descriptors.get(key);if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});

test('importar e consultar o estado não inicia geolocalização nem envia uma posição',()=>{
 assert.equal(captureState().phase,'stopped');assert.equal(watchCalls,0);assert.equal(requests.length,0);assert.equal(callbacks.size,0);
});
test('autorizações recusam outro host, HTTP, credenciais, query e identificador de viagem divergente',async()=>{
 const invalid=[{upload_url:`https://other.example.test/api/transport/tracking/${session}/positions`},{upload_url:`http://petcore.example.test/api/transport/tracking/${session}/positions`},{upload_url:`https://user:password@petcore.example.test/api/transport/tracking/${session}/positions`},{upload_url:`${origin}/api/transport/tracking/${session}/positions?token=private`},{stop_url:`${origin}/api/transport/tracking/b2222222-2222-4222-8222-222222222222/stop`}];
 for(const value of invalid)await assert.rejects(startCapture(grant(value)),/endereço/);
 assert.equal(watchCalls,0);assert.equal(requests.length,0);
});
test('autorização expirada, ID inválido e grant incompleto não pedem permissão nem enviam credenciais',async()=>{
 for(const value of [{expires_at:new Date(now-1).toISOString()},{session_id:'not-a-session'},{upload_token:'not-a-grant'}])await assert.rejects(startCapture(grant(value)),/expirou/);
 assert.equal(watchCalls,0);assert.equal(requests.length,0);
});
test('início explícito só anuncia envio ativo depois de uma posição aceita, com bearer restrito e sem cookies',async()=>{
 await startCapture(grant());assert.equal(watchCalls,1);assert.equal(captureState().phase,'requesting');assert.equal(uploads().length,0);
 geoSuccess!(position());await settle();assert.equal(captureState().phase,'tracking');assert.equal(uploads().length,1);
 const request=uploads()[0];assert.equal(request.init.credentials,'omit');const headers=new Headers(request.init.headers);assert.equal(headers.get('Authorization'),'Bearer '+'a'.repeat(64));assert.equal(headers.get('Cookie'),null);
 const body=JSON.parse(String(request.init.body));assert.equal(body.sequence,1);assert.equal(body.latitude,-23.65);assert.equal(body.accuracy,12);
});
test('ocultar a página revoga a sessão, limpa a captura e não reinicia automaticamente ao voltar',async()=>{
 await startCapture(grant());doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));await settle();
 assert.equal(captureState().phase,'stopped');assert.equal(captureState().sessionId,null);assert.deepEqual(cleared,[1]);assert.equal(stops().length,1);
 doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(watchCalls,1);assert.equal(uploads().length,0);
});
test('a parada usada no logout impede novos envios mesmo que um callback antigo do GPS retorne',async()=>{
 await startCapture(grant());const staleCallback=geoSuccess!;geoSuccess!(position());await settle();assert.equal(uploads().length,1);
 await stopAllTracking('Saindo da conta.');staleCallback(position(now+1000));await pulse();assert.equal(uploads().length,1);assert.equal(stops().length,1);assert.equal(captureState().sessionId,null);assert.equal(callbacks.size,0);
});
test('HTTP 409 descarta a amostra fora de ordem sem encerrar a autorização e permite a próxima posição',async()=>{
 uploadStatuses=[409,200];await startCapture(grant());geoSuccess!(position());await settle();assert.equal(cleared.length,0);assert.equal(stops().length,0);assert.equal(captureState().sessionId,session);
 geoSuccess!(position(now+1000));await pulse();assert.equal(uploads().length,2);assert.deepEqual(uploads().map(request=>JSON.parse(String(request.init.body)).sequence),[1,2]);assert.equal(captureState().phase,'tracking');assert.equal(stops().length,0);
});
test('HTTP 429 não causa repetição a cada callback e pode se recuperar no próximo intervalo',async()=>{
 uploadStatuses=[429,200];await startCapture(grant());geoSuccess!(position());await settle();assert.equal(captureState().phase,'error');
 for(let index=0;index<5;index++)geoSuccess!(position(now+index));await settle();assert.equal(uploads().length,1);assert.equal(stops().length,0);
 await pulse();assert.equal(uploads().length,2);assert.equal(captureState().phase,'tracking');
});
test('permissão de GPS negada e autorização revogada encerram o compartilhamento local e no servidor',async()=>{
 await startCapture(grant());geoError!({code:1,message:'Denied',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3});await settle();assert.equal(captureState().phase,'stopped');assert.equal(stops().length,1);
 uploadStatuses=[403];await startCapture(grant());geoSuccess!(position());await settle();await settle();assert.equal(captureState().phase,'stopped');assert.equal(stops().length,2);
});
test('o APK antigo sem ponte não simula captura em segundo plano e revoga o grant recebido',async()=>{
 nav.userAgent='PetCoreAndroid/1.0.2';await assert.rejects(startCapture(grant()),/atualize|Atualize/);assert.equal(watchCalls,0);assert.equal(uploads().length,0);assert.equal(stops().length,1);assert.equal(captureState().phase,'error');assert.equal(captureState().sessionId,null);
});
test('a ponte nativa aguarda confirmação, continua com a página oculta e responde à parada explícita',async()=>{
 nav.userAgent='PetCoreAndroid/1.0.3';const bridge:{postMessage:(message:string)=>void;onmessage?:((event:{data:string})=>void)|null}={postMessage:message=>nativeMessages.push(JSON.parse(message))};win.PetCoreTracking=bridge;
 await startCapture(grant());assert.equal(watchCalls,0);assert.equal(captureState().phase,'requesting');assert.equal(nativeMessages[0].type,'start');assert.equal(nativeMessages[0].session_id,session);assert.equal(nativeMessages[0].grant,'a'.repeat(64));
 bridge.onmessage!({data:JSON.stringify({state:'tracking',session_id:session})});assert.equal(captureState().phase,'tracking');doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(captureState().phase,'tracking');assert.equal(stops().length,0);
 bridge.onmessage!({data:JSON.stringify({state:'tracking',session_id:session,code:'WAITING_FOR_GPS'})});assert.match(captureState().message,/Ainda não há uma posição enviada/);
 refreshNativeCapture();assert.equal(nativeMessages.at(-1).type,'status');await stopAllTracking();assert.equal(nativeMessages.at(-1).type,'stop');assert.equal(stops().length,1);assert.equal(captureState().phase,'stopped');assert.equal('upload_token' in captureState(),false);
});
test('fim da validade encerra a captura sem depender de uma nova posição',async()=>{
 await startCapture(grant());const expiry=[...callbacks.values()].find(value=>value.kind==='timeout');assert.ok(expiry);expiry.callback();await settle();assert.equal(captureState().phase,'stopped');assert.equal(cleared.length,1);assert.equal(stops().length,1);
});
