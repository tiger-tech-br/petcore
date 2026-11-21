import {useEffect,useRef,useState,type FormEvent} from 'react';
import {CalendarCheck,Check,Clock3,Inbox,RefreshCw,X} from 'lucide-react';
import {api,money} from './api';
import FormDialog from './FormDialog';
import {Empty} from './ui';
import './styles/_public-booking-inbox.scss';

type RequestStatus='pending'|'confirmed'|'rejected';
type BookingRequest={id:string;receipt:string;status:RequestStatus;starts_at:string;ends_at:string;created_at:string;appointment_id:string|null;rejection_reason:string|null;tutor:{name:string;phone:string;email:string};pet:{name:string;species:string;size:string;breed:string};services:{id:string;name:string;price_cents:number;duration_minutes:number}[]};
type Choice={id:string;name:string};
type Options={tutors:Choice[];pets:(Choice&{tutor_id:string})[];timezone?:string};
type Props={setMessage:(value:string)=>void;setError:(value:string)=>void;onChanged:()=>void;writable:boolean};
const labels:Record<RequestStatus,string>={pending:'Aguardando sua confirmação',confirmed:'Confirmado na agenda',rejected:'Não confirmado'};
const sizes:Record<string,string>={pequeno:'Pequeno',medio:'Médio',grande:'Grande'};
const bookingTime=(value:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
const errorText=(cause:unknown)=>cause instanceof Error?cause.message:'Não foi possível concluir agora. Tente novamente.';

export default function PublicBookingInbox({setMessage,setError,onChanged,writable}:Props){
 const [rows,setRows]=useState<BookingRequest[]>([]),[status,setStatus]=useState<RequestStatus|'all'>('pending'),[loading,setLoading]=useState(true),[error,setLocalError]=useState('');
 const [expanded,setExpanded]=useState(false),[pendingTotal,setPendingTotal]=useState(0);
 const [dialog,setDialog]=useState<'confirm'|'reject'|null>(null),[selected,setSelected]=useState<BookingRequest|null>(null),[busy,setBusy]=useState(false),[dialogError,setDialogError]=useState('');
 const [customerMode,setCustomerMode]=useState<'new'|'existing'>('new'),[tutorId,setTutorId]=useState(''),[petId,setPetId]=useState(''),[reason,setReason]=useState('');
 const [options,setOptions]=useState<Options|null>(null),[optionsLoading,setOptionsLoading]=useState(false),[optionsError,setOptionsError]=useState('');
 const loadSequence=useRef(0),dialogSequence=useRef(0),requestLock=useRef(false);
 function report(value:string){setLocalError(value);if(value)setError(value);}
 async function load(nextStatus=status){
  const sequence=++loadSequence.current;setLoading(true);setLocalError('');
  try{const [result,pending]=await Promise.all([api<{items:BookingRequest[]}>(`/public-booking/requests?status=${nextStatus}`),nextStatus==='pending'?Promise.resolve(null):api<{items:BookingRequest[]}>('/public-booking/requests?status=pending')]);if(sequence===loadSequence.current){setRows(result.items);setPendingTotal((pending??result).items.length);}}
  catch(cause){if(sequence===loadSequence.current)report(errorText(cause));}
  finally{if(sequence===loadSequence.current)setLoading(false);}
 }
 useEffect(()=>{void load(status);const refresh=()=>{if(!document.hidden&&!requestLock.current)void load(status);};const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{loadSequence.current++;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};},[status]);
 async function loadOptions(){
  const sequence=dialogSequence.current;setOptionsLoading(true);setOptionsError('');
  try{const result=await api<Options>('/calendar/options');if(sequence===dialogSequence.current)setOptions(result);}
  catch(cause){if(sequence===dialogSequence.current)setOptionsError(errorText(cause));}
  finally{if(sequence===dialogSequence.current)setOptionsLoading(false);}
 }
 function open(request:BookingRequest,kind:'confirm'|'reject'){
  if(!writable||requestLock.current)return;
  dialogSequence.current++;setSelected(request);setDialog(kind);setDialogError('');setCustomerMode('new');setTutorId('');setPetId('');setReason('');setOptions(null);setOptionsError('');setOptionsLoading(false);
 }
 function close(){if(requestLock.current)return;dialogSequence.current++;setDialog(null);setSelected(null);setDialogError('');}
 function chooseCustomer(mode:'new'|'existing'){setCustomerMode(mode);setDialogError('');if(mode==='existing'&&!options&&!optionsLoading)void loadOptions();}
 async function submit(event:FormEvent){
  event.preventDefault();if(requestLock.current||!selected||!dialog)return;
  if(!writable){setDialogError('Regularize a assinatura para confirmar ou recusar pedidos.');return;}
  if(dialog==='confirm'&&customerMode==='existing'&&(!tutorId||!options?.tutors.some(item=>item.id===tutorId))){setDialogError('Escolha o cliente que receberá este agendamento.');return;}
  if(dialog==='confirm'&&petId&&!options?.pets.some(item=>item.id===petId&&item.tutor_id===tutorId)){setDialogError('Escolha um pet do cliente selecionado.');return;}
  requestLock.current=true;setBusy(true);setDialogError('');
  const command=dialog,request=selected;
  const body=command==='reject'?{reason}:customerMode==='existing'?{tutor_id:tutorId,...(petId?{pet_id:petId}:{})}:{};
  try{
   await api(`/public-booking/requests/${request.id}/${command}`,'POST',body);
   dialogSequence.current++;setDialog(null);setSelected(null);
   setMessage(command==='confirm'?`Agendamento de ${request.pet.name} confirmado. Ele já aparece na Agenda.`:`Pedido de ${request.pet.name} marcado como não confirmado.`);
   await load();onChanged();
  }catch(cause){const text=errorText(cause);setDialogError(text);setError(text);}
  finally{requestLock.current=false;setBusy(false);}
 }
 const pendingCount=pendingTotal;
 const visiblePets=options?.pets.filter(item=>item.tutor_id===tutorId)||[];
 return <section className="panel public-booking-inbox" aria-labelledby="public-booking-inbox-title">
  <div className="public-booking-inbox-heading"><div className="public-booking-inbox-title"><span className="public-booking-inbox-icon" aria-hidden="true"><Inbox size={25}/></span><div><h2 id="public-booking-inbox-title">Pedidos dos clientes {!loading&&pendingCount>0&&<span className="public-booking-inbox-count">{pendingCount}</span>}</h2><p>{expanded?'Confira cada pedido recebido pelo seu link antes de colocar na agenda.':loading?'Conferindo pedidos…':pendingCount?`${pendingCount} ${pendingCount===1?'pedido aguardando':'pedidos aguardando'} sua confirmação.`:'Nenhum pedido aguardando confirmação.'}</p></div></div><button type="button" className="ghost-btn" aria-expanded={expanded} aria-controls="public-booking-inbox-content" onClick={()=>setExpanded(value=>!value)}>{expanded?'Ocultar pedidos':'Ver pedidos'}</button></div>
  <div id="public-booking-inbox-content" hidden={!expanded}>
  <div className="public-booking-inbox-toolbar"><label>Mostrar<select value={status} disabled={busy} onChange={event=>setStatus(event.target.value as RequestStatus|'all')}><option value="pending">Aguardando confirmação</option><option value="confirmed">Confirmados</option><option value="rejected">Não confirmados</option><option value="all">Todos os pedidos</option></select></label><button type="button" className="ghost-btn" disabled={loading||busy} onClick={()=>void load()} aria-label="Atualizar pedidos de agendamento"><RefreshCw size={19}/>Atualizar</button>{!writable&&<p role="status">Você pode consultar os pedidos. Regularize a assinatura para confirmar ou recusar.</p>}</div>
  {loading?<Empty label="Carregando pedidos..."/>:error?<div className="public-booking-inbox-error"><p role="alert">{error}</p><button type="button" className="ghost-btn" onClick={()=>void load()}>Tentar novamente</button></div>:!rows.length?<p className="public-booking-inbox-empty">{status==='pending'?'Nenhum pedido aguardando confirmação. Os novos pedidos aparecerão aqui.':'Nenhum pedido nesta situação.'}</p>:<div className="public-booking-request-list">{rows.map(request=><article key={request.id} className="public-booking-request">
   <div className="public-booking-request-top"><strong className="public-booking-request-time"><Clock3 size={20}/><time dateTime={request.starts_at}>{bookingTime(request.starts_at)}</time></strong><span className={`public-booking-request-status is-${request.status}`}>{labels[request.status]}</span></div>
   <div className="public-booking-request-information"><div><h3>{request.pet.name}</h3><p className="public-booking-request-tutor">Cliente: <strong>{request.tutor.name}</strong></p><p>{request.tutor.phone}{request.tutor.email&&<> · {request.tutor.email}</>}</p><p>{[request.pet.species,request.pet.breed,sizes[request.pet.size]||request.pet.size].filter(Boolean).join(' · ')}</p></div><div className="public-booking-request-services"><strong>Serviços solicitados</strong><ul>{request.services.map(service=><li key={service.id}>{service.name}</li>)}</ul><p>{request.services.reduce((total,item)=>total+item.duration_minutes,0)} minutos · {money(request.services.reduce((total,item)=>total+item.price_cents,0))}</p></div></div>
   {request.status==='rejected'&&request.rejection_reason&&<p className="public-booking-rejection"><strong>Motivo registrado:</strong> {request.rejection_reason}</p>}
   {request.status==='pending'&&<div className="public-booking-request-actions"><button type="button" className="primary-btn" disabled={!writable||busy} onClick={()=>open(request,'confirm')} aria-label={`Confirmar pedido de ${request.pet.name}`}><CalendarCheck size={20}/>Confirmar na agenda</button><button type="button" className="ghost-btn public-booking-decline" disabled={!writable||busy} onClick={()=>open(request,'reject')} aria-label={`Recusar pedido de ${request.pet.name}`}><X size={19}/>Não confirmar</button></div>}
  </article>)}</div>}
  </div>
  {dialog&&selected&&<FormDialog title={dialog==='confirm'?`Confirmar pedido de ${selected.pet.name}`:`Não confirmar pedido de ${selected.pet.name}`} description={`${bookingTime(selected.starts_at)} · ${selected.services.map(service=>service.name).join(', ')}`} onClose={close} busy={busy} error={dialogError} wide>
   <form className="public-booking-review-form" onSubmit={event=>void submit(event)}>
    {dialog==='confirm'?<><p>Ao confirmar, o atendimento entra na sua Agenda. Escolha onde salvar o cliente e o pet:</p><fieldset className="public-booking-customer-choice"><legend>Cadastro do cliente</legend><label className={customerMode==='new'?'is-selected':''}><input type="radio" name="booking-customer-mode" checked={customerMode==='new'} disabled={busy} onChange={()=>chooseCustomer('new')}/><span><strong>Cliente novo</strong><span>Cadastrar {selected.tutor.name} e o pet {selected.pet.name}.</span></span></label><label className={customerMode==='existing'?'is-selected':''}><input type="radio" name="booking-customer-mode" checked={customerMode==='existing'} disabled={busy} onChange={()=>chooseCustomer('existing')}/><span><strong>Cliente já cadastrado</strong><span>Escolher o cliente e o pet nos seus cadastros.</span></span></label></fieldset>
     {customerMode==='existing'&&<div className="public-booking-existing-customer">{optionsLoading?<p role="status">Carregando clientes e pets...</p>:optionsError?<div><p role="alert">{optionsError}</p><button type="button" className="ghost-btn" onClick={()=>void loadOptions()}>Tentar novamente</button></div>:options?<><label>Cliente<select required disabled={busy} value={tutorId} onChange={event=>{setTutorId(event.target.value);setPetId('');setDialogError('');}}><option value="">Selecione o cliente</option>{options.tutors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{tutorId&&<><label>Pet deste cliente<select disabled={busy} value={petId} onChange={event=>{setPetId(event.target.value);setDialogError('');}}><option value="">Cadastrar novo pet: {selected.pet.name}</option>{visiblePets.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p>{petId?'O pedido será vinculado ao pet selecionado. Os dados do cadastro atual serão mantidos.':`O pet ${selected.pet.name} será cadastrado para este cliente.`}</p></>}</>:null}</div>}
     <p className="public-booking-review-note">O horário e os valores atuais dos serviços serão conferidos ao confirmar. Avise o cliente sobre o valor final e a confirmação pelo contato informado.</p>
    </>:<><p>Este pedido não será colocado na agenda. Se precisar combinar outro horário, fale com o cliente pelo contato informado.</p><label>Motivo <span>(opcional)</span><textarea rows={3} maxLength={300} disabled={busy} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Ex.: Combinei outro horário com o cliente."/></label><p className="public-booking-review-note">O motivo fica registrado neste pedido. Nenhuma mensagem será enviada automaticamente.</p></>}
    <div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={close}>Voltar</button><button type="submit" className={dialog==='confirm'?'primary-btn':'danger-btn'} disabled={busy||!writable||dialog==='confirm'&&customerMode==='existing'&&(optionsLoading||!options||!tutorId)}>{busy?'Salvando...':dialog==='confirm'?<><Check size={20}/>Confirmar agendamento</>:<>Não confirmar pedido</>}</button></div>
   </form>
  </FormDialog>}
 </section>;
}
