import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Plus,RefreshCw} from 'lucide-react';
import {api,zonedToISO} from './api';
import {calendarWallTime,defaultAppointmentTime,defaultWaitlistAppointmentTime,minimumAppointmentTime,schedulingTimezone,waitlistAppointmentBounds} from './calendarTime';
import FormDialog from './FormDialog';
import {Empty,PageHeader} from './ui';
import './styles/_waitlist.scss';

type Choice={id:string;name:string};
type Service=Choice&{duration_minutes:number};
type Options={tutors:Choice[];pets:(Choice&{tutor_id:string})[];professionals:Choice[];services:Service[];timezone?:string;server_now?:string};
type WaitlistItem={id:string;tutor_id:string;pet_id:string;service_id:string;tutor_name:string;pet_name:string;service_name:string;earliest_at:string;latest_at:string;status:string;notes:string;duration_minutes?:number;service_active?:boolean};
type Opportunity={starts_at:string;ends_at:string;professional_id:string;professional_name:string};
type SearchResult={options:Opportunity[];reason?:'expired'|'service_unavailable'|'no_eligible_professional'|'no_availability';searchedUntil?:string};
type Availability={earliest_at:string;latest_at:string};
type RequestForm=Availability&{tutor_id:string;pet_id:string;service_id:string;notes:string};
type Props={setMessage:(value:string)=>void;setError:(value:string)=>void};
const blankOptions:Options={tutors:[],pets:[],professionals:[],services:[]};

