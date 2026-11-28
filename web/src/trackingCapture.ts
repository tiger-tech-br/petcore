import {isNativeAndroid} from './nativeAndroid';
import type {TrackingGrant} from './trackingTypes';

type CapturePhase='stopped'|'requesting'|'tracking'|'error';
export type CaptureState={phase:CapturePhase;sessionId:string|null;native:boolean;message:string;lastUploadAt:string|null};
type Bridge={postMessage:(value:string)=>void;onmessage?:((event:{data:string})=>void)|null};
type TrackingWindow=Window&{PetCoreTracking?:Bridge};
let state:CaptureState={phase:'stopped',sessionId:null,native:false,message:'Localização não compartilhada.',lastUploadAt:null};
const subscribers=new Set<(value:CaptureState)=>void>();
let watch:number|null=null,timer:number|null=null,expiryTimer:number|null=null,sequence=0,lastAttemptAt=0,grant:TrackingGrant|null=null,inFlight=false,queued:GeolocationPosition|null=null;
let nativeBridge:Bridge|undefined;
function notify(patch:Partial<CaptureState>){state={...state,...patch};for(const subscriber of subscribers)subscriber(state);}
export const captureState=()=>state;
export function subscribeCapture(listener:(value:CaptureState)=>void){subscribers.add(listener);listener(state);return()=>{subscribers.delete(listener);};}
function validEndpoint(raw:string,session:string,part:'positions'|'stop'){
 const target=new URL(raw,location.origin);
 if(target.protocol!=='https:'||target.origin!==location.origin||target.username||target.password||target.search||target.hash||target.pathname!==`/api/transport/tracking/${session}/${part}`)throw Error('O endereço de localização recebido não é válido. Atualize o PetCore.');
 return target.href;
}
function clearBrowser(){if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}if(timer!==null){window.clearInterval(timer);timer=null;}if(expiryTimer!==null){window.clearTimeout(expiryTimer);expiryTimer=null;}queued=null;document.removeEventListener('visibilitychange',visibilityChanged);window.removeEventListener('pagehide',pageHidden);}
function connectNative(){
 const bridge=(window as TrackingWindow).PetCoreTracking;
 if(!bridge?.postMessage)return null;
 if(nativeBridge===bridge)return bridge;
 nativeBridge=bridge;const previous=bridge.onmessage;
 bridge.onmessage=event=>{
  previous?.(event);
  let value:{state?:string;session_id?:string;last_upload_at?:string;code?:string};try{value=JSON.parse(event.data);}catch{return;}
  if(value.state==='tracking'||value.state==='starting'){
   const warning=value.code==='WAITING_FOR_GPS'?'Aguardando sinal de GPS. Ainda não há uma posição enviada.':value.code==='CONNECTION_UNAVAILABLE'?'O aplicativo está sem conexão para enviar a posição. A última posição não indica uma atualização ao vivo.':value.code==='POSITION_SKIPPED'?'Uma posição antiga foi descartada. Aguardando a próxima atualização.':null;
   notify({phase:value.state==='starting'?'requesting':value.code==='CONNECTION_UNAVAILABLE'?'error':'tracking',sessionId:value.session_id??state.sessionId,native:true,lastUploadAt:value.last_upload_at??state.lastUploadAt,message:warning??(value.state==='tracking'?'Localização compartilhada pelo aplicativo durante esta viagem.':'Aguardando a autorização de localização do aplicativo.')});
  }
  else if(value.state==='stopped'){grant=null;notify({phase:'stopped',sessionId:null,native:true,message:'Localização não compartilhada.',lastUploadAt:null});}
  else if(value.state==='error'){
   const messages:Record<string,string>={PERMISSION_DENIED:'Permissão de localização negada. Autorize o PetCore nas configurações do Android e tente novamente.',LOCATION_PERMISSION_DENIED:'Permissão de localização negada. Autorize o PetCore nas configurações do Android e tente novamente.',NOTIFICATION_PERMISSION_REQUIRED:'Ative as notificações do PetCore para acompanhar e poder parar a localização durante a viagem.',LOCATION_DISABLED:'Ative a localização do aparelho e inicie o compartilhamento novamente.',TRACKING_ALREADY_ACTIVE:'Outra viagem já está compartilhando a localização. Confira a barra de localização antes de iniciar uma nova.',GRANT_EXPIRED_OR_CLOCK_INVALID:'A autorização expirou ou a data do aparelho está incorreta. Confira a data e inicie novamente.'};
   notify({phase:'error',native:true,message:messages[value.code??'']??'O aplicativo não conseguiu compartilhar a localização. Confira as permissões e a conexão e inicie novamente.'});
  }
 };
 return bridge;
}
export function refreshNativeCapture(){if(isNativeAndroid(navigator.userAgent))try{connectNative()?.postMessage(JSON.stringify({type:'status'}));}catch{notify({phase:'error',message:'Não foi possível consultar a localização do aplicativo. Abra novamente a área do motorista.'});}}
async function finishGrant(current:TrackingGrant|null,session=state.sessionId){
 if(!session)return;
 try{await fetch(current?validEndpoint(current.stop_url,session,'stop'):`/api/transport/tracking/${session}/stop`,{method:'POST',credentials:current?'omit':'include',keepalive:true,headers:{'Content-Type':'application/json','X-PetCore-Request':'1',...(current?{Authorization:`Bearer ${current.upload_token}`}:{})},body:'{}',signal:AbortSignal.timeout(5000)});}catch{/* The backend also expires and revokes grants independently. */}
}
export async function stopAllTracking(message='Compartilhamento de localização encerrado.'){
 const current=grant,session=state.sessionId;grant=null;clearBrowser();
 if(isNativeAndroid(navigator.userAgent))try{connectNative()?.postMessage(JSON.stringify({type:'stop',...(session?{session_id:session}:{})}));}catch{/* Revoke on the backend even if the native bridge is unavailable. */}
 notify({phase:'stopped',sessionId:null,message,lastUploadAt:null});await finishGrant(current,session);
}
function visibilityChanged(){if(document.hidden&&!state.native)void stopAllTracking('A localização foi pausada porque esta página ficou em segundo plano. Ao voltar, toque em Iniciar compartilhamento.');}
function pageHidden(){if(!state.native)void stopAllTracking('Compartilhamento encerrado ao sair desta página.');}
async function flush(){
 const current=grant,position=queued;if(!current||!position||inFlight||document.hidden||state.native)return;
 const now=Date.now();if(lastAttemptAt&&now-lastAttemptAt<15000)return;queued=null;
 if(now-position.timestamp>90000||position.timestamp>now+30000)return;
 const {latitude,longitude,accuracy}=position.coords;
 if(![latitude,longitude,accuracy].every(Number.isFinite)||Math.abs(latitude)>90||Math.abs(longitude)>180||accuracy<0)return;
 inFlight=true;lastAttemptAt=now;const ownSession=current.session_id;
 try{
  const response=await fetch(validEndpoint(current.upload_url,ownSession,'positions'),{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-PetCore-Request':'1',Authorization:`Bearer ${current.upload_token}`},body:JSON.stringify({latitude,longitude,accuracy,captured_at:new Date(position.timestamp).toISOString(),sequence:++sequence}),signal:AbortSignal.timeout(20000)});
  if(grant?.session_id!==ownSession)return;
  if(response.status===409)return; // Out-of-order samples do not revoke the trip grant.
  if(!response.ok){if([401,403,404,410].includes(response.status)){await stopAllTracking('A autorização desta viagem foi encerrada. Atualize suas viagens.');return;}throw Error('upload');}
  notify({phase:'tracking',lastUploadAt:new Date().toISOString(),message:'Localização compartilhada enquanto esta página estiver visível.'});
 }catch{if(grant?.session_id===ownSession)notify({phase:'error',message:'A última posição não foi enviada. Confira a conexão; uma posição antiga não será mostrada como atual.'});}
 finally{inFlight=false;}
}
export async function startCapture(value:TrackingGrant){
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value.session_id)||!/^[a-f0-9]{64}$/i.test(value.upload_token)||!Number.isFinite(Date.parse(value.expires_at))||Date.parse(value.expires_at)<=Date.now())throw Error('A autorização da viagem expirou. Atualize a página e inicie novamente.');
 validEndpoint(value.upload_url,value.session_id,'positions');validEndpoint(value.stop_url,value.session_id,'stop');
 if(grant&&grant.session_id!==value.session_id)await stopAllTracking();
 grant=value;sequence=0;lastAttemptAt=0;clearBrowser();
 const native=isNativeAndroid(navigator.userAgent);
 notify({phase:'requesting',sessionId:value.session_id,native,lastUploadAt:null,message:native?'Aguardando a autorização de localização do aplicativo.':'Autorize a localização neste navegador para compartilhar durante a viagem.'});
 if(native){const bridge=connectNative();if(!bridge){grant=null;notify({phase:'error',sessionId:null,message:'Esta versão do APK não oferece localização em segundo plano. Atualize o aplicativo ou use o navegador com esta página visível.'});await finishGrant(value,value.session_id);throw Error(state.message);}try{bridge.postMessage(JSON.stringify({type:'start',session_id:value.session_id,upload_url:new URL(value.upload_url,location.origin).href,stop_url:new URL(value.stop_url,location.origin).href,grant:value.upload_token,expires_at:value.expires_at}));}catch{await stopAllTracking();notify({phase:'error',message:'O aplicativo não conseguiu iniciar a localização. Tente novamente ou atualize o APK.'});throw Error(state.message);}return;}
 if(!window.isSecureContext||!navigator.geolocation||document.hidden){grant=null;notify({phase:'error',sessionId:null,message:'Abra o PetCore por HTTPS e mantenha esta página visível para compartilhar a localização.'});await finishGrant(value,value.session_id);throw Error(state.message);}
 document.addEventListener('visibilitychange',visibilityChanged);window.addEventListener('pagehide',pageHidden);
 watch=navigator.geolocation.watchPosition(position=>{if(grant?.session_id!==value.session_id)return;queued=position;if(!lastAttemptAt)void flush();},error=>{void stopAllTracking(error.code===1?'Permissão de localização negada. Autorize o navegador para iniciar novamente.':'Não foi possível obter a localização. Confira o GPS do aparelho e tente novamente.');},{enableHighAccuracy:true,maximumAge:0,timeout:20000});
 timer=window.setInterval(()=>void flush(),15000);expiryTimer=window.setTimeout(()=>void stopAllTracking('O período autorizado desta viagem terminou.'),Math.max(0,Date.parse(value.expires_at)-Date.now()));
}
