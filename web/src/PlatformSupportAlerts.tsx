import {useEffect,useState} from 'react';
import {Bell,RefreshCw} from 'lucide-react';

type Summary={pending_count:number;emails:{queued:number;sending:number;sent:number;failed:number;uncertain:number};notifications_enabled:boolean;email_configured:boolean};
export const supportUpdated=()=>window.dispatchEvent(new Event('petcore-support-updated'));

function useSupportSummary(){
 const [summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let active=true,busy=false;const controller=new AbortController();
  async function load(){
   if(busy)return;busy=true;
   try{
    const response=await fetch('/api/commercial/platform/support-summary',{credentials:'include',headers:{'X-PetCore-Request':'1'},signal:controller.signal});
    if(!response.ok)throw Error('SUPPORT_SUMMARY_FAILED');
    const value=await response.json() as Summary;
    if(active){setSummary(value);setError(false);}
   }catch{if(active)setError(true);}finally{busy=false;}
  }
  const update=()=>{void load();};const visible=()=>{if(document.visibilityState==='visible')update();};
  update();const timer=window.setInterval(visible,30000);
  window.addEventListener('focus',update);window.addEventListener('petcore-support-updated',update);document.addEventListener('visibilitychange',visible);
  return()=>{active=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('petcore-support-updated',update);document.removeEventListener('visibilitychange',visible);};
 },[revision]);
 return {summary,error,refresh:()=>setRevision(value=>value+1)};
}

export function PlatformSupportBell({onOpen}:{onOpen:()=>void}){
 const {summary,error}=useSupportSummary();const pending=summary?.pending_count??0,failed=(summary?.emails.failed??0)+(summary?.emails.uncertain??0);
 const label=error?'Abrir suporte da plataforma. Não foi possível atualizar os avisos.':`Abrir suporte da plataforma: ${pending} ${pending===1?'solicitação pendente':'solicitações pendentes'}${failed?'; há avisos por e-mail para conferir':''}`;
 return <div className="notification-center"><button type="button" className="icon-button notification-button" aria-label={label} title={label} onClick={onOpen}><Bell size={23}/>{(pending>0||failed>0||error)&&<span className="notification-counter" aria-hidden="true">{pending>99?'99+':pending||'!'}</span>}</button></div>;
}

export function PlatformSupportStatus(){
 const {summary,error,refresh}=useSupportSummary();
 return <section className="panel commercial-panel" aria-label="Avisos do suporte"><div className="commercial-panel-head"><div><h2>Pedidos e avisos</h2><p>O pedido fica registrado no painel, mesmo quando o e-mail precisa de conferência.</p></div><button type="button" className="ghost-btn" onClick={refresh}><RefreshCw size={17}/>Atualizar avisos</button></div>
  {error?<p className="commercial-warning">Não foi possível atualizar os avisos. Tente novamente.</p>:summary?<>
   <p className="commercial-body-copy"><strong>{summary.pending_count}</strong> solicitações abertas ou em atendimento.</p>
   {(!summary.notifications_enabled||!summary.email_configured)&&<p className="commercial-warning">Os avisos por e-mail ainda não estão ativos ou configurados. Os pedidos continuam disponíveis abaixo.</p>}
   <p className="commercial-body-copy">Na fila: {summary.emails.queued+summary.emails.sending}. Aceitos pelo provedor: {summary.emails.sent}.</p>
   {summary.emails.failed+summary.emails.uncertain>0&&<p className="commercial-warning">{summary.emails.failed+summary.emails.uncertain} aviso(s) precisam de conferência de envio. Consulte o registro técnico do suporte e o provedor antes de repetir um envio incerto.</p>}
  </>:<p className="commercial-body-copy">Carregando avisos…</p>}
 </section>;
}
