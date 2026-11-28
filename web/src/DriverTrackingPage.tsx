import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Clock3,LocateFixed,MapPin,Navigation,RefreshCw,Square,Truck} from 'lucide-react';
import {api} from './api';
import {isNativeAndroid} from './nativeAndroid';
import FormDialog from './FormDialog';
import {Empty,PageHeader} from './ui';
import TrackingLocationView from './TrackingLocationView';
import {captureState,refreshNativeCapture,startCapture,stopAllTracking,subscribeCapture,type CaptureState} from './trackingCapture';
import {destinationLabel,navigationLink,trackingJobLabel,transportStatus,type TrackingGrant,type TransportJob} from './trackingTypes';
import './styles/_tracking.scss';

type Props={setMessage:(value:string)=>void;setError:(value:string)=>void};
export default function DriverTrackingPage({setMessage,setError}:Props){
 const [jobs,setJobs]=useState<TransportJob[]>([]),[loading,setLoading]=useState(true),[error,setLocalError]=useState(''),[capture,setCapture]=useState<CaptureState>(captureState),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<TransportJob|null>(null),[mode,setMode]=useState<'start'|'status'|null>(null),[consent,setConsent]=useState(false),[dialogError,setDialogError]=useState('');
 const sequence=useRef(0),lock=useRef(false),native=isNativeAndroid(navigator.userAgent);
 async function load(background=false){const current=++sequence.current;if(!background)setLoading(true);try{const result=await api<{items:TransportJob[]}>('/transport/my-jobs');if(current===sequence.current){setJobs(result.items);setLocalError('');}}catch(cause){if(current===sequence.current){const message=(cause as Error).message;setLocalError(message);if(!background)setError(message);}}finally{if(current===sequence.current)setLoading(false);}}
 useEffect(()=>{void load();refreshNativeCapture();const unsubscribe=subscribeCapture(setCapture);const timer=window.setInterval(()=>{if(!document.hidden&&!lock.current)void load(true);},15000);const foreground=()=>{if(!document.hidden){refreshNativeCapture();void load(true);}};document.addEventListener('visibilitychange',foreground);return()=>{sequence.current++;clearInterval(timer);unsubscribe();document.removeEventListener('visibilitychange',foreground);};},[]);
 function open(job:TransportJob,next:'start'|'status'){if(lock.current)return;setSelected(job);setMode(next);setConsent(false);setDialogError('');}
 async function act(){
  if(lock.current||!selected||!mode)return;
  if(mode==='start'&&!consent){setDialogError('Confirme que deseja compartilhar a localização durante esta viagem.');return;}
  lock.current=true;setBusy(true);setDialogError('');
  try{
   if(mode==='start'){if(capture.sessionId&&capture.sessionId!==selected.tracking.session_id)await stopAllTracking();const grant=await api<TrackingGrant>(`/transport/jobs/${selected.kind}/${selected.id}/start`,'POST',{consent:true});await startCapture(grant);setMessage('Compartilhamento solicitado. Confira a permissão de localização no aparelho.');}
   else{await api(`/transport/jobs/${selected.kind}/${selected.id}/status`,'POST',{status:selected.next_status,expected_status:selected.status});if(['completed','delivered','cancelled'].includes(selected.next_status??'')&&selected.tracking.session_id===capture.sessionId)await stopAllTracking();setMessage('Etapa da viagem atualizada.');}
   setMode(null);setSelected(null);await load(true);
  }catch(cause){setDialogError((cause as Error).message);setError((cause as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 async function stop(){if(lock.current)return;lock.current=true;setBusy(true);try{await stopAllTracking();setMessage('Compartilhamento de localização encerrado.');await load(true);}finally{lock.current=false;setBusy(false);}}
 const activeJob=jobs.find(job=>job.tracking.session_id===capture.sessionId);
 return <div className="tracking-driver-page">
  <PageHeader eyebrow="ÁREA DO MOTORISTA" title="Minhas viagens" subtitle="Confira o destino, registre as etapas e compartilhe a localização somente durante o serviço." action={<button className="ghost-btn" disabled={loading||busy} onClick={()=>void load()}><RefreshCw size={19}/>Atualizar viagens</button>}/>
  <section className={`tracking-capture-state ${capture.phase==='tracking'?'is-active':''}`} aria-live="polite"><LocateFixed size={28}/><div><strong>{capture.phase==='tracking'?'Localização compartilhada':capture.phase==='requesting'?'Aguardando autorização':capture.phase==='error'?'Confira o compartilhamento':'Você controla sua localização'}</strong><p>{capture.message}</p>{capture.lastUploadAt&&<p>Último envio: {new Date(capture.lastUploadAt).toLocaleTimeString('pt-BR')}</p>}</div>{capture.sessionId&&<button type="button" className="danger-btn" disabled={busy} onClick={()=>void stop()}><Square size={18}/>Parar compartilhamento</button>}</section>
  {!native&&<p className="tracking-note"><Clock3 size={20}/>No navegador, mantenha o PetCore aberto e visível. Você pode navegar pelo sistema; ao ocultar a página, o compartilhamento será encerrado. Para continuar com a tela apagada, use a versão do aplicativo com localização em segundo plano.</p>}
  {loading?<Empty label="Carregando suas viagens..."/>:error?<section className="panel tracking-empty"><p role="alert">{error}</p><button className="ghost-btn" onClick={()=>void load()}>Tentar novamente</button></section>:jobs.length?<div className="tracking-job-list">{jobs.map(job=>{const route=navigationLink(job.destination),ownCapture=Boolean(capture.sessionId&&job.tracking.session_id===capture.sessionId);return <article className="panel tracking-job-card" key={`${job.kind}-${job.id}`}>
   <div className="tracking-job-heading"><span><Truck size={20}/>{trackingJobLabel(job.kind)}</span><strong>{transportStatus(job.status)}</strong></div><h2>{job.label}</h2>
   <dl className="tracking-job-destination"><dt><MapPin size={20}/>Destino desta etapa</dt><dd>{destinationLabel(job.destination)}</dd></dl>{job.reference&&job.destination.address===job.address&&<p className="tracking-reference">Referência: {job.reference}</p>}
   <div className="tracking-job-actions">{route&&<a className="ghost-btn" href={route} target="_blank" rel="noopener noreferrer"><Navigation size={19}/>Abrir rota no Google Maps</a>}{job.next_status&&job.next_label&&<button type="button" className="primary-btn" disabled={busy} onClick={()=>open(job,'status')}>{job.next_label}<ArrowRight size={19}/></button>}{job.can_start&&!ownCapture&&<button type="button" className="primary-btn" disabled={busy||capture.phase==='requesting'} onClick={()=>open(job,'start')}><LocateFixed size={19}/>Iniciar compartilhamento</button>}{ownCapture&&<button type="button" className="danger-btn" disabled={busy} onClick={()=>void stop()}><Square size={18}/>Parar compartilhamento</button>}</div>
   {!job.can_start&&!ownCapture&&!['completed','delivered','cancelled'].includes(job.status)&&<p className="tracking-note">Inicie a etapa da viagem antes de compartilhar a localização.</p>}{ownCapture&&<TrackingLocationView position={activeJob?.tracking.position??null} status={activeJob?.tracking.status??'waiting'}/>}
  </article>;})}</div>:<section className="panel tracking-empty"><Truck size={39}/><h2>Nenhuma viagem atribuída a você</h2><p>O responsável pelo pet shop precisa vincular seu acesso a um motorista e atribuir uma busca ou entrega.</p></section>}
  {mode&&selected&&<FormDialog title={mode==='start'?'Compartilhar localização':selected.next_label||'Atualizar viagem'} description={selected.label} busy={busy} error={dialogError} onClose={()=>{if(!busy){setMode(null);setSelected(null);}}}><div className="tracking-confirm">
   {mode==='start'?<><p>A equipe do pet shop e o cliente com um link de acompanhamento poderão ver sua localização durante esta viagem.</p><p>{native?'O aplicativo mostrará uma notificação enquanto o compartilhamento estiver ativo. Você pode parar pela notificação ou pela barra de localização do PetCore.':'O navegador só compartilha enquanto o PetCore permanece visível. Você pode navegar entre as telas do sistema. Ao ocultar ou sair do site, o compartilhamento será encerrado.'}</p><label className="tracking-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/><span>Quero compartilhar minha localização durante esta viagem.</span></label></>:<p>Confirme somente depois de realizar esta etapa do serviço. Esta ação não registra pagamento nem inicia a localização automaticamente.</p>}
   <div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>{setMode(null);setSelected(null);}}>Voltar</button><button type="button" className="primary-btn" disabled={busy} onClick={()=>void act()}>{busy?'Aguarde...':mode==='start'?'Autorizar e iniciar':'Confirmar etapa'}</button></div>
  </div></FormDialog>}
 </div>;
}
