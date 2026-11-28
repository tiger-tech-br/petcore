import {useEffect,useState} from 'react';
import {LocateFixed,Square} from 'lucide-react';
import {captureState,refreshNativeCapture,stopAllTracking,subscribeCapture,type CaptureState} from './trackingCapture';
import './styles/_tracking.scss';

type Props={onOpenDriver?:()=>void};
export default function TrackingActivityBar({onOpenDriver}:Props){
 const [capture,setCapture]=useState<CaptureState>(captureState),[busy,setBusy]=useState(false);
 useEffect(()=>{const unsubscribe=subscribeCapture(setCapture);refreshNativeCapture();const foreground=()=>{if(!document.hidden)refreshNativeCapture();};document.addEventListener('visibilitychange',foreground);return()=>{unsubscribe();document.removeEventListener('visibilitychange',foreground);};},[]);
 if(!capture.sessionId||capture.phase==='stopped')return null;
 return <aside className={`tracking-activity-bar${capture.phase==='error'?' has-error':''}`} aria-label="Compartilhamento de localização ativo"><LocateFixed size={24}/><div aria-live="polite"><strong>{capture.phase==='requesting'?'Aguardando autorização de localização':capture.phase==='error'?'Confira o envio da localização':'Localização compartilhada durante a viagem'}</strong><p>{capture.message}</p></div><div className="tracking-activity-actions">{onOpenDriver&&<button type="button" className="ghost-btn" onClick={onOpenDriver}>Ver minhas viagens</button>}<button type="button" className="danger-btn" disabled={busy} onClick={()=>{if(busy)return;setBusy(true);void stopAllTracking().finally(()=>setBusy(false));}}><Square size={17}/>{busy?'Encerrando...':'Parar compartilhamento'}</button></div></aside>;
}
