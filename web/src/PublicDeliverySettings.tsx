import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Check,Copy,Download,Link2,QrCode,RefreshCw,Share2} from 'lucide-react';
import QRCode from 'qrcode';
import {api} from './api';
import {parseCents} from './businessUi';
import {isNativeAndroid} from './nativeAndroid';
import FormDialog from './FormDialog';
import {Empty} from './ui';
import './styles/_delivery-public-admin.scss';

type Configuration={enabled:boolean;token:string;link:string;coverage_note:string;notice:string;delivery_fee_cents:number|null;delivery_enabled:boolean;operation_mode:string;subscription_writable:boolean;confirmation_notice:string};
type Props={setMessage:(value:string)=>void;setError:(value:string)=>void;writable?:boolean};
const amount=(value:number|null)=>value===null?'':(value/100).toFixed(2).replace('.',',');
function catalogLink(config:Configuration|null){
 if(!config||!/^[a-f0-9]{48}$/.test(config.token))return '';
 const path=`/loja/${config.token}`;
 try{const url=new URL(config.link);if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname===path&&!url.search&&!url.hash)return url.href;}catch{/* A development fixture can omit its canonical origin. */}
 if(!config.link&&(import.meta.env.DEV||document.documentElement.dataset.petcoreQa==='fictitious-local'))return new URL(path,location.origin).href;
 return '';
}
export default function PublicDeliverySettings({setMessage,setError,writable=true}:Props){
 const [config,setConfig]=useState<Configuration|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setLocalError]=useState(''),[message,setLocalMessage]=useState('');
 const [expanded,setExpanded]=useState(false),[enabled,setEnabled]=useState(false),[coverage,setCoverage]=useState(''),[notice,setNotice]=useState(''),[fee,setFee]=useState(''),[variableFee,setVariableFee]=useState(true),[rotate,setRotate]=useState(false);
 const [qr,setQr]=useState(''),[qrReady,setQrReady]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null),linkInput=useRef<HTMLInputElement>(null),lock=useRef(false);
 const native=isNativeAndroid(navigator.userAgent),link=catalogLink(config),canWrite=writable&&config?.subscription_writable!==false;
 const canShare=Boolean(config?.enabled&&config.delivery_enabled&&config.operation_mode==='complete'&&canWrite&&link);
 function report(value:string){setLocalError(value);if(value)setError(value);}
 function apply(value:Configuration){setConfig(value);setEnabled(value.enabled);setCoverage(value.coverage_note||'');setNotice(value.notice||'');setFee(amount(value.delivery_fee_cents));setVariableFee(value.delivery_fee_cents===null);}
 async function load(){setLoading(true);setLocalError('');try{apply(await api<Configuration>('/public-delivery/settings'));}catch(cause){report((cause as Error).message);}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 useEffect(()=>{
  let current=true;setQr('');setQrReady(false);const target=canvas.current;
  if(expanded&&!loading&&link&&target)void QRCode.toCanvas(target,link,{width:320,margin:3,errorCorrectionLevel:'M',color:{dark:'#0b1745',light:'#ffffff'}}).then(()=>{if(current){if(!native)setQr(target.toDataURL('image/png'));setQrReady(true);}}).catch(()=>{if(current)report('Não foi possível gerar o QR Code. O link continua disponível.');});
  return()=>{current=false;};
 },[link,loading,expanded,native]);
 const changed=Boolean(config&&(enabled!==config.enabled||coverage!==config.coverage_note||notice!==config.notice||variableFee!==(config.delivery_fee_cents===null)||!variableFee&&fee!==amount(config.delivery_fee_cents)));
 async function save(event?:FormEvent,rotateToken=false){
  event?.preventDefault();if(lock.current||!config||!canWrite)return;lock.current=true;setBusy(true);report('');setLocalMessage('');
  try{
   const deliveryFee=variableFee?null:parseCents(fee);
   apply(await api<Configuration>('/public-delivery/settings','PUT',{enabled,coverage_note:coverage.trim(),notice:notice.trim(),delivery_fee_cents:deliveryFee,rotate_token:rotateToken}));
   setRotate(false);setError('');const result=rotateToken?'Novo link criado. Substitua os links e QR Codes que já compartilhou.':enabled?'Catálogo ativado. Seus clientes já podem enviar pedidos.':'Preferências salvas. O catálogo está desativado.';setLocalMessage(result);setMessage(result);
  }catch(cause){report((cause as Error).message);}finally{lock.current=false;setBusy(false);}
 }
 async function copy(){if(!canShare)return;try{await navigator.clipboard.writeText(link);setLocalMessage('Link copiado. Você já pode enviar o catálogo aos clientes.');setLocalError('');}catch{linkInput.current?.focus();linkInput.current?.select();report('Selecione e copie o endereço do catálogo no campo abaixo.');}}
 async function share(){if(!canShare)return;if(!navigator.share){await copy();return;}try{await navigator.share({title:'Produtos para seu pet',text:'Escolha os produtos e solicite sua entrega.',url:link});}catch(cause){if((cause as Error).name!=='AbortError')report('Use Copiar link para compartilhar o catálogo.');}}
 return <section className="panel delivery-public-settings"><div className="delivery-public-heading"><div><h2><Link2 size={24}/>Catálogo para os clientes</h2><p>Compartilhe os produtos por link ou QR Code. Cada pedido chega para sua confirmação.</p></div><button type="button" className="ghost-btn" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Ocultar catálogo':'Configurar catálogo'}</button></div>
  {expanded&&<div className="delivery-public-settings-body">{loading?<Empty label="Carregando catálogo..."/>:!config?<div><p role="alert">{error||'Não foi possível carregar as preferências.'}</p><button className="ghost-btn" onClick={()=>void load()}><RefreshCw size={18}/>Tentar novamente</button></div>:<>
   <p className={`delivery-public-state ${canShare?'is-active':''}`}>{canShare?<Check size={19}/>:<Link2 size={19}/>} {canShare?'Catálogo ativo':'Catálogo desativado'}</p>
   {!canWrite&&<p className="delivery-public-notice" role="status">Regularize a assinatura para alterar o catálogo e receber novos pedidos.</p>}
   {(!config.delivery_enabled||config.operation_mode!=='complete')&&<p className="delivery-public-notice">Ative as entregas nas Configurações e escolha a operação com venda de produtos.</p>}
   <div className="delivery-public-settings-grid"><form className="delivery-public-preferences" onSubmit={event=>void save(event)}>
    <label className="delivery-public-check"><input type="checkbox" checked={enabled} disabled={busy||!canWrite||!config.delivery_enabled||config.operation_mode!=='complete'} onChange={event=>setEnabled(event.target.checked)}/><span>Receber pedidos pelo catálogo público</span></label>
    <label>Região de entrega<textarea maxLength={600} rows={3} disabled={busy||!canWrite} placeholder="Informe bairros, cidade ou área atendida." value={coverage} onChange={event=>setCoverage(event.target.value)}/></label>
    <label>Recado para os clientes <span>(opcional)</span><textarea maxLength={600} rows={3} disabled={busy||!canWrite} placeholder="Ex.: Entregamos de segunda a sábado." value={notice} onChange={event=>setNotice(event.target.value)}/></label>
    <fieldset><legend>Taxa de entrega</legend><label className="delivery-public-check"><input type="checkbox" checked={variableFee} disabled={busy||!canWrite} onChange={event=>setVariableFee(event.target.checked)}/><span>Combinar a taxa com cada cliente</span></label>{!variableFee&&<label>Taxa fixa (R$)<input inputMode="decimal" required disabled={busy||!canWrite} placeholder="0,00" value={fee} onChange={event=>setFee(event.target.value)}/></label>}<p className="delivery-public-help">{variableFee?'Antes de confirmar o pedido, combine e registre a taxa, inclusive zero se a entrega for gratuita.':'A taxa será exibida no catálogo e preservada nos pedidos já recebidos.'}</p></fieldset>
    <p className="delivery-public-help">O catálogo mostra os produtos ativos de Produtos e estoque. Produtos sem estoque aparecem indisponíveis.</p><button className="primary-btn" type="submit" disabled={busy||!canWrite||!changed}>{busy?'Salvando...':'Salvar catálogo'}</button>{error&&<p className="delivery-public-error" role="alert">{error}</p>}{message&&<p className="delivery-public-message" role="status">{message}</p>}
   </form><div className="delivery-public-share"><label htmlFor="delivery-catalog-link">Link do seu catálogo<input ref={linkInput} id="delivery-catalog-link" readOnly value={link} onFocus={event=>event.currentTarget.select()}/></label><div className="delivery-public-actions"><button className="primary-btn" disabled={!canShare||busy} onClick={()=>void copy()}><Copy size={18}/>Copiar link</button><button className="ghost-btn" disabled={!canShare||busy} onClick={()=>void share()}><Share2 size={18}/>Compartilhar</button></div><div className="delivery-public-qr"><canvas ref={canvas} role="img" aria-label="QR Code para abrir o catálogo deste pet shop" aria-hidden={!qrReady} style={{display:qrReady?'block':'none'}}/>{!qrReady&&<div><QrCode size={42}/><p>Preparando QR Code...</p></div>}<p>O cliente aponta a câmera do celular para escolher os produtos.</p>{qr&&!native&&canShare&&<a className="ghost-btn" download="petcore-catalogo.png" href={qr}><Download size={18}/>Baixar QR Code</a>}</div><details><summary>Trocar o link do catálogo</summary><p>O link antigo e os QR Codes já impressos deixarão de funcionar. Seus pedidos recebidos serão mantidos.</p><button className="ghost-btn" type="button" disabled={busy||!canWrite} onClick={()=>setRotate(true)}>Criar outro link</button></details></div></div>
  </>}</div>}
  {rotate&&<FormDialog title="Criar outro link do catálogo?" description="Depois da troca, compartilhe o novo link e substitua os QR Codes antigos." busy={busy} error={error} onClose={()=>{if(!busy)setRotate(false);}}><div className="form-actions"><button className="ghost-btn" disabled={busy} onClick={()=>setRotate(false)}>Manter link atual</button><button className="primary-btn" disabled={busy} onClick={()=>void save(undefined,true)}>{busy?'Criando...':'Criar novo link'}</button></div></FormDialog>}
 </section>;
}
