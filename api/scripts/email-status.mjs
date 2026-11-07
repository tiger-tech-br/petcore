// Consulta somente a configuração do remetente; nunca envia mensagens.
import {config} from 'dotenv';
config({path:new URL('../../.env',import.meta.url)});
const key=process.env.EMAIL_API_KEY||process.env.RESEND_API_KEY;
const from=process.env.EMAIL_FROM||process.env.RESEND_FROM_EMAIL||'';
const domain=from.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
if(!key||!domain){console.log(JSON.stringify({ok:false,code:'EMAIL_CONFIGURATION_MISSING'}));process.exitCode=1;}
else try{
 const response=await fetch('https://api.resend.com/domains',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
 if(!response.ok){
  const error=await response.json().catch(()=>({}));
  const providerCode=typeof error.name==='string'&&/^[a-z_]{1,64}$/.test(error.name)?error.name:'unknown';
  console.log(JSON.stringify({ok:false,code:'EMAIL_STATUS_UNAVAILABLE',httpStatus:response.status,providerCode,senderDomain:domain,messagesSent:0}));process.exitCode=1;
 }
 else{
  const data=await response.json(),selected=data.data?.find(item=>item.name?.toLowerCase()===domain);
  const verified=selected?.status==='verified';
  console.log(JSON.stringify({ok:verified,event:'email_sender_status',senderDomain:domain,status:selected?.status||'not_found',messagesSent:0}));
  if(!verified)process.exitCode=1;
 }
}catch{console.log(JSON.stringify({ok:false,code:'EMAIL_STATUS_CONNECTION_FAILED',senderDomain:domain,messagesSent:0}));process.exitCode=1;}
