import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool,tx,type Db} from './core.js';

type EventKind='request_received'|'customer_message'|'platform_reply';
type RecipientKind='operator'|'requester';
type EventInput={tenantId:string;ticketId:string;messageId:string;event:EventKind};
type Payload={from:string;to:string[];subject:string;text:string};
type Job={id:string;tenant_id:string;ticket_id:string;message_id:string;event_kind:EventKind;recipient_kind:RecipientKind;recipient_user_id:string|null;recipient_email:string;payload_json:Payload|null;attempt_count:number;first_attempt_at:Date|string|null;claimed_by:string};
type Context={company_name:string;tenant_active:boolean;category:string;created_by:string|null;actor_user_id:string|null;from_platform:boolean;actor_platform:boolean|null;actor_email:string|null;requester_email:string|null;actor_active:boolean;requester_active:boolean;support_email:string|null};
const MAX_ATTEMPTS=5,RETRY_WINDOW_MS=23*60*60*1000,SEND_TIMEOUT_MS=10000;
const configurationErrors=['EMAIL_CONFIG_INVALID','EMAIL_ORIGIN_INVALID'];

export function isSupportEmailRecipient(value:string,production=process.env.NODE_ENV!=='test'){
 if(value.length>254||/[\r\n<>]/.test(value)||!z.email().safeParse(value).success)return false;
 const domain=value.split('@')[1].toLowerCase();
 return !production||!(/^(?:.*\.)?example\.(?:com|net|org)$/.test(domain)||/(?:^|\.)(?:test|invalid|localhost|example)$/.test(domain));
}
const email=(value:string|null|undefined)=>(value??'').trim().toLowerCase();
function sender(){
 const raw=process.env.EMAIL_FROM?.trim()??'';
 if(raw.length>320||/[\x00-\x1f\x7f]/.test(raw))return null;
 const display=/^[^<>]+<([^<>]+)>$/.exec(raw),address=display?display[1].trim():raw;
 return isSupportEmailRecipient(address)?raw:null;
}
function origin(){
 try{const value=new URL(process.env.APP_ORIGIN??'');return value.protocol==='https:'&&!value.username&&!value.password&&value.pathname==='/'&&!value.search&&!value.hash?value.origin:null;}catch{return null;}
}
export function supportEmailStatus(){
 const enabled=process.env.SUPPORT_EMAILS_ENABLED==='true'&&process.env.SUPPORT_EMAILS_CONFIRM_SEND==='YES';
 const errorCode=process.env.EMAIL_PROVIDER!=='resend'||!process.env.EMAIL_API_KEY||!sender()?'EMAIL_CONFIG_INVALID':!origin()?'EMAIL_ORIGIN_INVALID':null;
 return{enabled,configured:errorCode===null,errorCode};
}
async function context(db:Db,input:{tenantId:string;ticketId:string;messageId:string}):Promise<Context|undefined>{
 const result=await db.query(`SELECT t.name AS company_name,t.active AS tenant_active,s.category,s.created_by,m.actor_user_id,m.from_platform,
  a.is_platform_owner AS actor_platform,a.email AS actor_email,u.email AS requester_email,c.support_email,
  EXISTS(SELECT 1 FROM memberships x WHERE x.tenant_id=m.tenant_id AND x.user_id=m.actor_user_id AND x.active) AS actor_active,
  EXISTS(SELECT 1 FROM memberships x WHERE x.tenant_id=s.tenant_id AND x.user_id=s.created_by AND x.active) AS requester_active
  FROM support_messages m JOIN support_tickets s ON s.tenant_id=m.tenant_id AND s.id=m.ticket_id
  JOIN tenants t ON t.id=s.tenant_id CROSS JOIN commercial_settings c
  LEFT JOIN users a ON a.id=m.actor_user_id LEFT JOIN users u ON u.id=s.created_by
  WHERE m.tenant_id=$1 AND m.ticket_id=$2 AND m.id=$3 AND c.singleton=true`,[input.tenantId,input.ticketId,input.messageId]);
 return result.rows[0];
}
function validEvent(current:Context,event:EventKind){
 return event==='platform_reply'?current.from_platform&&current.actor_platform===true:!current.from_platform&&current.actor_active;
}
export async function enqueueSupportEmails(db:Db,input:EventInput):Promise<void>{
 const current=await context(db,input);
 if(!current||!validEvent(current,input.event))throw Error('SUPPORT_EMAIL_EVENT_INVALID');
 const recipients:{kind:RecipientKind;userId:string|null;address:string}[]=[];
 if(input.event!=='platform_reply')recipients.push({kind:'operator',userId:null,address:email(current.support_email)});
 if(input.event==='request_received')recipients.push({kind:'requester',userId:current.actor_user_id,address:email(current.actor_email)});
 if(input.event==='platform_reply')recipients.push({kind:'requester',userId:current.created_by,address:email(current.requester_email)});
 for(const recipient of recipients)await db.query(`INSERT INTO support_email_notifications(tenant_id,ticket_id,message_id,event_kind,recipient_kind,recipient_user_id,recipient_email)
  VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(message_id,recipient_kind) DO NOTHING`,[input.tenantId,input.ticketId,input.messageId,input.event,recipient.kind,recipient.userId,recipient.address]);
}
function payload(job:Job,current:Context):Payload{
 const link=new URL('/',origin()!);link.searchParams.set('support_ticket',job.ticket_id);link.searchParams.set('support_company',job.tenant_id);
 const company=current.company_name.replace(/[\r\n]/g,' ').slice(0,160),billing=current.category==='billing';
 const operator=job.recipient_kind==='operator';
 const subject=operator?job.event_kind==='request_received'?'PetCore — nova solicitação de suporte':'PetCore — nova mensagem de suporte':job.event_kind==='request_received'?'PetCore — recebemos sua solicitação':'PetCore — atualização da sua solicitação';
 const introduction=operator?'Há uma solicitação ou mensagem para a Tiger Tech conferir no PetCore.':job.event_kind==='request_received'?'Recebemos sua solicitação no PetCore. Você pode acompanhar o atendimento pelo painel.':'A Tiger Tech registrou uma atualização na sua solicitação. Consulte o atendimento pelo painel.';
 const detail=billing?'Pedidos de assinatura exigem conferência. Este aviso não confirma troca de plano, cancelamento de cobrança ou recebimento de pagamento.':'Este aviso confirma apenas o registro no atendimento.';
 return{from:sender()!,to:[job.recipient_email],subject,text:`${introduction}\n\nEmpresa: ${company}\nProtocolo: ${job.ticket_id}\n\n${detail}\n\nAcesse sua conta para acompanhar:\n${link.href}\n\nResponda pelo painel do PetCore para manter o histórico do chamado.\nPetCore — Tiger Tech`};
}
function frozenPayloadValid(value:Payload|null,address:string){
 return value!==null&&typeof value.from==='string'&&typeof value.subject==='string'&&typeof value.text==='string'&&Array.isArray(value.to)&&value.to.length===1&&value.to[0]===address&&!/[\r\n]/.test(value.from)&&value.text.length<=6000&&value.subject.length<=180;
}
async function claimOne():Promise<Job|null>{
 return tx(async db=>{
  // The provider keeps idempotency keys for 24 hours. Use 23 hours with margin.
  // A process crash can leave an accepted message marked sending; replay only
  // within that window using the same frozen payload and key.
  await db.query(`UPDATE support_email_notifications SET state=CASE WHEN first_attempt_at>now()-interval '23 hours' AND attempt_count<5 THEN 'queued' ELSE 'uncertain' END,
   claimed_by=NULL,claim_expires_at=NULL,next_attempt_at=now(),error_code='EMAIL_CLAIM_EXPIRED',updated_at=now()
   WHERE state='sending' AND claim_expires_at<now()`);
  await db.query(`UPDATE support_email_notifications SET state='uncertain',error_code='EMAIL_RETRY_WINDOW_EXPIRED',updated_at=now()
   WHERE state='queued' AND first_attempt_at<=now()-interval '23 hours'`);
  await db.query(`UPDATE support_email_notifications SET state='uncertain',error_code='EMAIL_ATTEMPT_LIMIT_REACHED',updated_at=now()
   WHERE state='queued' AND attempt_count>=5`);
  const result=await db.query(`SELECT * FROM support_email_notifications WHERE next_attempt_at<=now()
   AND (state='queued' OR state='failed' AND attempt_count=0 AND error_code=ANY($1::text[]))
   ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,[configurationErrors]);
  const job=result.rows[0] as Job|undefined;if(!job)return null;
  const current=await context(db,{tenantId:job.tenant_id,ticketId:job.ticket_id,messageId:job.message_id});
  let blocked:string|null=null;
  if(!current||!current.tenant_active||!validEvent(current,job.event_kind))blocked='EMAIL_SOURCE_UNAVAILABLE';
  if(current&&!blocked){
   const expectedUser=job.event_kind==='platform_reply'?current.created_by:current.actor_user_id;
   const active=job.event_kind==='platform_reply'?current.requester_active:current.actor_active;
   const address=email(job.recipient_kind==='operator'?current.support_email:job.event_kind==='platform_reply'?current.requester_email:current.actor_email);
   if(job.recipient_kind==='operator'&&!job.first_attempt_at)job.recipient_email=address;
   if(job.recipient_email!==address||job.recipient_kind==='requester'&&(!active||job.recipient_user_id!==expectedUser))blocked='EMAIL_RECIPIENT_CHANGED';
   else if(!isSupportEmailRecipient(job.recipient_email))blocked='EMAIL_RECIPIENT_INVALID';
  }
  if(blocked){await db.query("UPDATE support_email_notifications SET state='cancelled',error_code=$2,updated_at=now() WHERE id=$1",[job.id,blocked]);return{...job,claimed_by:''};}
  const configuration=supportEmailStatus();
  if(!configuration.configured){await db.query("UPDATE support_email_notifications SET state='failed',error_code=$2,next_attempt_at=now()+interval '5 minutes',updated_at=now() WHERE id=$1",[job.id,configuration.errorCode]);return{...job,claimed_by:''};}
  if(job.payload_json&&!frozenPayloadValid(job.payload_json,job.recipient_email)){
   await db.query("UPDATE support_email_notifications SET state='failed',error_code='EMAIL_PAYLOAD_INVALID',updated_at=now() WHERE id=$1",[job.id]);return{...job,claimed_by:''};
  }
  job.payload_json??=payload(job,current!);job.claimed_by=randomUUID();
  const updated=await db.query(`UPDATE support_email_notifications SET state='sending',recipient_email=$2,payload_json=$3::jsonb,
   claimed_by=$4,claim_expires_at=now()+interval '1 minute',attempt_count=attempt_count+1,
   first_attempt_at=COALESCE(first_attempt_at,now()),last_attempt_at=now(),error_code=NULL,updated_at=now()
   WHERE id=$1 AND attempt_count<5 RETURNING attempt_count,first_attempt_at,payload_json`,[job.id,job.recipient_email,JSON.stringify(job.payload_json),job.claimed_by]);
  if(!updated.rowCount)return null;
  return{...job,...updated.rows[0]};
 });
}
async function finish(job:Job,state:string,errorCode:string|null,providerId:string|null=null){
 await pool.query(`UPDATE support_email_notifications SET state=$3,error_code=$4,provider_message_id=$5,
  sent_at=CASE WHEN $3='sent' THEN now() ELSE sent_at END,claimed_by=NULL,claim_expires_at=NULL,
  next_attempt_at=CASE WHEN $3='queued' THEN now()+(LEAST(3600,60*power(2,attempt_count))::int*interval '1 second') ELSE next_attempt_at END,
  updated_at=now() WHERE id=$1 AND claimed_by=$2 AND state='sending'`,[job.id,job.claimed_by,state,errorCode,providerId]);
}
async function deliver(job:Job,signal?:AbortSignal){
 // Revalidate the recipient immediately before transmitting; source rows were
 // checked while claiming and are checked again after the transaction committed.
 const current=await context(pool,{tenantId:job.tenant_id,ticketId:job.ticket_id,messageId:job.message_id});
 const recipient=current?email(job.recipient_kind==='operator'?current.support_email:job.event_kind==='platform_reply'?current.requester_email:current.actor_email):'';
 const recipientActive=current&&(job.event_kind==='platform_reply'?current.requester_active:current.actor_active);
 if(!current||!current.tenant_active||!validEvent(current,job.event_kind)||recipient!==job.recipient_email||!isSupportEmailRecipient(recipient)||job.recipient_kind==='requester'&&!recipientActive){await finish(job,'cancelled','EMAIL_RECIPIENT_CHANGED');return;}
 const configuration=supportEmailStatus();
 if(!configuration.enabled){await finish(job,'queued','EMAIL_DISABLED_BEFORE_SEND');return;}
 if(!configuration.configured){await finish(job,'failed',configuration.errorCode);return;}
 const retry=Date.now()-new Date(job.first_attempt_at!).getTime()<RETRY_WINDOW_MS&&job.attempt_count<MAX_ATTEMPTS;
 try{
  const timeout=AbortSignal.timeout(SEND_TIMEOUT_MS);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.EMAIL_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`petcore-support/${job.id}`},body:JSON.stringify(job.payload_json),signal:signal?AbortSignal.any([signal,timeout]):timeout});
  if(response.ok){
   let providerId:unknown;try{const value:unknown=await response.json();if(value&&typeof value==='object'&&'id' in value)providerId=value.id;}catch{}
   if(typeof providerId==='string'&&providerId.length>0&&providerId.length<=200){await finish(job,'sent',null,providerId);return;}
   await finish(job,retry?'queued':'uncertain','EMAIL_PROVIDER_RESPONSE_UNCERTAIN');return;
  }
  if(response.status===429||response.status>=500){await finish(job,retry?'queued':'uncertain','EMAIL_PROVIDER_TEMPORARY');return;}
  await finish(job,'failed',response.status===409?'EMAIL_PROVIDER_CONFLICT':'EMAIL_PROVIDER_REJECTED');
 }catch{
  await finish(job,retry?'queued':'uncertain','EMAIL_NETWORK_UNCERTAIN');
 }
}
let processing=false;
async function runBatch(limit:number,signal?:AbortSignal):Promise<{processed:number}>{
 if(processing||!supportEmailStatus().enabled||signal?.aborted)return{processed:0};
 processing=true;let processed=0;
 try{
  // Minimize stored message payloads and addresses; support history stays intact.
  await pool.query(`UPDATE support_email_notifications SET payload_json=NULL,recipient_email='',recipient_user_id=NULL,
   state=CASE WHEN state='failed' THEN 'cancelled' ELSE state END
   WHERE state IN ('sent','failed','uncertain','cancelled') AND updated_at<now()-interval '30 days'
   AND (payload_json IS NOT NULL OR recipient_email<>'' OR recipient_user_id IS NOT NULL)`);
  while(processed<limit&&!signal?.aborted){const job=await claimOne();if(!job)break;processed++;if(job.claimed_by)await deliver(job,signal);}
  return{processed};
 }finally{processing=false;}
}
export async function processSupportEmails(options:{limit?:number}={}):Promise<{processed:number}>{
 const limit=options.limit??10;if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('SUPPORT_EMAIL_LIMIT_INVALID');
 return runBatch(limit);
}
export function startSupportEmailWorker():()=>void{
 const abort=new AbortController();let stopped=false;
 const tick=()=>{if(stopped)return;void runBatch(5,abort.signal).catch(()=>console.error(JSON.stringify({event:'support_email_worker_failed',errorCode:'SUPPORT_EMAIL_WORKER_FAILED'})));};
 const timer=setInterval(tick,30000);timer.unref();queueMicrotask(tick);
 return()=>{stopped=true;clearInterval(timer);abort.abort();};
}
