import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Check,Copy,Download,Link2,QrCode,RefreshCw,Share2} from 'lucide-react';
import QRCode from 'qrcode';
import {api} from './api';
import FormDialog from './FormDialog';
import {isNativeAndroid} from './nativeAndroid';
import {Empty} from './ui';
import './styles/_shop-settings.scss';

type Configuration={enabled:boolean;token:string;path?:string;link?:string;notice:string;confirmation_notice:string;legal_ready:boolean;subscription_writable?:boolean;updated_at:string};
type Props={setMessage:(value:string)=>void;setError:(value:string)=>void};

export default function PublicBookingSettings({setMessage,setError}:Props){
 const [configuration,setConfiguration]=useState<Configuration|null>(null),[enabled,setEnabled]=useState(false),[notice,setNotice]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setLocalError]=useState(''),[message,setLocalMessage]=useState(''),[qr,setQr]=useState(''),[rotateDialog,setRotateDialog]=useState(false);
 const linkInput=useRef<HTMLInputElement>(null);
 const native=isNativeAndroid(navigator.userAgent);
 function report(value:string){setLocalError(value);if(value)setError(value);}
 function apply(value:Configuration){setConfiguration(value);setEnabled(value.enabled);setNotice(value.notice||'');}
 async function load(){setLoading(true);setLocalError('');try{apply(await api<Configuration>('/public-booking/settings'));}catch(cause){report((cause as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 const link=configuration&&/^[a-f0-9]{48}$/i.test(configuration.token)?`${location.origin}/agendar/${configuration.token}`:'';
 const canEnable=configuration?.legal_ready===true&&configuration.subscription_writable!==false;
 const changed=configuration&&(enabled!==configuration.enabled||notice!==configuration.notice);
 useEffect(()=>{
  let current=true;setQr('');
  if(link)void QRCode.toDataURL(link,{width:320,margin:3,errorCorrectionLevel:'M',color:{dark:'#0b1745',light:'#ffffff'}}).then(value=>{if(current)setQr(value);}).catch(()=>{if(current)report('Não foi possível gerar o QR Code. O link continua disponível para copiar.');});
  return()=>{current=false;};
 },[link]);
 async function save(event?:FormEvent,rotate=false){
  event?.preventDefault();if(busy||!configuration)return;
  if(enabled&&!canEnable){report(!configuration.legal_ready?'Finalize os Termos e a Política de Privacidade para liberar o link.':'Regularize a assinatura para ativar o link de agendamento.');return;}
  setBusy(true);setLocalError('');setLocalMessage('');
  try{
   apply(await api<Configuration>('/public-booking/settings','PUT',{enabled,notice,rotate_token:rotate}));setRotateDialog(false);
   const result=rotate?'Novo link criado. Use o link e o QR Code atualizados.':enabled?'Link ativado. Seus clientes já podem solicitar um horário.':'Preferências salvas. O link está desativado.';
   setLocalMessage(result);setMessage(result);
  }catch(cause){report((cause as Error).message);}finally{setBusy(false);}
 }
 async function copy(){
  if(!link)return;
  try{await navigator.clipboard.writeText(link);setLocalMessage('Link copiado. Envie pelo WhatsApp ou publique nas suas redes sociais.');setLocalError('');}
  catch{linkInput.current?.focus();linkInput.current?.select();report('Selecione e copie o link no campo abaixo.');}
 }
 async function share(){
  if(!link)return;
  if(!navigator.share){await copy();return;}
  try{await navigator.share({title:'Agende o atendimento do seu pet',text:'Escolha o serviço e solicite um horário para seu pet.',url:link});}
  catch(cause){if((cause as Error).name!=='AbortError')report('Não foi possível compartilhar agora. Use Copiar link.');}
 }
 return <section className="panel public-booking-settings" aria-labelledby="public-booking-settings-title">
  <div className="shop-settings-heading"><span className="shop-settings-icon" aria-hidden="true"><Link2 size={26}/></span><div><h2 id="public-booking-settings-title">Agendamento pelo cliente</h2><p>Compartilhe um link ou QR Code. O cliente escolhe o serviço e um horário; o pedido chega na sua Agenda para você confirmar.</p></div></div>
  {loading?<Empty label="Carregando seu link de agendamento..."/>:!configuration?<div className="shop-settings-empty"><p role="alert">{error||'Não foi possível carregar o link.'}</p><button type="button" className="ghost-btn" onClick={()=>void load()}><RefreshCw size={18}/>Tentar novamente</button></div>:<>
   <div className="public-booking-settings-status"><span className={`public-booking-status ${configuration.enabled&&canEnable?'is-active':''}`}>{configuration.enabled&&canEnable?<Check size={18}/>:<Link2 size={18}/>} {configuration.enabled&&canEnable?'Link ativo':'Link desativado'}</span><p>{configuration.enabled&&canEnable?'Seu cliente pode solicitar um atendimento.':'Enquanto estiver desativado, o link não recebe pedidos.'}</p></div>
   {!configuration.legal_ready?<p className="shop-settings-attention" role="status">Finalize os Termos e a Política de Privacidade para liberar o link de agendamento. Você já pode conferir o link e o QR Code abaixo.</p>:configuration.subscription_writable===false?<p className="shop-settings-attention" role="status">Regularize a assinatura em Plano e assinatura para ativar o link.</p>:null}
   <div className="public-booking-settings-grid">
    <form className="public-booking-preferences" onSubmit={event=>void save(event)}>
     <label className="public-booking-enable"><input type="checkbox" checked={enabled} disabled={busy||!enabled&&!canEnable} onChange={event=>{setEnabled(event.target.checked);setLocalError('');setLocalMessage('');}}/><span>Receber pedidos de agendamento por este link</span></label>
     <label>Recado para seus clientes <span className="shop-settings-optional">(opcional)</span><textarea maxLength={600} rows={3} disabled={busy} placeholder="Ex.: Chegue 10 minutos antes do horário." value={notice} onChange={event=>{setNotice(event.target.value);setLocalMessage('');}}/></label>
     <p className="shop-settings-hint">Os horários disponíveis vêm dos seus serviços e da agenda de atendimento.</p>
     <div className="public-booking-form-actions"><button type="submit" className="primary-btn" disabled={busy||!changed}>{busy?'Salvando...':'Salvar preferências'}</button></div>
     {error&&<p className="shop-settings-error" role="alert">{error}</p>}{message&&<p className="shop-settings-message" role="status">{message}</p>}
    </form>
    <div className="public-booking-share">
     <label htmlFor="public-booking-link">Seu link de agendamento</label><input ref={linkInput} id="public-booking-link" readOnly value={link} onFocus={event=>event.currentTarget.select()}/>
     <div className="public-booking-share-actions"><button type="button" className="primary-btn" disabled={!link||busy} onClick={()=>void copy()}><Copy size={18}/>Copiar link</button><button type="button" className="ghost-btn" disabled={!link||busy} onClick={()=>void share()}><Share2 size={18}/>Compartilhar</button></div>
     <div className="public-booking-qr">{qr?<img src={qr} width={240} height={240} alt="QR Code para abrir o agendamento deste pet shop"/>:<div className="public-booking-qr-placeholder"><QrCode size={40}/><span>Preparando QR Code...</span></div>}<p>O cliente aponta a câmera do celular para abrir o agendamento.</p>{qr&&!native&&<a className="ghost-btn" download="petcore-agendamento.png" href={qr}><Download size={18}/>Baixar QR Code</a>}</div>
     <details className="public-booking-link-options"><summary>Trocar o link de agendamento</summary><p>Use esta opção para encerrar o link antigo. Será preciso compartilhar o novo link e substituir os QR Codes já impressos.</p><button type="button" className="ghost-btn" aria-haspopup="dialog" disabled={busy} onClick={()=>{setLocalError('');setRotateDialog(true);}}>Criar outro link</button></details>
    </div>
   </div>
  </>}
  {rotateDialog&&<FormDialog title="Criar outro link?" description="O link atual e os QR Codes antigos deixarão de abrir o agendamento. Os pedidos já recebidos permanecem na sua Agenda." busy={busy} error={error} onClose={()=>{if(!busy)setRotateDialog(false);}}><div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>setRotateDialog(false)}>Manter link atual</button><button type="button" className="primary-btn" disabled={busy} onClick={()=>void save(undefined,true)}>{busy?'Criando...':'Criar novo link'}</button></div></FormDialog>}
 </section>;
}
