import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,CalendarDays,Check,CheckCircle2,Clock3,PawPrint,UserRound} from 'lucide-react';
import {Brand} from './Brand';
import {money} from './api';
import {calendarWallTime} from './calendarTime';
import LegalScreen from './LegalScreen';
import './styles/_public-booking.scss';

type Service={id:string;name:string;duration_minutes:number;price_cents:number};
type Configuration={businessName:string;timezone:string;services:Service[];notice:string;confirmation_notice:string;horizon_days:number};
type Slot={starts_at:string;ends_at:string};
type Receipt={receipt:string;message:string};
const notice='Seu pedido será confirmado pelo pet shop. O horário só fica reservado depois dessa confirmação.';
const blank={name:'',phone:'',email:'',petName:'',species:'Cachorro',size:'',breed:''};

async function publicApi<T>(path:string,options:RequestInit={}):Promise<T>{
 const response=await fetch(path,{...options,credentials:'omit',headers:{'Content-Type':'application/json','X-PetCore-Request':'1',...options.headers}});
 const data=await response.json().catch(()=>{throw Error('Não foi possível confirmar a resposta. Tente novamente.');});
 if(!response.ok)throw Object.assign(Error(data.error||'Não foi possível carregar o agendamento.'),{status:response.status});
 return data;
}

