import {useEffect,useRef,useState} from 'react';
import {Copy,Link2,Navigation,RefreshCw,Share2,UserRound} from 'lucide-react';
import QRCode from 'qrcode';
import {api} from './api';
import FormDialog from './FormDialog';
import {Empty} from './ui';
import TrackingLocationView from './TrackingLocationView';
import {destinationLabel,navigationLink,transportStatus,type TrackingKind,type TrackingShare,type TransportDriver,type TransportJob} from './trackingTypes';
import './styles/_tracking.scss';

type Props={kind:TrackingKind;jobId:string;onClose:()=>void;setMessage:(value:string)=>void;setError:(value:string)=>void;canAssign?:boolean};
function shareLink(value:TrackingShare){try{const url=new URL(value.link);return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!url.search&&url.pathname===`/acompanhar/${value.token}`&&/^[a-f0-9]{48}$/.test(value.token)?url.href:'';}catch{return '';}}
export default function TrackingPanel({kind,jobId,onClose,setMessage,setError,canAssign=false}:Props){
 const [job,setJob]=useState<TransportJob|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setLocalError]=useState(''),[share,setShare]=useState<TrackingShare|null>(null),[qrReady,setQrReady]=useState(false);
 const [drivers,setDrivers]=useState<TransportDriver[]>([]),[driver,setDriver]=useState(''),[driverError,setDriverError]=useState('');
 const sequence=useRef(0),canvas=useRef<HTMLCanvasElement>(null),linkInput=useRef<HTMLInputElement>(null),lock=useRef(false),trackingSession=useRef<string|null|undefined>(undefined),driverDirty=useRef(false);
 const link=share?shareLink(share):'';
 async function load(background=false){const current=++sequence.current;if(!background)setLoading(true);try{const result=await api<TransportJob>(`/transport/jobs/${kind}/${jobId}`);if(current!==sequence.current)return;setJob(result);if(!driverDirty.current)setDriver(result.driver_id??'');setLocalError('');const nextSession=result.tracking.active?result.tracking.session_id??null:null;if(nextSession!==trackingSession.current||!result.tracking.active)setShare(null);trackingSession.current=nextSession;}catch(cause){if(current===sequence.current){setLocalError((cause as Error).message);setShare(null);}}finally{if(current===sequence.current)setLoading(false);}}
 useEffect(()=>{void load();const timer=window.setInterval(()=>{if(!document.hidden&&!lock.current)void load(true);},15000);return()=>{sequence.current++;clearInterval(timer);};},[kind,jobId]);
 useEffect(()=>{if(!canAssign||kind!=='delivery')return;let current=true;void api<{items:TransportDriver[]}|TransportDriver[]>('/transport/drivers').then(result=>{if(current)setDrivers(Array.isArray(result)?result:result.items);}).catch(cause=>{if(current)setDriverError((cause as Error).message);});return()=>{current=false;};},[canAssign,kind]);
 useEffect(()=>{let current=true;setQrReady(false);if(link&&canvas.current)void QRCode.toCanvas(canvas.current,link,{width:320,margin:3,errorCorrectionLevel:'M',color:{dark:'#0b1745',light:'#ffffff'}}).then(()=>{if(current)setQrReady(true);}).catch(()=>{if(current)setLocalError('Não foi possível preparar o QR Code. O link continua disponível.');});return()=>{current=false;};},[link]);
 async function assign(){if(lock.current||!job)return;lock.current=true;setBusy(true);setLocalError('');try{await api(`/transport/deliveries/${jobId}/driver`,'PATCH',{driver_id:driver||null});driverDirty.current=false;setShare(null);setMessage('Motorista da entrega atualizado.');await load(true);}catch(cause){setLocalError((cause as Error).message);setError((cause as Error).message);}finally{lock.current=false;setBusy(false);}}
 async function createLink(){if(lock.current||!job?.tracking.session_id)return;lock.current=true;setBusy(true);setLocalError('');try{const result=await api<TrackingShare>(`/transport/tracking/${job.tracking.session_id}/share`,'POST',{});if(!shareLink(result))throw Error('O link de acompanhamento recebido não é válido.');setShare(result);setMessage('Link de acompanhamento preparado para esta viagem.');}catch(cause){setLocalError((cause as Error).message);setError((cause as Error).message);}finally{lock.current=false;setBusy(false);}}
 async function copy(){try{await navigator.clipboard.writeText(link);setMessage('Link de acompanhamento copiado.');}catch{linkInput.current?.focus();linkInput.current?.select();setLocalError('Selecione e copie o link no campo abaixo.');}}
 async function send(){if(!navigator.share){await copy();return;}try{await navigator.share({title:'Acompanhe sua entrega',text:'Veja o andamento desta viagem no PetCore.',url:link});}catch(cause){if((cause as Error).name!=='AbortError')setLocalError('Use Copiar link para compartilhar o acompanhamento.');}}
 const route=job?navigationLink(job.destination):null;
 return <FormDialog title="Acompanhar transporte" description={job?.label} wide busy={busy} error={error} onClose={()=>{if(!busy)onClose();}}>
  <div className="tracking-panel">{loading?<Empty label="Carregando o acompanhamento..."/>:!job?<button className="ghost-btn" onClick={()=>void load()}>Tentar novamente</button>:<>
   <div className="tracking-panel-heading"><strong>{transportStatus(job.status)}</strong><span><UserRound size={20}/>{job.driver_name||'Motorista não atribuído'}</span><button className="ghost-btn" disabled={busy} onClick={()=>void load()}><RefreshCw size={18}/>Atualizar</button></div>
   {canAssign&&kind==='delivery'&&<section className="tracking-driver-assignment"><h3>Motorista desta entrega</h3><p>Ao trocar o motorista, o compartilhamento anterior será encerrado.</p>{driverError?<p role="alert">{driverError}</p>:<div><label>Motorista<select value={driver} disabled={busy} onChange={event=>{driverDirty.current=true;setDriver(event.target.value);}}><option value="">Sem motorista</option>{drivers.filter(item=>item.active||item.id===job.driver_id).map(item=><option value={item.id} key={item.id}>{item.name}{!item.active?' (inativo)':''}</option>)}</select></label><button type="button" className="ghost-btn" disabled={busy||driver===(job.driver_id??'')} onClick={()=>void assign()}>Salvar motorista</button></div>}</section>}
   <TrackingLocationView position={job.tracking.active?job.tracking.position:null} status={error?'stale':job.tracking.status}/>
   <div className="tracking-destination"><strong>Destino desta etapa</strong><p>{destinationLabel(job.destination)}</p>{route&&<a href={route} target="_blank" rel="noopener noreferrer" className="ghost-btn"><Navigation size={19}/>Abrir rota no Google Maps</a>}</div>
   <section className="tracking-share"><h3><Link2 size={21}/>Acompanhamento do cliente</h3><p>O link mostra somente o andamento e a última localização recebida desta viagem. Ele deixa de funcionar ao encerrar o compartilhamento.</p>
    {!job.tracking.active?<p className="tracking-note">O motorista precisa iniciar o compartilhamento para criar um link.</p>:link?<>
     <label>Link desta viagem<input readOnly ref={linkInput} value={link} onFocus={event=>event.currentTarget.select()}/></label><div className="tracking-inline-actions"><button type="button" className="primary-btn" onClick={()=>void copy()}><Copy size={18}/>Copiar link</button><button type="button" className="ghost-btn" onClick={()=>void send()}><Share2 size={18}/>Compartilhar</button></div>
     <canvas ref={canvas} className="tracking-qr" role="img" aria-label="QR Code para acompanhar esta viagem" style={{display:qrReady?'block':'none'}}/>{!qrReady&&<p>Preparando QR Code...</p>}<p>Válido até {new Date(share!.expires_at).toLocaleString('pt-BR')} ou até o compartilhamento ser encerrado.</p>
    </>:<button type="button" className="primary-btn" disabled={busy} onClick={()=>void createLink()}><Link2 size={18}/>Criar link de acompanhamento</button>}
   </section>
  </>}<div className="form-actions"><button className="ghost-btn" disabled={busy} onClick={onClose}>Fechar acompanhamento</button></div></div>
 </FormDialog>;
}
