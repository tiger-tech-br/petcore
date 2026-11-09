const NATIVE_ANDROID_MARKER='PetCoreAndroid/';
export const NATIVE_EXPORT_MAX_BYTES=16*1024*1024;
type ExportMime='text/csv'|'application/json';
type NativeMessage={data:string};
type NativeBridge={postMessage:(message:string)=>void;onmessage?:((event:NativeMessage)=>void)|null};
type NativeWindow=Window&{PetCoreNative?:NativeBridge};
let exportPending=false;

export function isNativeAndroid(userAgent:string){return userAgent.includes(NATIVE_ANDROID_MARKER);}

export function activateNativeAndroid(){
 if(isNativeAndroid(navigator.userAgent))document.documentElement.dataset.petcoreNative='android';
}

export function listenNativeBack(handler:()=>boolean,capture=false){
 if(!isNativeAndroid(navigator.userAgent))return()=>{};
 const listener=(event:Event)=>{if(!event.defaultPrevented&&handler())event.preventDefault();};
 window.addEventListener('petcore-native-back',listener,capture);
 return()=>window.removeEventListener('petcore-native-back',listener,capture);
}

export function nativeSaveMessage(filename:string,mime:ExportMime,content:string){
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(filename)||filename.includes('..'))throw Error('O nome do arquivo de exportação é inválido.');
 if(!(['text/csv','application/json'] as string[]).includes(mime)||!filename.endsWith(mime==='text/csv'?'.csv':'.json'))throw Error('O formato do arquivo de exportação é inválido.');
 const encoder=new TextEncoder();
 if(encoder.encode(content).byteLength>NATIVE_EXPORT_MAX_BYTES)throw Error('A exportação ultrapassa 16 MB. Reduza o período ou use o PetCore no navegador.');
 const message=JSON.stringify({type:'saveFile',filename,mime,content});
 if(encoder.encode(message).byteLength>NATIVE_EXPORT_MAX_BYTES)throw Error('A exportação ultrapassa o limite do aplicativo. Reduza o período ou use o PetCore no navegador.');
 return message;
}

// O APK possui uma ponte restrita à origem HTTPS e ao frame principal.
// O navegador continua usando Blob; os mecanismos de avisos ficam nos chamadores.
export async function saveTextFile(filename:string,mime:ExportMime,content:string):Promise<boolean>{
 if(isNativeAndroid(navigator.userAgent)){
  const bridge=(window as NativeWindow).PetCoreNative;
  if(!bridge?.postMessage)throw Error('A exportação não está disponível nesta versão do aplicativo. Abra o PetCore no navegador e tente novamente.');
  if(exportPending)throw Error('Conclua ou cancele a exportação aberta antes de preparar outro arquivo.');
  const message=nativeSaveMessage(filename,mime,content);
  return new Promise<boolean>((resolve,reject)=>{
   exportPending=true;
   const previous=bridge.onmessage;
   const finish=(result:boolean|Error)=>{
    exportPending=false;
    if(bridge.onmessage===receive)bridge.onmessage=previous;
    if(result instanceof Error)reject(result);else resolve(result);
   };
   const receive=(event:NativeMessage)=>{
    let data:{type?:unknown;status?:unknown;message?:unknown};
    try{data=JSON.parse(event.data);}catch{return;}
    if(!data||data.type!=='saveFileResult')return;
    if(data.status==='saved')finish(true);
    else if(data.status==='cancelled')finish(false);
    else if(data.status==='error')finish(Error(typeof data.message==='string'&&data.message.trim()?data.message:'Não foi possível salvar a exportação. Tente novamente.'));
   };
   bridge.onmessage=receive;
   try{bridge.postMessage(message);}catch{finish(Error('Não foi possível abrir a exportação no aplicativo. Tente novamente.'));}
  });
 }
 const blob=new Blob([content],{type:mime+';charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=filename;document.body.append(link);
 try{link.click();}finally{link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return true;
}