function defaultAvailability(timezone:string,now:number,duration=30):Availability {
  const day=calendarWallTime(now,timezone).slice(0,10);
  let earliest=defaultAppointmentTime(day,timezone,now);
  let latest=`${earliest.slice(0,10)}T18:00`;
  if(Date.parse(zonedToISO(earliest,timezone))+duration*60000>Date.parse(zonedToISO(latest,timezone))){
    const nextDay=new Date(`${earliest.slice(0,10)}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate()+1);
    earliest=`${nextDay.toISOString().slice(0,10)}T09:00`;
    latest=`${earliest.slice(0,10)}T18:00`;
  }
  const ends=Date.parse(zonedToISO(earliest,timezone))+Math.max(duration,30)*60000;
  if(ends>Date.parse(zonedToISO(latest,timezone)))latest=calendarWallTime(ends,timezone);
  return {earliest_at:earliest,latest_at:latest};
}

export default function WaitlistPage({setMessage,setError}:Props) {
  const [rows,setRows]=useState<WaitlistItem[]>([]),[options,setOptions]=useState<Options>(blankOptions),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
  const [dialog,setDialog]=useState<'request'|'availability'|'booking'|'remove'|null>(null),[error,setLocalError]=useState(''),[busy,setBusy]=useState(false),[finding,setFinding]=useState(false),[offering,setOffering]=useState('');
  const [showHistory,setShowHistory]=useState(false);
  const [form,setForm]=useState<RequestForm>({tutor_id:'',pet_id:'',service_id:'',earliest_at:'',latest_at:'',notes:''});
  const [availability,setAvailability]=useState<Availability>({earliest_at:'',latest_at:''});
  const [booking,setBooking]=useState<WaitlistItem|null>(null),[bookingTime,setBookingTime]=useState(''),[searchResult,setSearchResult]=useState<SearchResult|null>(null);
  const [clock,setClock]=useState(Date.now),[clockOffset,setClockOffset]=useState(0);
  const findingRequest=useRef(0),loadRequest=useRef(0);
  const timezone=options.timezone||schedulingTimezone;
  const now=clock+clockOffset;
  const wallTime=(value:string|number)=>calendarWallTime(value,timezone);
  const dateTime=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:timezone,dateStyle:'short',timeStyle:'short'});
  const minimumTime=minimumAppointmentTime(timezone,now);
  const durationFor=(item:WaitlistItem)=>item.duration_minutes??options.services.find(service=>service.id===item.service_id)?.duration_minutes??0;
  const serviceAvailable=(item:WaitlistItem)=>item.service_active!==false&&options.services.some(service=>service.id===item.service_id);
  const boundsFor=(item:WaitlistItem,current=now)=>waitlistAppointmentBounds(item.earliest_at,item.latest_at,durationFor(item),timezone,current);
  const bookingBounds=booking?boundsFor(booking):null;
  const selectedDuration=options.services.find(service=>service.id===form.service_id)?.duration_minutes??0;
  const listed=showHistory?rows:rows.filter(item=>['waiting','offered'].includes(item.status));

  function setDialogError(value:string){setLocalError(value);setError(value);}
  function clearFeedback(){setDialogError('');setMessage('');}
  function shiftedTime(value:string,minutes:number){
    try{return wallTime(Date.parse(zonedToISO(value,timezone))+minutes*60000);}catch{return '';}
  }
  function periodError(period:Availability,duration:number,current=now){
    if(!duration)return 'Escolha um serviço de atendimento ativo.';
    try{
      const start=Date.parse(zonedToISO(period.earliest_at,timezone)),end=Date.parse(zonedToISO(period.latest_at,timezone));
      if(start<=current)return 'Escolha um início futuro para a disponibilidade do tutor.';
      if(end<=start)return 'O fim do período precisa ser posterior ao início.';
      if(end-start<duration*60000)return `O período precisa comportar os ${duration} minutos do serviço.`;
      return '';
    }catch{return 'Informe o início e o fim da disponibilidade do tutor.';}
  }
  function periodIssue(item:WaitlistItem){
    if(!serviceAvailable(item))return 'Este serviço não está mais disponível. Adicione um novo pedido com um serviço ativo.';
    if(Date.parse(item.latest_at)<=now)return 'Este período já encerrou. Atualize a disponibilidade do tutor para buscar horários e confirmar o encaixe.';
    if(!boundsFor(item))return `O período restante não comporta os ${durationFor(item)} minutos do serviço. Atualize a disponibilidade do tutor.`;
    return '';
  }
  function searchMessage(result:SearchResult){
    if(result.reason==='expired')return 'O período já encerrou ou não tem tempo suficiente para o serviço. Atualize a disponibilidade do tutor.';
    if(result.reason==='service_unavailable')return 'Este serviço não está mais disponível. Adicione um novo pedido com um serviço ativo.';
    if(result.reason==='no_eligible_professional')return 'Nenhum profissional disponível está vinculado a este serviço. Confira quem atende esse serviço no cadastro de profissionais.';
    return 'Não encontramos horários livres neste período. Você pode atualizar a disponibilidade do tutor ou informar outro horário dentro dela.';
  }

  async function load() {
    const request=++loadRequest.current;setLoading(true);setLoadError('');
    try{
      const [items,opts]=await Promise.all([api<WaitlistItem[]>('/calendar/waitlist'),api<Options>('/calendar/waitlist/options')]);
      if(request!==loadRequest.current)return;
      const receivedAt=Date.now(),serverTime=Date.parse(opts.server_now||'');
      setRows(items);setOptions(opts);setClock(receivedAt);setClockOffset(Number.isFinite(serverTime)?serverTime-receivedAt:0);setError('');
    }catch(e){if(request===loadRequest.current){setLoadError((e as Error).message);setError((e as Error).message);}}
    finally{if(request===loadRequest.current)setLoading(false);}
  }
  useEffect(()=>{void load();return()=>{findingRequest.current++;loadRequest.current++;};},[]);
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),30000);return()=>window.clearInterval(timer);},[]);
  function closeDialog(){if(busy)return;findingRequest.current++;setFinding(false);setDialog(null);}
  function openRequest(){
    findingRequest.current++;clearFeedback();setClock(Date.now());
    setForm({tutor_id:'',pet_id:'',service_id:'',notes:'',...defaultAvailability(timezone,Date.now()+clockOffset)});
    setDialog('request');
  }
  function openAvailability(item:WaitlistItem){
    findingRequest.current++;setFinding(false);clearFeedback();setBooking(item);setClock(Date.now());
    const current=Date.now()+clockOffset,bounds=boundsFor(item,current);
    setAvailability(bounds?{earliest_at:bounds.min,latest_at:wallTime(item.latest_at)}:defaultAvailability(timezone,current,durationFor(item)||30));
    setDialog('availability');
  }
  function prepareBooking(item:WaitlistItem){
    findingRequest.current++;setFinding(false);clearFeedback();setBooking(item);setSearchResult(null);setClock(Date.now());
    setBookingTime(defaultWaitlistAppointmentTime(item.earliest_at,item.latest_at,durationFor(item),timezone,Date.now()+clockOffset)||'');
    setDialog('booking');
  }
  function prepareRemoval(item:WaitlistItem){
    findingRequest.current++;setFinding(false);clearFeedback();setBooking(item);setDialog('remove');
  }
  async function findOptions(item:WaitlistItem) {
    prepareBooking(item);const request=++findingRequest.current;setFinding(true);
    try{
      const result=await api<SearchResult>(`/calendar/waitlist/${item.id}/opportunities`);
      if(request!==findingRequest.current)return;
      setSearchResult(result);setClock(Date.now());
      if(result.options.length)setBookingTime(wallTime(result.options[0].starts_at));
    }catch(e){if(request===findingRequest.current)setDialogError((e as Error).message);}
    finally{if(request===findingRequest.current)setFinding(false);}
  }
  async function create(event:FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);clearFeedback();
    try{
      const issue=periodError(form,selectedDuration,Date.now()+clockOffset);if(issue)throw Error(issue);
      await api('/calendar/waitlist','POST',{...form,earliest_at:zonedToISO(form.earliest_at,timezone),latest_at:zonedToISO(form.latest_at,timezone)});
      setDialog(null);setError('');setMessage('Pedido incluído na lista de espera.');await load();
    }catch(e){setDialogError((e as Error).message);}finally{setBusy(false);}
  }
  async function saveAvailability(event:FormEvent){
    event.preventDefault();if(busy||!booking)return;setBusy(true);clearFeedback();
    try{
      if(!serviceAvailable(booking))throw Error('Adicione um novo pedido com um serviço ativo.');
      const issue=periodError(availability,durationFor(booking),Date.now()+clockOffset);if(issue)throw Error(issue);
      await api(`/calendar/waitlist/${booking.id}/availability`,'PATCH',{earliest_at:zonedToISO(availability.earliest_at,timezone),latest_at:zonedToISO(availability.latest_at,timezone)});
      setDialog(null);setError('');setMessage('Disponibilidade atualizada. Busque os novos horários para confirmar o encaixe.');await load();
    }catch(e){setDialogError((e as Error).message);}finally{setBusy(false);}
  }
  async function offer(id:string) {
    if(offering)return;setOffering(id);clearFeedback();
    try{await api(`/calendar/waitlist/${id}/offer`,'POST');setError('');setMessage('Oferta marcada internamente. Entre em contato com o tutor; nenhuma mensagem automática foi enviada.');await load();}
    catch(e){setError((e as Error).message);}finally{setOffering('');}
  }
  async function removeRequest(event:FormEvent){
    event.preventDefault();if(busy||!booking)return;setBusy(true);clearFeedback();
    try{
      await api(`/calendar/waitlist/${booking.id}`,'DELETE');
      setDialog(null);setError('');setMessage('Pedido retirado da lista de espera. O histórico foi mantido.');await load();
    }catch(e){setDialogError((e as Error).message);}finally{setBusy(false);}
  }
  const bookingValid=Boolean(booking&&serviceAvailable(booking)&&bookingBounds&&bookingTime>=bookingBounds.min&&bookingTime<=bookingBounds.max);
  async function confirmBooking(event:FormEvent) {
    event.preventDefault();if(busy||!booking)return;setBusy(true);clearFeedback();
    try{
      const start=zonedToISO(bookingTime,timezone),startTime=Date.parse(start),current=Date.now()+clockOffset;
      if(startTime<=current)throw Error('Escolha uma data e um horário futuros para o agendamento.');
      if(!serviceAvailable(booking))throw Error('Adicione um novo pedido com um serviço ativo.');
      if(startTime<Date.parse(booking.earliest_at)||startTime+durationFor(booking)*60000>Date.parse(booking.latest_at))throw Error('Escolha um horário que comporte o serviço dentro da disponibilidade do tutor.');
      await api(`/calendar/waitlist/${booking.id}/book`,'POST',{starts_at:start,tutor_consent:true});
      setDialog(null);setError('');setMessage('Encaixe confirmado e reservado.');await load();
    }catch(e){setDialogError((e as Error).message);}finally{setBusy(false);}
  }

  return <div className="waitlist-page">
    <PageHeader eyebrow="APROVEITE OPORTUNIDADES" title="Lista de espera e encaixes" subtitle="Registre a disponibilidade do tutor, busque um horário e confirme o encaixe." action={<button className="primary-btn" disabled={loading||Boolean(loadError)} onClick={openRequest}><Plus size={17}/>Adicionar à lista</button>}/>
    <section className="panel waitlist-panel">
      <div className="panel-head"><h2>{showHistory?'Solicitações e histórico':'Solicitações ativas'}</h2><div className="waitlist-list-tools"><label className="waitlist-history-toggle"><input type="checkbox" checked={showHistory} onChange={event=>setShowHistory(event.target.checked)}/>Mostrar histórico</label><button className="icon-button" disabled={loading} onClick={()=>void load()} title="Atualizar lista de espera" aria-label="Atualizar lista de espera"><RefreshCw size={18}/></button></div></div>
      {loading?<Empty label="Carregando solicitações..."/>:loadError?<div className="waitlist-notice"><p>Não foi possível carregar a lista de espera.</p><button className="ghost-btn" onClick={()=>void load()}>Tentar novamente</button></div>:listed.length?listed.map(item=>{
        const active=['waiting','offered'].includes(item.status),issue=active?periodIssue(item):'',expired=Date.parse(item.latest_at)<=now,canBook=active&&!issue;
        return <article className="wait-row" key={item.id}>
          <div className="waitlist-request-heading"><strong>{item.pet_name}</strong><span className={`status ${active&&expired?'cancelled':item.status==='booked'?'confirmed':'pending'}`}>{active&&expired?'Período encerrado':item.status==='waiting'?'Aguardando':item.status==='offered'?'Ofertado':item.status==='booked'?'Agendado':'Encerrado'}</span></div>
          <small>{item.tutor_name} · {item.service_name}{durationFor(item)>0?` · ${durationFor(item)} minutos`:''}</small>
          <p className="waitlist-period"><span>Disponibilidade do tutor</span>{dateTime(item.earliest_at)} até {dateTime(item.latest_at)}</p>
          {issue&&<p className="waitlist-notice">{issue}</p>}
          {item.status==='booked'&&<p className="waitlist-hint">O encaixe já foi agendado. Para cancelar o atendimento, use a Agenda.</p>}
          {active&&<div className="action-row">
            {canBook&&item.status==='waiting'&&<button className="ghost-btn" disabled={Boolean(offering)} onClick={()=>void offer(item.id)}>{offering===item.id?'Registrando...':'Registrar oferta'}</button>}
            <button className="ghost-btn" disabled={!canBook} onClick={()=>void findOptions(item)}>Buscar horários</button>
            <button className="primary-btn" disabled={!canBook} onClick={()=>prepareBooking(item)}>Confirmar encaixe</button>
            {serviceAvailable(item)&&<button className="ghost-btn" onClick={()=>openAvailability(item)}>Atualizar período</button>}
            <button className="danger-btn" disabled={Boolean(offering)} onClick={()=>prepareRemoval(item)}>Excluir da lista</button>
          </div>}
        </article>;
      }):<Empty label={!showHistory&&rows.length?'Não há solicitações aguardando encaixe. Ative Mostrar histórico para consultar pedidos agendados ou encerrados.':'Nenhuma solicitação registrada. Adicione o pet e a disponibilidade do tutor para buscar um encaixe.'}/>}
    </section>

    {dialog==='remove'&&booking&&<FormDialog title="Excluir pedido de encaixe?" description={`${booking.pet_name} · ${booking.tutor_name}`} error={error} busy={busy} onClose={closeDialog}>
      <div className="waitlist-dialog"><form className="form-grid" onSubmit={removeRequest}>
        <p className="full-span waitlist-hint">O pedido de {booking.pet_name} será retirado da fila. O histórico será mantido e poderá ser consultado em Mostrar histórico.</p>
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={busy} onClick={closeDialog}>Manter na lista</button><button type="submit" className="danger-btn" disabled={busy}>{busy?'Excluindo...':'Excluir da lista'}</button></div>
      </form></div>
    </FormDialog>}

    {dialog==='request'&&<FormDialog title="Adicionar à lista de espera" description="Informe o pet, o serviço e a disponibilidade do tutor." error={error||loadError} busy={busy} onClose={closeDialog} wide>
      <div className="waitlist-dialog">{loading?<Empty label="Carregando opções..."/>:loadError?<button className="ghost-btn" onClick={()=>void load()}>Tentar carregar opções novamente</button>:<form className="form-grid" onSubmit={create}>
        <label>Cliente<select required disabled={busy} value={form.tutor_id} onChange={e=>setForm({...form,tutor_id:e.target.value,pet_id:''})}><option value="">Selecione um cliente</option>{options.tutors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Pet<select required disabled={busy||!form.tutor_id} value={form.pet_id} onChange={e=>setForm({...form,pet_id:e.target.value})}><option value="">{form.tutor_id?'Selecione um pet':'Escolha o cliente primeiro'}</option>{options.pets.filter(item=>item.tutor_id===form.tutor_id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="full-span">Serviço<select required disabled={busy} value={form.service_id} onChange={e=>setForm({...form,service_id:e.target.value})}><option value="">Selecione um serviço</option>{options.services.map(item=><option key={item.id} value={item.id}>{item.name} · {item.duration_minutes} minutos</option>)}</select></label>
        <label>Disponível a partir de<input type="datetime-local" min={minimumTime} max={selectedDuration?shiftedTime(form.latest_at,-selectedDuration)||undefined:undefined} required disabled={busy} value={form.earliest_at} onChange={e=>setForm({...form,earliest_at:e.target.value})}/></label>
        <label>Disponível até<input type="datetime-local" min={shiftedTime(form.earliest_at,selectedDuration||1)||minimumTime} required disabled={busy} value={form.latest_at} onChange={e=>setForm({...form,latest_at:e.target.value})}/></label>
        <p className="full-span waitlist-hint">Informe um período futuro que comporte o serviço. Quem atende é escolhido automaticamente conforme os serviços e a disponibilidade.</p>
        {form.service_id&&periodError(form,selectedDuration)&&<p className="full-span waitlist-notice" role="status">{periodError(form,selectedDuration)}</p>}
        <label className="full-span">Observações (opcional)<textarea maxLength={1000} disabled={busy} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={busy} onClick={closeDialog}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy||Boolean(periodError(form,selectedDuration))}>{busy?'Salvando...':'Adicionar à lista'}</button></div>
      </form>}</div>
    </FormDialog>}

    {dialog==='availability'&&booking&&<FormDialog title={`Atualizar período de ${booking.pet_name}`} description={`${booking.tutor_name} · ${booking.service_name} · ${durationFor(booking)} minutos`} error={error} busy={busy} onClose={closeDialog}>
      <div className="waitlist-dialog"><form className="form-grid" onSubmit={saveAvailability}>
        <p className="full-span waitlist-hint">Confirme uma nova disponibilidade com o tutor. Ao salvar, o pedido volta a aguardar um encaixe.</p>
        <label>Disponível a partir de<input type="datetime-local" min={minimumTime} max={shiftedTime(availability.latest_at,-durationFor(booking))||undefined} required disabled={busy} value={availability.earliest_at} onChange={e=>setAvailability({...availability,earliest_at:e.target.value})}/></label>
        <label>Disponível até<input type="datetime-local" min={shiftedTime(availability.earliest_at,durationFor(booking))||minimumTime} required disabled={busy} value={availability.latest_at} onChange={e=>setAvailability({...availability,latest_at:e.target.value})}/></label>
        {periodError(availability,durationFor(booking))&&<p className="full-span waitlist-notice" role="status">{periodError(availability,durationFor(booking))}</p>}
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={busy} onClick={closeDialog}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy||Boolean(periodError(availability,durationFor(booking)))}>{busy?'Salvando...':'Salvar disponibilidade'}</button></div>
      </form></div>
    </FormDialog>}

    {dialog==='booking'&&booking&&<FormDialog title={`Confirmar encaixe de ${booking.pet_name}`} description="Confirme a autorização do tutor antes de reservar. A disponibilidade será conferida novamente na confirmação." error={error||loadError} busy={busy} onClose={closeDialog}>
      <div className="waitlist-dialog">
        <p className="waitlist-period"><span>Disponibilidade do tutor · {durationFor(booking)} minutos de serviço</span>{dateTime(booking.earliest_at)} até {dateTime(booking.latest_at)}</p>
        {finding?<Empty label="Buscando horários disponíveis..."/>:loadError?<button className="ghost-btn" onClick={()=>void load()}>Tentar carregar opções novamente</button>:<>
          {searchResult?.options.length?<div className="waitlist-suggestions" aria-label="Horários sugeridos">{searchResult.options.map(item=>{
            const value=wallTime(item.starts_at);
            return <button key={item.starts_at} className={`ghost-btn${bookingTime===value?' selected':''}`} type="button" aria-pressed={bookingTime===value} disabled={busy||!bookingBounds||value<bookingBounds.min||value>bookingBounds.max} onClick={()=>{setBookingTime(value);setDialogError('');}}>{dateTime(item.starts_at)}</button>;
          })}</div>:searchResult?<div className="waitlist-notice" role="status"><p>{searchMessage(searchResult)}</p>{searchResult.searchedUntil&&Date.parse(searchResult.searchedUntil)<Date.parse(booking.latest_at)&&<small>Busca realizada até {dateTime(searchResult.searchedUntil)}.</small>}</div>:<p className="waitlist-hint">Busque horários disponíveis ou informe um horário dentro do período do tutor.</p>}
          {periodIssue(booking)&&!searchResult&&<p className="waitlist-notice" role="status">{periodIssue(booking)}</p>}
          <div className="action-row waitlist-search-actions"><button type="button" className="ghost-btn" disabled={busy||!bookingBounds||!serviceAvailable(booking)} onClick={()=>void findOptions(booking)}><RefreshCw size={15}/>{searchResult||error?'Buscar horários novamente':'Buscar horários'}</button>{serviceAvailable(booking)&&<button type="button" className="text-link" disabled={busy} onClick={()=>openAvailability(booking)}>Atualizar período</button>}</div>
          <form className="form-grid" onSubmit={confirmBooking}>
            <label className="full-span">Data e horário do encaixe<input type="datetime-local" min={bookingBounds?.min||minimumTime} max={bookingBounds?.max} required disabled={busy||!bookingBounds||!serviceAvailable(booking)} value={bookingTime} onChange={e=>{setBookingTime(e.target.value);setDialogError('');}}/></label>
            <p className="full-span waitlist-hint">Quem atende é escolhido automaticamente conforme o serviço e a disponibilidade.</p>
            {bookingBounds&&bookingTime&&!bookingValid&&<p className="full-span waitlist-notice" role="status">Escolha um horário entre {dateTime(zonedToISO(bookingBounds.min,timezone))} e {dateTime(zonedToISO(bookingBounds.max,timezone))}, para que o serviço termine dentro do período do tutor.</p>}
            <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={busy} onClick={closeDialog}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy||!bookingValid}>{busy?'Reservando...':'Confirmo autorização do tutor e reservo'}</button></div>
          </form>
        </>}
      </div>
    </FormDialog>}
  </div>;
}