export default function PublicBookingPage({token}:{token:string}){
 const [config,setConfig]=useState<Configuration|null>(null),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[loadError,setLoadError]=useState('');
 const [selected,setSelected]=useState<string[]>([]),[date,setDate]=useState(''),[slots,setSlots]=useState<Slot[]>([]),[slotsBusy,setSlotsBusy]=useState(false),[slotsError,setSlotsError]=useState(''),[slotsRevision,setSlotsRevision]=useState(0),[start,setStart]=useState('');
 const [step,setStep]=useState(1),[draft,setDraft]=useState(blank),[website,setWebsite]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[receipt,setReceipt]=useState<Receipt|null>(null),[legal,setLegal]=useState<'terms'|'privacy'|null>(null);
 const heading=useRef<HTMLHeadingElement>(null),attempt=useRef<{body:unknown}|null>(null);
 const base=`/api/public/booking/${encodeURIComponent(token)}`;
 useEffect(()=>{
  setSelected([]);setDate('');setStep(1);setDraft(blank);setReceipt(null);setError('');setUncertain(false);attempt.current=null;
 },[base]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setLoadError('');
  publicApi<Configuration>(base,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])}).then(value=>{if(!controller.signal.aborted){setConfig(value);setDate(current=>current||calendarWallTime(Date.now(),value.timezone).slice(0,10));}}).catch(cause=>{if(!controller.signal.aborted)setLoadError(cause.status===404?'Este link de agendamento não está disponível. Entre em contato com o pet shop.':cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[base,revision]);
 const selectionKey=[...selected].sort().join(',');
 useEffect(()=>{
  setStart('');setSlots([]);setSlotsError('');setSlotsBusy(false);if(!date||!selectionKey)return;
  const controller=new AbortController();setSlotsBusy(true);
  publicApi<{slots:Slot[]}>(`${base}/slots?${new URLSearchParams({date,service_ids:selectionKey})}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])}).then(value=>{if(!controller.signal.aborted)setSlots(value.slots);}).catch(cause=>{if(!controller.signal.aborted)setSlotsError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setSlotsBusy(false);});
  return()=>controller.abort();
 },[base,date,selectionKey,slotsRevision]);
 useEffect(()=>{if(!loading&&!legal)heading.current?.focus();},[step,receipt,loading,legal]);
 const chosen=config?.services.filter(service=>selected.includes(service.id))??[];
 const total=chosen.reduce((sum,item)=>sum+item.price_cents,0),duration=chosen.reduce((sum,item)=>sum+item.duration_minutes,0);
 const zone=config?.timezone??'America/Sao_Paulo',minimum=calendarWallTime(Date.now(),zone).slice(0,10);
 const last=new Date(minimum+'T12:00:00Z');last.setUTCDate(last.getUTCDate()+(config?.horizon_days??90));
 const maximum=last.toISOString().slice(0,10),locked=busy||uncertain;
 const time=(value:string)=>new Date(value).toLocaleTimeString('pt-BR',{timeZone:zone,hour:'2-digit',minute:'2-digit'});
 const day=(value:string)=>new Date(value).toLocaleDateString('pt-BR',{timeZone:zone,weekday:'long',day:'2-digit',month:'long'});
 function change(field:keyof typeof blank,value:string){setDraft(current=>({...current,[field]:value}));}
 async function submit(event:FormEvent){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   if(!attempt.current)attempt.current={body:{tutor:{name:draft.name.trim(),phone:draft.phone.trim(),...(draft.email.trim()?{email:draft.email.trim()}:{})},pet:{name:draft.petName.trim(),species:draft.species,size:draft.size,...(draft.breed.trim()?{breed:draft.breed.trim()}:{})},service_ids:selected,starts_at:start,idempotency_key:crypto.randomUUID(),website}};
   const saved=await publicApi<Receipt>(`${base}/requests`,{method:'POST',body:JSON.stringify(attempt.current.body),signal:AbortSignal.timeout(25000)});
   if(!saved.receipt)throw Error('Resposta sem confirmação.');
   setReceipt(saved);setUncertain(false);attempt.current=null;
  }catch(cause){
   const failure=cause as Error&{status?:number};
   if(!uncertain&&failure.status&&failure.status>=400&&failure.status<500&&failure.status!==408){attempt.current=null;setUncertain(false);setError(failure.message);}
   else{setUncertain(true);setError('Não conseguimos confirmar o envio. Toque em “Verificar pedido” para conferir sem enviar duas vezes.');}
  }finally{setBusy(false);}
 }
 if(legal)return <LegalScreen kind={legal} onBack={()=>setLegal(null)}/>;
 return <div className="public-booking-page"><header className="public-booking-header"><Brand/><span>Agendamento on-line</span></header><main className="public-booking-main">
  {loading?<div className="public-booking-state" role="status"><CalendarDays size={36}/><h1>Carregando a agenda…</h1></div>:loadError||!config?<div className="public-booking-state" role="alert"><CalendarDays size={36}/><h1>Vamos conferir seu link</h1><p>{loadError}</p><button className="ghost-btn" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button></div>:receipt?<section className="public-booking-success"><CheckCircle2 size={52}/><h1 ref={heading} tabIndex={-1}>Pedido enviado!</h1><p>Agora aguarde a confirmação de <strong>{config.businessName}</strong>.</p><div className="public-booking-summary"><strong>{draft.petName}</strong><span>{day(start)} às {time(start)}</span><span>{chosen.map(item=>item.name).join(' + ')}</span></div><p>{receipt.message||notice}</p><p className="public-booking-receipt">Protocolo do pedido: <strong>{receipt.receipt}</strong></p><p>Para alterar ou cancelar o pedido, fale diretamente com o pet shop e informe o protocolo.</p></section>:<>
   <div className="public-booking-intro"><p className="eyebrow">{config.businessName}</p><h1 ref={heading} tabIndex={-1}>{step===1?'Vamos agendar seu pet?':'Quem vamos atender?'}</h1><p>{step===1?'Escolha os serviços e um horário disponível.':'Informe seus dados de contato e o nome do pet.'}</p><ol className="public-booking-steps" aria-label="Etapas do agendamento"><li aria-current={step===1?'step':undefined}><span>{step>1?<Check size={16}/>:1}</span>Serviço e horário</li><li aria-current={step===2?'step':undefined}><span>2</span>Você e seu pet</li></ol></div>
   <div className="public-booking-notice" role="note"><Clock3 size={22}/><p>{config.confirmation_notice||notice}</p></div>
   {config.notice&&<p className="public-booking-shop-notice">{config.notice}</p>}
   {step===1?<section className="public-booking-card">
    <fieldset className="public-booking-services"><legend>Quais serviços você precisa?</legend>{config.services.length?config.services.map(service=><label key={service.id} className={selected.includes(service.id)?'selected':''}><input type="checkbox" checked={selected.includes(service.id)} disabled={selected.length>=12&&!selected.includes(service.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,service.id]:current.filter(id=>id!==service.id))}/><span><strong>{service.name}</strong><span>{service.duration_minutes} minutos</span></span><strong>{money(service.price_cents)}</strong></label>):<p>O pet shop ainda está preparando os serviços para agendamento. Entre em contato diretamente com ele.</p>}{selected.length>=12&&<p role="status">Você pode escolher até 12 serviços por pedido.</p>}</fieldset>
    {chosen.length>0&&<><div className="public-booking-total"><span>{duration} minutos</span><strong>Valor informado: {money(total)}</strong></div><label className="public-booking-date">Qual dia fica melhor?<input type="date" min={minimum} max={maximum} required value={date} onChange={e=>setDate(e.target.value)}/></label><fieldset className="public-booking-times" aria-busy={slotsBusy}><legend>Horários disponíveis</legend><p>Horário local do pet shop. Quem atende é definido pela disponibilidade da equipe.</p>{slotsBusy?<p role="status">Conferindo horários…</p>:slotsError?<div role="alert"><p>{slotsError}</p><button className="text-link" onClick={()=>setSlotsRevision(value=>value+1)}>Conferir novamente</button></div>:slots.length?<div className="public-booking-time-grid">{slots.map(slot=><button key={slot.starts_at} type="button" className={start===slot.starts_at?'selected':''} aria-pressed={start===slot.starts_at} onClick={()=>setStart(slot.starts_at)}>{time(slot.starts_at)}</button>)}</div>:<p>Nenhum horário disponível neste dia. Escolha outra data ou fale com o pet shop.</p>}</fieldset></>}
    <div className="public-booking-actions"><button className="primary-btn" disabled={!start||!selected.length||slotsBusy} onClick={()=>{setError('');setStep(2);}}>Continuar<ArrowRight size={20}/></button></div>
   </section>:<form className="public-booking-card" onSubmit={submit}>
    <div className="public-booking-summary"><span><CalendarDays size={20}/>{day(start)} às {time(start)}</span><strong>{chosen.map(item=>item.name).join(' + ')}</strong><span>{duration} minutos · {money(total)}</span><button type="button" className="text-link" disabled={locked} onClick={()=>setStep(1)}>Alterar serviço ou horário</button></div>
    <fieldset className="public-booking-fields" disabled={locked}><legend><UserRound size={22}/>Responsável pelo pet</legend><label>Seu nome *<input autoComplete="name" required minLength={2} maxLength={160} value={draft.name} onChange={e=>change('name',e.target.value)} placeholder="Nome e sobrenome"/></label><label>Telefone / WhatsApp *<input type="tel" inputMode="tel" autoComplete="tel" required maxLength={40} value={draft.phone} onChange={e=>change('phone',e.target.value)} placeholder="(11) 99999-9999"/></label><label>E-mail (opcional)<input type="email" autoComplete="email" maxLength={255} value={draft.email} onChange={e=>change('email',e.target.value)} placeholder="voce@exemplo.com"/></label></fieldset>
    <fieldset className="public-booking-fields" disabled={locked}><legend><PawPrint size={22}/>Dados do pet</legend><label>Nome do pet *<input required maxLength={160} value={draft.petName} onChange={e=>change('petName',e.target.value)} placeholder="Ex.: Luna"/></label><label>Espécie *<select value={draft.species} onChange={e=>change('species',e.target.value)}><option>Cachorro</option><option>Gato</option><option>Outro animal</option></select></label><label>Porte *<select required value={draft.size} onChange={e=>change('size',e.target.value)}><option value="">Selecione o porte</option><option value="pequeno">Pequeno</option><option value="medio">Médio</option><option value="grande">Grande</option></select></label><label>Raça (opcional)<input maxLength={160} value={draft.breed} onChange={e=>change('breed',e.target.value)} placeholder="Ex.: Shih-tzu ou sem raça definida"/></label></fieldset>
    <div className="public-booking-trap" aria-hidden="true"><label>Site<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label></div>
    <p className="public-booking-privacy">Seus dados serão usados pelo pet shop para atender este pedido. Consulte a <button type="button" className="text-link" onClick={()=>setLegal('privacy')}>Política de Privacidade</button> e os <button type="button" className="text-link" onClick={()=>setLegal('terms')}>Termos de Uso</button>. Este formulário não autoriza mensagens de publicidade.</p>
    {error&&<div className="public-booking-error" role="alert">{error}</div>}
    <div className="public-booking-actions"><button type="button" className="ghost-btn" disabled={locked} onClick={()=>setStep(1)}><ArrowLeft size={18}/>Voltar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Enviando…':uncertain?'Verificar pedido':'Enviar pedido de agendamento'}<ArrowRight size={18}/></button></div>
   </form>}
  </>}
 </main><footer className="public-booking-footer">Agendamento com PetCore · A confirmação é feita pelo pet shop.</footer></div>;
}
