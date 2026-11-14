import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Download} from 'lucide-react';
import {api} from './api';
import {businessDate,reasonText} from './businessUi';
import {isNativeAndroid} from './nativeAndroid';
import {prepareCompanyExportDownload,saveCompanyExportDownload} from './tenantExportDownload';

type Ticket={id:string;subject:string;status:string;created_at:string};
type Props={companyId:string;companyName:string;onCancel:()=>void;onBusyChange:(busy:boolean)=>void;setMessage:(value:string)=>void;onError:(cause:unknown)=>void};

export default function PlatformTenantExportForm({companyId,companyName,onCancel,onBusyChange,setMessage,onError}:Props){
 const [tickets,setTickets]=useState<Ticket[]>([]),[ticket,setTicket]=useState(''),[password,setPassword]=useState(''),[verified,setVerified]=useState(false),[loading,setLoading]=useState(true),[loadFailed,setLoadFailed]=useState(false),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 const controller=useRef<AbortController|null>(null),mounted=useRef(true),native=isNativeAndroid(navigator.userAgent);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 useEffect(()=>{
  if(native){setLoading(false);return;}
  let active=true;setLoading(true);setLoadFailed(false);
  api<{items:Ticket[]}>(`/commercial/platform/subscriptions/${companyId}/export-requests`).then(result=>{if(active){setTickets(result.items);setTicket(result.items[0]?.id??'');}}).catch(cause=>{if(active){setLoadFailed(true);onError(cause);}}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[companyId,revision,native]);
 async function prepare(event:FormEvent){
  event.preventDefault();if(busy)return;if(!verified){onError(Error('Confirme a identidade e a autorização do responsável antes de exportar.'));return;}
  const current=new AbortController();controller.current=current;setBusy(true);onBusyChange(true);
  try{
   const download=prepareCompanyExportDownload(companyId,{password,ticket_id:ticket,identity_verified:true},current.signal);setPassword('');
   const result=await download;if(!mounted.current||current.signal.aborted)return;
   saveCompanyExportDownload(result.blob,result.filename);setVerified(false);setMessage('Download preparado. Salve o arquivo em um local privado e entregue somente ao responsável verificado.');
  }catch(cause){if(mounted.current){if(current.signal.aborted)setMessage('Preparação da exportação cancelada.');else onError(Error(reasonText(cause)));}}
  finally{controller.current=null;if(mounted.current){setBusy(false);onBusyChange(false);}}
 }
 if(native)return <div className="stack-form commercial-form"><p className="commercial-body-copy">Para preparar e salvar a exportação completa de {companyName}, abra o painel da plataforma em um computador. O arquivo inclui os registros da empresa e as fotos dos pets.</p><div className="form-actions"><button className="ghost-btn" type="button" onClick={onCancel}>Voltar para a assinatura</button></div></div>;
 return <form className="stack-form commercial-form" onSubmit={prepare}>
  <p className="commercial-body-copy">Prepare os registros e as fotos de <strong>{companyName}</strong> em um arquivo compactado. Entregue somente ao responsável autorizado por um canal privado.</p>
  {loading?<p role="status" className="commercial-small-note">Carregando os atendimentos desta empresa...</p>:loadFailed?<div><p className="commercial-small-note">Não foi possível consultar os atendimentos.</p><button className="ghost-btn" type="button" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button></div>:tickets.length?<><label>Atendimento que autorizou a entrega<select required disabled={busy} value={ticket} onChange={event=>setTicket(event.target.value)}>{tickets.map(item=><option value={item.id} key={item.id}>{item.subject} · {businessDate(item.created_at)}</option>)}</select></label><p className="commercial-small-note">São listados os 100 atendimentos mais recentes desta empresa. Confira se a solicitação selecionada corresponde à entrega.</p><label className="commercial-check"><input required type="checkbox" checked={verified} disabled={busy} onChange={event=>setVerified(event.target.checked)}/><span>Verifiquei a identidade e os poderes do administrador e confirmei o canal privado de entrega.</span></label><label>Confirme sua senha de operação<input required type="password" maxLength={200} autoComplete="current-password" disabled={busy} value={password} onChange={event=>setPassword(event.target.value)}/></label></>:<p className="commercial-small-note">Peça ao responsável que abra uma solicitação na área Suporte antes de preparar a entrega. Ela ficará vinculada à exportação.</p>}
  {busy&&<p className="commercial-small-note" role="status">Preparando os dados e as fotos. Mantenha esta tela aberta; você pode cancelar a preparação.</p>}
  <div className="form-actions"><button className="ghost-btn" type="button" onClick={()=>busy?controller.current?.abort():onCancel()}>{busy?'Cancelar preparação':'Voltar para a assinatura'}</button><button className="primary-btn" type="submit" disabled={busy||loading||loadFailed||!tickets.length}><Download size={17}/>{busy?'Preparando...':'Preparar e baixar arquivo'}</button></div>
 </form>;
}
