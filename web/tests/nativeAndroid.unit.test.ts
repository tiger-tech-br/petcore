import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {activateNativeAndroid,isNativeAndroid,listenNativeBack,nativeSaveMessage,NATIVE_EXPORT_MAX_BYTES,saveTextFile} from '../src/nativeAndroid.ts';

const descriptors=new Map(['navigator','window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
const marker='Mozilla/5.0 Android PetCoreAndroid/1.0';
let userAgent=marker;
const target=new EventTarget(),messages:string[]=[],timers:(()=>void)[]=[],dataset:Record<string,string>={};
const bridge:{postMessage:(data:string)=>void;onmessage?:((event:{data:string})=>void)|null}={postMessage:data=>messages.push(data)};
const nativeWindow={PetCoreNative:bridge,addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target),setTimeout:(callback:()=>void)=>{timers.push(callback);return timers.length;}};
const fakeDocument={documentElement:{dataset},body:{append:()=>{}},createElement:()=>({href:'',download:'',click:()=>{},remove:()=>{}})};
before(()=>{
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get userAgent(){return userAgent;}}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:nativeWindow});
 Object.defineProperty(globalThis,'document',{configurable:true,value:fakeDocument});
});
after(()=>{for(const [key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
const reply=(status:string,message='')=>bridge.onmessage?.({data:JSON.stringify({type:'saveFileResult',status,message})});

test('identifica apenas o marcador do APK e aplica o escopo visual sem afetar o navegador',()=>{
 assert.equal(isNativeAndroid(marker),true);assert.equal(isNativeAndroid('Mozilla/5.0 Android Chrome/130'),false);
 userAgent='Mozilla/5.0 Chrome';activateNativeAndroid();assert.deepEqual(dataset,{});
 userAgent=marker;activateNativeAndroid();assert.equal(dataset.petcoreNative,'android');
});
test('payload preserva texto UTF-8 e limita nomes/formatos da ponte nativa',()=>{
 const text='pet;observação\nLuna;"ação e coração"';
 assert.deepEqual(JSON.parse(nativeSaveMessage('petcore-relatorio.csv','text/csv',text)),{type:'saveFile',filename:'petcore-relatorio.csv',mime:'text/csv',content:text});
 for(const filename of ['../arquivo.csv','dir/arquivo.csv','dir\\arquivo.csv','arquivo\u0000.csv','arquivo.json'])assert.throws(()=>nativeSaveMessage(filename,'text/csv','conteúdo'),/nome|formato/);
 assert.throws(()=>nativeSaveMessage('arquivo.html','text/html' as never,'conteúdo'),/formato/);
});
test('limite considera bytes UTF-8 e também o tamanho da mensagem JSON escapada',()=>{
 assert.throws(()=>nativeSaveMessage('arquivo.json','application/json','€'.repeat(Math.floor(NATIVE_EXPORT_MAX_BYTES/3)+1)),/16 MB/);
 assert.throws(()=>nativeSaveMessage('arquivo.csv','text/csv','\n'.repeat(NATIVE_EXPORT_MAX_BYTES/2)),/limite/);
});
test('exportação aguarda o seletor, bloqueia duplicação e restaura a ponte ao salvar/cancelar',async()=>{
 userAgent=marker;const previous=()=>{};bridge.onmessage=previous;
 let settled=false;const saved=saveTextFile('arquivo.csv','text/csv','pet;valor').then(value=>{settled=true;return value;});
 await Promise.resolve();assert.equal(settled,false);assert.equal(JSON.parse(messages.at(-1)!).filename,'arquivo.csv');
 await assert.rejects(saveTextFile('outro.csv','text/csv','outro'),/Conclua/);
 bridge.onmessage?.({data:'not-json'});bridge.onmessage?.({data:JSON.stringify({type:'other'})});await Promise.resolve();assert.equal(settled,false);
 reply('saved');assert.equal(await saved,true);assert.equal(bridge.onmessage,previous);
 const cancelled=saveTextFile('cancelado.json','application/json','{}');reply('cancelled');assert.equal(await cancelled,false);assert.equal(bridge.onmessage,previous);
});
test('falha nativa é visível ao chamador e permite uma nova tentativa',async()=>{
 const failed=saveTextFile('arquivo.json','application/json','{}');reply('error','Não foi possível gravar no destino.');await assert.rejects(failed,/gravar no destino/);
 const retried=saveTextFile('arquivo.json','application/json','{}');reply('saved');assert.equal(await retried,true);
 const original=bridge.postMessage;bridge.postMessage=()=>{throw Error('falha interna');};try{await assert.rejects(saveTextFile('arquivo.json','application/json','{}'),/abrir a exportação/);}finally{bridge.postMessage=original;}
});
test('APK sem ponte retorna orientação em vez de simular um download concluído',async()=>{
 const original=nativeWindow.PetCoreNative;delete(nativeWindow as {PetCoreNative?:unknown}).PetCoreNative;
 try{await assert.rejects(saveTextFile('arquivo.csv','text/csv','pet;valor'),/navegador/);}finally{nativeWindow.PetCoreNative=original;}
});
test('navegador conserva download Blob, nome e limpeza da URL temporária',async()=>{
 userAgent='Mozilla/5.0 Chrome';const create=URL.createObjectURL,revoke=URL.revokeObjectURL,createElement=fakeDocument.createElement,append=fakeDocument.body.append;
 const calls:string[]=[],link={href:'',download:'',click:()=>calls.push('click'),remove:()=>calls.push('remove')};let savedBlob:Blob|undefined;
 URL.createObjectURL=blob=>{savedBlob=blob as Blob;return 'blob:fixture';};URL.revokeObjectURL=url=>calls.push('revoke:'+url);
 fakeDocument.createElement=()=>link;fakeDocument.body.append=()=>calls.push('append');
 try{
  assert.equal(await saveTextFile('arquivo.csv','text/csv','pet;ação'),true);assert.equal(link.href,'blob:fixture');assert.equal(link.download,'arquivo.csv');assert.equal(savedBlob?.type,'text/csv;charset=utf-8');assert.equal(await savedBlob?.text(),'pet;ação');assert.deepEqual(calls,['append','click','remove']);timers.pop()!();assert.equal(calls.at(-1),'revoke:blob:fixture');
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;fakeDocument.createElement=createElement;fakeDocument.body.append=append;userAgent=marker;}
});
test('Voltar cancelável é consumido apenas pelo APK e a inscrição pode ser removida',()=>{
 userAgent='Chrome';const normal=listenNativeBack(()=>true);assert.equal(target.dispatchEvent(new Event('petcore-native-back',{cancelable:true})),true);normal();
 userAgent=marker;let calls=0;const remove=listenNativeBack(()=>{calls++;return true;});assert.equal(target.dispatchEvent(new Event('petcore-native-back',{cancelable:true})),false);assert.equal(calls,1);remove();assert.equal(target.dispatchEvent(new Event('petcore-native-back',{cancelable:true})),true);
});
