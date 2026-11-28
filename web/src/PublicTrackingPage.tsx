import {useEffect,useRef,useState} from 'react';
import {Clock3,RefreshCw,Truck} from 'lucide-react';
import {Brand} from './Brand';
import TrackingLocationView from './TrackingLocationView';
import {trackingTime,type TrackingPosition,type TrackingStatus} from './trackingTypes';
import './styles/_tracking.scss';

type Snapshot={status:TrackingStatus;position:TrackingPosition|null;updated_at:string|null;expires_at:string};
export default function PublicTrackingPage({token}:{token:string}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[ended,setEnded]=useState(false),[error,setError]=useState('');
 const sequence=useRef(0),endedRef=useRef(false);
 async function load(){
  if(endedRef.current)return;const current=++sequence.current;
  try{
   const response=await fetch(`/api/public/tracking/${token}`,{credentials:'omit',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
   if(current!==sequence.current)return;
   if([404,410].includes(response.status)){endedRef.current=true;setEnded(true);setSnapshot(null);setError('');return;}
   if(!response.ok)throw Error('connection');const value=await response.json() as Snapshot;
   if(current!==sequence.current)return;
   if(!['waiting','live','stale'].includes(value.status)||!Number.isFinite(Date.parse(value.expires_at)))throw Error('response');
   setSnapshot(value);setError('');
  }catch{if(current===sequence.current){setError('Não foi possível atualizar agora. Confira sua conexão; tentaremos novamente.');setSnapshot(value=>value?{...value,status:'stale'}:null);}}
  finally{if(current===sequence.current)setLoading(false);}
 }
 useEffect(()=>{
  if(!/^[a-f0-9]{48}$/.test(token)){setEnded(true);setLoading(false);endedRef.current=true;return;}
  void load();const timer=window.setInterval(()=>{if(!document.hidden)void load();},15000);
  const foreground=()=>{if(!document.hidden){setSnapshot(value=>value?{...value,status:'stale'}:null);void load();}};document.addEventListener('visibilitychange',foreground);
  return()=>{sequence.current++;clearInterval(timer);document.removeEventListener('visibilitychange',foreground);};
 },[token]);
 return <main className="tracking-public-page"><header><Brand/><span><Truck size={22}/>Acompanhamento da viagem</span></header><section className="tracking-public-content">
  <span className="tracking-eyebrow">SEU PET SHOP, MAIS PERTO</span><h1>{ended?'Acompanhamento encerrado':'Acompanhe o transporte'}</h1><p>{ended?'O compartilhamento terminou ou este link não está mais disponível.':'Confira a última localização compartilhada pelo motorista durante esta viagem.'}</p>
  {loading?<div className="panel tracking-empty"><Clock3 size={32}/><p>Carregando o acompanhamento...</p></div>:ended?<div className="panel tracking-empty"><Truck size={42}/><h2>Localização não disponível</h2><p>Para confirmar a conclusão ou pedir informações, fale diretamente com o pet shop.</p></div>:<section className="panel tracking-public-map">{error&&<p className="tracking-warning" role="status">{error}</p>}<TrackingLocationView position={snapshot?.position??null} status={snapshot?.status??'waiting'}/>{snapshot?.updated_at&&<p className="tracking-note">Atualização recebida às {trackingTime(snapshot.updated_at)}.</p>}<button className="ghost-btn" type="button" onClick={()=>void load()}><RefreshCw size={18}/>Atualizar acompanhamento</button></section>}
  <p className="tracking-public-help">O mapa não confirma a entrega nem representa uma previsão de chegada. As etapas são confirmadas pela equipe do pet shop.</p>
 </section></main>;
}
