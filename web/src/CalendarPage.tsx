import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, Clock3, Plus, RefreshCw, Truck} from 'lucide-react';
import {api, money, today, zonedToISO} from './api';
import {calendarWallTime,defaultAppointmentTime,minimumAppointmentTime,schedulingTimezone} from './calendarTime';
import FormDialog from './FormDialog';
import {Empty, PageHeader, Status} from './ui';
import TaxiDogFields from './TaxiDogFields';
import {emptyTaxiForm,taxiDraftFromForm,taxiFormFromBooking,taxiModeLabel,type TaxiBooking,type TaxiForm,type TaxiOptions} from './taxiDog';

type Choice = {id:string; name:string};
type Service = Choice & {price_cents:number; duration_minutes:number};
type Options = {tutors:Choice[]; pets:(Choice & {tutor_id:string})[]; professionals:Choice[]; services:Service[];timezone?:string;server_now?:string;taxi_dog?:TaxiOptions};
type Appointment = {
  id:string; tutor_name:string; pet_name:string; professional_id:string;
  professional_name:string; starts_at:string; status:string; services:Service[];
  taxi_dog?:{id:string;mode:'pickup'|'dropoff'|'round_trip';service_name:string;price_cents:number;cancelled_at:string|null;status:string}|null;
};
type AppointmentForm = {tutor_id:string; pet_id:string; professional_id:string; service_ids:string[]; starts_at:string; notes:string};
type HistoryRow = {id:string; created_at:string; actor_name:string; kind:string; reason?:string};

// A API conserva os códigos de evento; somente a apresentação utiliza nomes em português.
const historyKindLabels:Record<string,string> = {
  created:'Agendamento criado',
  waitlist_booking:'Encaixe pela lista de espera',
  reschedule:'Atendimento reagendado',
  anticipate:'Atendimento antecipado',
  confirmed:'Atendimento confirmado',
  in_progress:'Atendimento iniciado',
  done:'Atendimento concluído',
  cancelled:'Atendimento cancelado',
  no_show:'Falta registrada'
};
const historyKindLabel = (kind:string):string => historyKindLabels[kind] ?? 'Alteração registrada';
type Move = 'reschedule'|'anticipate';
type Step = 'details'|'move'|'history'|'taxi';
export type SetupTarget = 'services'|'professionals'|'tutors'|'pets';
type Props = {setMessage:(value:string)=>void; setError:(value:string)=>void; initialNew?:boolean; searchQuery?:string; onSetup?:(target:SetupTarget)=>void; canSetup?:(target:SetupTarget)=>boolean; canTaxiDog?:boolean;onSaved?:()=>void};
const blankOptions:Options = {tutors:[], pets:[], professionals:[], services:[]};
const newForm = (date:string,timezone=schedulingTimezone,now=Date.now()):AppointmentForm => ({tutor_id:'', pet_id:'', professional_id:'', service_ids:[], starts_at:defaultAppointmentTime(date,timezone,now), notes:''});

export default function CalendarPage({setMessage, setError, initialNew=false, searchQuery='', onSetup, canSetup, canTaxiDog=false, onSaved}:Props) {
  const [date,setDate] = useState(today());
  const [mode,setMode] = useState<'day'|'week'>('day');
  const [professionalFilter,setProfessionalFilter] = useState('');
  const [rows,setRows] = useState<Appointment[]>([]);
  const [options,setOptions] = useState<Options>(blankOptions);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState('');
  const [showForm,setShowForm] = useState(initialNew);
  const [form,setForm] = useState<AppointmentForm>(()=>newForm(today()));
  const [selected,setSelected] = useState<Appointment|null>(null);
  const [step,setStep] = useState<Step>('details');
  const [move,setMove] = useState<Move>('reschedule');
  const [newTime,setNewTime] = useState('');
  const [newProfessional,setNewProfessional] = useState('');
  const [reason,setReason] = useState('');
  const [consent,setConsent] = useState(false);
  const [historyRows,setHistoryRows] = useState<HistoryRow[]>([]);
  const [historyLoading,setHistoryLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [dialogError,setDialogErrorState] = useState('');
  const [clock,setClock] = useState(Date.now);
  const [clockOffset,setClockOffset] = useState(0);
  const [taxiForm,setTaxiForm]=useState<TaxiForm>(()=>emptyTaxiForm(defaultAppointmentTime(today()),schedulingTimezone));
  const [taxiBooking,setTaxiBooking]=useState<TaxiBooking|null>(null),[taxiLoading,setTaxiLoading]=useState(false),[taxiLoaded,setTaxiLoaded]=useState(false);
  const taxiRequest=useRef(0);
  const loadRequest = useRef(0);
  const historyRequest = useRef(0);
  const initializedOptions = useRef(false);
  const initialDate = useRef(date);
  const timezone=options.timezone||schedulingTimezone;
  const taxiOptions=options.taxi_dog||{enabled:false,services:[],drivers:[]};
  const taxiAllowed=canTaxiDog&&taxiOptions.can_manage!==false;
  const taxiAvailable=taxiAllowed&&taxiOptions.enabled;
  const minimumTime=minimumAppointmentTime(timezone,clock+clockOffset);
  const dateTime=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:timezone,dateStyle:'short',timeStyle:'short'});

  function setDialogError(value:string) {
    setDialogErrorState(value);
    if(value) setError(value);
  }

  async function load() {
    const request = ++loadRequest.current;
    setLoading(true); setLoadError('');
    try {
      const lastDay=new Date(`${date}T12:00:00Z`);lastDay.setUTCDate(lastDay.getUTCDate()+(mode==='week'?7:1));
      const from = encodeURIComponent(zonedToISO(`${date}T00:00`,timezone)), to = encodeURIComponent(zonedToISO(`${lastDay.toISOString().slice(0,10)}T00:00`,timezone));
      const [items,opts] = await Promise.all([
        api<Appointment[]>(`/calendar/appointments?from=${from}&to=${to}`),
        api<Options>('/calendar/options')
      ]);
      if (request===loadRequest.current) {
        const receivedAt=Date.now(),serverTime=Date.parse(opts.server_now||'');
        const now=Number.isFinite(serverTime)?serverTime:receivedAt;
        setRows(items);setOptions(opts);setClock(receivedAt);setClockOffset(now-receivedAt);
        if(!initializedOptions.current){
          initializedOptions.current=true;
          const businessTimezone=opts.timezone||schedulingTimezone;
          const businessDay=calendarWallTime(now,businessTimezone).slice(0,10);
          setDate(current=>current===initialDate.current?businessDay:current);
          setForm(current=>({...current,starts_at:defaultAppointmentTime(businessDay,businessTimezone,now)}));
          setTaxiForm(current=>current.enabled?current:emptyTaxiForm(defaultAppointmentTime(businessDay,businessTimezone,now),businessTimezone));
        }
      }
    } catch (error) {
      if (request===loadRequest.current) {setLoadError((error as Error).message); setError((error as Error).message);}
    } finally {
      if (request===loadRequest.current) setLoading(false);
    }
  }
  useEffect(()=>{void load(); return ()=>{loadRequest.current++;};},[date,mode,timezone]);
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),30000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{if(initialNew) openNew();},[initialNew]);
  useEffect(()=>()=>{historyRequest.current++;taxiRequest.current++;},[]);

  const listed = rows.filter(item=>(!professionalFilter||item.professional_id===professionalFilter)&&
    (!searchQuery||[item.pet_name,item.tutor_name,item.professional_name].join(' ').toLocaleLowerCase('pt-BR').includes(searchQuery.toLocaleLowerCase('pt-BR'))));
  const pets = options.pets.filter(pet=>pet.tutor_id===form.tutor_id);
  const selectedServices = options.services.filter(service=>form.service_ids.includes(service.id));
  const duration = selectedServices.reduce((sum,service)=>sum+service.duration_minutes,0);
  useEffect(()=>{
    if(!showForm)return;
    setTaxiForm(current=>{
      if(current.enabled)return current;
      const suggested=emptyTaxiForm(form.starts_at,timezone,duration);
      return {...current,pickup:{...suggested.pickup,driver_id:current.pickup.driver_id},dropoff:{...suggested.dropoff,driver_id:current.dropoff.driver_id}};
    });
  },[showForm,form.starts_at,duration,timezone]);

  function openNew() {
    historyRequest.current++;
    taxiRequest.current++;setTaxiLoading(false);setTaxiBooking(null);
    const next=newForm(date,timezone,Date.now()+clockOffset);
    setSelected(null); setStep('details'); setDialogError(''); setForm(next);setTaxiForm(emptyTaxiForm(next.starts_at,timezone)); setClock(Date.now());setShowForm(true);
  }
  function openDetails(item:Appointment) {
    historyRequest.current++;
    taxiRequest.current++;setTaxiLoading(false);setTaxiBooking(null);
    setShowForm(false); setSelected(item); setStep('details'); setHistoryRows([]); setDialogError('');
  }
  function closeNew() {if(!saving){setShowForm(false); setDialogError('');}}
  function prepareSetup(target:SetupTarget) {
    if(saving||!onSetup||!canSetup?.(target)) return;
    closeNew();
    onSetup(target);
  }
  function closeDetails() {
    if(saving) return;
    historyRequest.current++;
    taxiRequest.current++;setTaxiLoading(false);
    setSelected(null); setStep('details'); setDialogError('');
  }
  function backToDetails() {
    historyRequest.current++;
    taxiRequest.current++;setTaxiLoading(false);
    setStep('details'); setDialogError(''); setHistoryLoading(false);
  }
  async function showSavedAppointment(wall:string,professionalId:string) {
    const savedDate=wall.slice(0,10);
    setProfessionalFilter(current=>current&&current!==professionalId?'':current);
    if(savedDate===date) {
      await load();
      return;
    }
    // Invalida imediatamente a consulta do período anterior. O efeito da nova
    // data carrega a lista correta sem reutilizar o fechamento da data antiga.
    loadRequest.current++;
    setRows([]); setLoading(true); setLoadError('');
    setDate(savedDate);
  }

  async function create(event:FormEvent) {
    event.preventDefault(); if(saving) return;
    setSaving(true); setDialogError('');
    try {
      const start=zonedToISO(form.starts_at,timezone);
      if(Date.parse(start)<=Date.now()+clockOffset)throw Error('Escolha uma data e um horário futuros para o agendamento.');
      await api('/calendar/appointments','POST',{...form,starts_at:start,...(taxiAvailable?{taxi_dog:taxiDraftFromForm(taxiForm,taxiOptions.services,timezone)}:{})});
      setMessage('Atendimento agendado e gravado no banco.'); setShowForm(false);
      onSaved?.();
      await showSavedAppointment(form.starts_at,form.professional_id);
    } catch (error) {setDialogError((error as Error).message);} finally {setSaving(false);}
  }
  async function changeStatus(id:string,next:string) {
    if(saving) return;
    setSaving(true); setDialogError('');
    try {
      await api(`/calendar/appointments/${id}/status`,'POST',{status:next,reason:''});
      setMessage('Situação do atendimento atualizada.'); setSelected(null); setStep('details'); await load();
    } catch (error) {setDialogError((error as Error).message);} finally {setSaving(false);}
  }
  async function readTaxi(item:Appointment){
    const request=++taxiRequest.current;setTaxiLoading(true);setTaxiLoaded(false);setTaxiBooking(null);
    try{const result=await api<{booking:TaxiBooking|null}>(`/taxi-dog/appointments/${item.id}`);if(request!==taxiRequest.current)return;setTaxiBooking(result.booking);setTaxiForm(taxiFormFromBooking(result.booking,calendarWallTime(item.starts_at,timezone),timezone,item.services.reduce((sum,service)=>sum+service.duration_minutes,0)));setTaxiLoaded(true);}
    catch(error){if(request===taxiRequest.current)setDialogError((error as Error).message);}finally{if(request===taxiRequest.current)setTaxiLoading(false);}
  }
  async function organizeTaxi(){if(!selected)return;setStep('taxi');setDialogError('');await readTaxi(selected);}
  async function saveTaxi(event:FormEvent){
    event.preventDefault();if(!selected||saving||taxiLoading||!taxiLoaded)return;setSaving(true);setDialogError('');
    try{await api(`/taxi-dog/appointments/${selected.id}`,'PUT',{taxi_dog:taxiDraftFromForm(taxiForm,taxiOptions.services,timezone,taxiBooking)});setSelected(null);setStep('details');setMessage(taxiForm.enabled?'Transporte reservado com horários próprios para o motorista.':'Planejamento de transporte cancelado.');await load();}catch(error){setDialogError((error as Error).message);}finally{setSaving(false);}
  }
  async function startMove(next:Move) {
    if(!selected) return;
    const now=Date.now()+clockOffset;
    setMove(next); setNewTime(Date.parse(selected.starts_at)>now?calendarWallTime(selected.starts_at,timezone):defaultAppointmentTime('',timezone,now)); setNewProfessional(selected.professional_id);setClock(Date.now());
    setReason(''); setConsent(false); setDialogError(''); setStep('move');
    setTaxiForm(emptyTaxiForm(selected.starts_at,timezone,selected.services.reduce((sum,service)=>sum+service.duration_minutes,0)));setTaxiBooking(null);
    if(taxiAvailable)await readTaxi(selected);
  }
  async function saveMove(event:FormEvent) {
    event.preventDefault(); if(saving||!selected||taxiAvailable&&!taxiLoaded) return;
    setSaving(true); setDialogError('');
    try {
      const start=zonedToISO(newTime,timezone);
      if(Date.parse(start)<=Date.now()+clockOffset)throw Error('Escolha uma data e um horário futuros para o agendamento.');
      await api(`/calendar/appointments/${selected.id}/move`,'POST',{
        mode:move,starts_at:start,professional_id:newProfessional,reason,tutor_consent:consent,
        ...(taxiAvailable&&taxiBooking?.editable!==false?{taxi_dog:taxiDraftFromForm(taxiForm,taxiOptions.services,timezone,taxiBooking)}:{})
      });
      setSelected(null); setStep('details');
      setMessage(move==='anticipate'?'Atendimento antecipado com autorização registrada.':'Agendamento reagendado; horário anterior liberado.');
      onSaved?.();
      await showSavedAppointment(newTime,newProfessional);
    } catch (error) {setDialogError((error as Error).message);} finally {setSaving(false);}
  }
  async function showHistory() {
    if(!selected) return;
    const request = ++historyRequest.current;
    setStep('history'); setHistoryRows([]); setHistoryLoading(true); setDialogError('');
    try {
      const items = await api<HistoryRow[]>(`/calendar/appointments/${selected.id}/history`);
      if(request===historyRequest.current) setHistoryRows(items);
    } catch (error) {
      if(request===historyRequest.current) setDialogError((error as Error).message);
    } finally {
      if(request===historyRequest.current) setHistoryLoading(false);
    }
  }

  const detailsTitle = selected ? step==='move'
    ? `${move==='anticipate'?'Antecipar':'Reagendar'} atendimento de ${selected.pet_name}`
    : step==='history' ? `Histórico de ${selected.pet_name}` : step==='taxi'?`Táxi Dog de ${selected.pet_name}`:`Atendimento de ${selected.pet_name}` : '';
  const setupNeeds:{target:SetupTarget;missing:boolean;description:string;button:string}[]=[
    {target:'services',missing:!options.services.length,description:'serviços com preço e duração',button:'Ir para Serviços'},
    {target:'professionals',missing:!options.professionals.length,description:'um profissional com jornada e serviços habilitados',button:'Ir para Profissionais'},
    {target:'tutors',missing:!options.tutors.length,description:'o cliente (tutor responsável)',button:'Ir para Clientes'},
    {target:'pets',missing:!options.pets.length,description:'o pet vinculado ao cliente',button:'Ir para Pets'}
  ];
  const missingSetup=setupNeeds.filter(item=>item.missing);
  const nextSetup=missingSetup[0];

  return <div className="calendar-page">
    <PageHeader eyebrow="ROTINA DE ATENDIMENTOS" title="Agenda de atendimentos"
      subtitle="Organize horários, serviços e profissionais sem conflitos de reserva."
      action={<button className="primary-btn" onClick={openNew} aria-haspopup="dialog"><Plus size={17}/>Novo agendamento</button>}/>
    <div className="panel calendar-panel">
      <div className="list-tools calendar-tools">
        <div className="calendar-period-filter"><span>Visualização</span><div className="segmented" aria-label="Período da agenda"><button className={mode==='day'?'chosen':''} aria-pressed={mode==='day'} onClick={()=>setMode('day')}>Dia</button><button className={mode==='week'?'chosen':''} aria-pressed={mode==='week'} onClick={()=>setMode('week')}>Semana</button></div></div>
        <label className="date-select">Data <input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label>
        <label className="calendar-professional-filter">Profissional<select aria-label="Filtrar por profissional" value={professionalFilter} onChange={event=>setProfessionalFilter(event.target.value)}><option value="">Todos</option>{options.professionals.map(professional=><option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>
        <button className="icon-button calendar-refresh" onClick={load} title="Atualizar agenda" aria-label="Atualizar agenda" disabled={loading}><RefreshCw size={18}/></button>
      </div>
      {loading?<Empty label="Consultando a agenda..."/>:loadError?<div className="business-setup-hint"><p>Não foi possível consultar a agenda. Tente carregar novamente antes de criar um atendimento.</p><button type="button" className="text-link" onClick={()=>void load()}>Tentar novamente</button></div>:listed.length?<div className="appointment-list">{listed.map(item=><button key={item.id} className={`appointment-line ${selected?.id===item.id?'selected':''}`} onClick={()=>openDetails(item)} aria-haspopup="dialog">
        <div className="appointment-time"><Clock3 size={16}/>{new Date(item.starts_at).toLocaleTimeString('pt-BR',{timeZone:timezone,hour:'2-digit',minute:'2-digit'})}</div>
        <div className="appointment-detail"><strong>{item.pet_name}</strong><span className="calendar-client"><span className="calendar-detail-label">Cliente:</span> {item.tutor_name}</span><small><span className="calendar-detail-label">Serviços:</span> {item.services.map(service=>service.name).join(' + ')}</small><small><span className="calendar-detail-label">Profissional:</span> {item.professional_name}</small>{item.taxi_dog&&!item.taxi_dog.cancelled_at&&<small className="taxi-calendar-summary"><Truck size={16}/>Táxi Dog · {taxiModeLabel(item.taxi_dog.mode)}</small>}</div>
        <Status status={item.status}/>
      </button>)}</div>:<Empty label={missingSetup.length?`Antes do primeiro agendamento, cadastre ${missingSetup.map(item=>item.description).join('; ')}. Abra Novo agendamento para ver por onde começar.`:'Não há atendimentos no período selecionado. Use Novo agendamento para reservar um horário.'}/>}
    </div>

    {selected&&<FormDialog title={detailsTitle} description={`${selected.tutor_name} · ${selected.professional_name} · ${dateTime(selected.starts_at)}`} onClose={closeDetails} busy={saving} error={dialogError} wide>
      {step==='details'&&<>
        <Status status={selected.status}/>
        <p className="calendar-detail-description">{selected.services.map(service=>service.name).join(' + ')} · {selected.services.reduce((sum,service)=>sum+service.duration_minutes,0)} minutos</p>
        {selected.taxi_dog&&!selected.taxi_dog.cancelled_at&&<p className="taxi-calendar-summary"><Truck size={18}/>{selected.taxi_dog.service_name} · {taxiModeLabel(selected.taxi_dog.mode)} · {money(selected.taxi_dog.price_cents)}</p>}
        <div className="action-row calendar-detail-actions">
          {selected.status==='pending'&&<button type="button" className="primary-btn" disabled={saving} onClick={()=>changeStatus(selected.id,'confirmed')}>Confirmar</button>}
          {selected.status==='confirmed'&&<button type="button" className="primary-btn" disabled={saving} onClick={()=>changeStatus(selected.id,'in_progress')}>Iniciar atendimento</button>}
          {selected.status==='in_progress'&&<button type="button" className="primary-btn" disabled={saving} onClick={()=>changeStatus(selected.id,'done')}>Concluir atendimento</button>}
          {['pending','confirmed'].includes(selected.status)&&<>
            <button type="button" className="ghost-btn" disabled={saving} onClick={()=>startMove('reschedule')}>Reagendar</button>
            <button type="button" className="ghost-btn" disabled={saving} onClick={()=>startMove('anticipate')}>Antecipar</button>
            <button type="button" className="ghost-btn" disabled={saving} onClick={()=>changeStatus(selected.id,'no_show')}>Registrar falta</button>
          </>}
          {['pending','confirmed','in_progress'].includes(selected.status)&&<button type="button" className="danger-btn" disabled={saving} onClick={()=>{if(confirm('Deseja cancelar este atendimento?')) void changeStatus(selected.id,'cancelled');}}>Cancelar atendimento</button>}
          <button type="button" className="ghost-btn" disabled={saving} onClick={showHistory}>Ver histórico</button>
          {taxiAllowed&&(taxiOptions.enabled||selected.taxi_dog)&&<button type="button" className="ghost-btn" disabled={saving} onClick={()=>void organizeTaxi()}><Truck size={18}/>{selected.taxi_dog?'Ver / organizar Táxi Dog':'Organizar Táxi Dog'}</button>}
        </div>
        {saving&&<p role="status">Atualizando atendimento...</p>}
        <div className="form-actions"><button type="button" className="ghost-btn" disabled={saving} onClick={closeDetails}>Fechar</button></div>
      </>}
      {step==='move'&&<form className="form-grid" onSubmit={saveMove} aria-busy={saving}>
        <label>Data e horário<input required type="datetime-local" min={minimumTime} value={newTime} disabled={saving} onChange={event=>setNewTime(event.target.value)}/></label>
        <label>Profissional<select required value={newProfessional} disabled={saving} onChange={event=>setNewProfessional(event.target.value)}>{options.professionals.map(professional=><option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>
        <p className="full-span business-form-hint">Escolha uma data e um horário futuros no fuso da empresa.</p>
        {taxiAvailable&&(taxiLoading?<p className="full-span" role="status">Carregando o planejamento do transporte...</p>:<TaxiDogFields value={taxiForm} onChange={setTaxiForm} options={taxiOptions} timezone={timezone} minimumTime={minimumTime} appointmentStart={newTime} duration={selected.services.reduce((sum,service)=>sum+service.duration_minutes,0)} disabled={saving} booking={taxiBooking}/>)}
        {!taxiAllowed&&selected.taxi_dog&&!selected.taxi_dog.cancelled_at&&<p className="full-span taxi-note">Este atendimento tem Táxi Dog. Um responsável com acesso ao transporte precisa conferir os horários da busca e entrega ao alterar a agenda.</p>}
        <label className="full-span">Motivo<input required minLength={3} value={reason} disabled={saving} onChange={event=>setReason(event.target.value)}/></label>
        {move==='anticipate'&&<label className="full-span check-label"><input type="checkbox" required checked={consent} disabled={saving} onChange={event=>setConsent(event.target.checked)}/>Confirmo que o tutor concordou com a antecipação.</label>}
        {taxiAvailable&&!taxiLoading&&!taxiLoaded&&<button type="button" className="text-link full-span" onClick={()=>void readTaxi(selected)}>Tentar carregar o transporte novamente</button>}
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={saving} onClick={backToDetails}><ArrowLeft size={16}/>Voltar</button><button type="submit" className="primary-btn" disabled={saving||taxiLoading||taxiAvailable&&!taxiLoaded}>{saving?'Salvando...':'Salvar novo horário'}</button></div>
      </form>}
      {step==='taxi'&&(taxiLoading?<Empty label="Carregando transporte..."/>:<form className="form-grid" onSubmit={saveTaxi}>
        <TaxiDogFields value={taxiForm} onChange={setTaxiForm} options={taxiOptions} timezone={timezone} minimumTime={minimumTime} appointmentStart={calendarWallTime(selected.starts_at,timezone)} duration={selected.services.reduce((sum,service)=>sum+service.duration_minutes,0)} disabled={saving||!taxiOptions.enabled} booking={taxiBooking}/>
        {!taxiOptions.enabled&&<p className="taxi-note full-span">Ative Táxi Dog nas configurações do pet shop para criar ou alterar o planejamento.</p>}
        {!taxiLoaded&&<button type="button" className="text-link full-span" onClick={()=>void readTaxi(selected)}>Tentar carregar o transporte novamente</button>}
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={saving} onClick={backToDetails}><ArrowLeft size={16}/>Voltar</button>{taxiOptions.enabled&&taxiBooking?.editable!==false&&<button type="submit" className="primary-btn" disabled={saving||!taxiLoaded}>{saving?'Salvando...':'Salvar transporte'}</button>}</div>
      </form>)}
      {step==='history'&&<>
        {historyLoading?<Empty label="Carregando histórico..."/>:historyRows.length?<div className="history">{historyRows.map(item=><p key={item.id}>{dateTime(item.created_at)} · {item.actor_name} · {historyKindLabel(item.kind)}{item.reason?` · ${item.reason}`:''}</p>)}</div>:!dialogError&&<Empty label="Nenhuma alteração registrada."/>}
        <div className="form-actions"><button type="button" className="ghost-btn" onClick={backToDetails}><ArrowLeft size={16}/>Voltar ao atendimento</button></div>
      </>}
    </FormDialog>}

    {showForm&&<FormDialog title="Novo agendamento" description={!loading&&nextSetup?'Prepare os cadastros abaixo para começar a reservar os horários.':'Preencha os dados do atendimento e confirme para reservar o horário.'} onClose={closeNew} busy={saving} error={dialogError||loadError} wide>
      {loading&&<p role="status" className="muted">Carregando opções do agendamento...</p>}
      <form className="form-grid" onSubmit={create} aria-busy={saving}>
        {!loading&&!loadError&&nextSetup&&<div className="full-span business-setup-hint calendar-setup-guide"><strong>Vamos preparar sua agenda.</strong><p>Para reservar um horário, ainda é preciso cadastrar:</p><ul>{missingSetup.map(item=><li key={item.target}>{item.description}</li>)}</ul><p>Comece pelo cadastro indicado abaixo. Depois, volte à Agenda e escolha Novo agendamento.</p>{onSetup&&canSetup?.(nextSetup.target)?<button type="button" className="primary-btn" disabled={saving} onClick={()=>prepareSetup(nextSetup.target)}>{nextSetup.button}</button>:<p>Peça ao responsável pelo pet shop para preparar o cadastro de {nextSetup.description} ou liberar o acesso necessário.</p>}</div>}
        {!loading&&!loadError&&!missingSetup.length&&<>
        <label>Cliente (tutor)<select required value={form.tutor_id} disabled={saving||loading} onChange={event=>setForm({...form,tutor_id:event.target.value,pet_id:''})}><option value="">Selecione um cliente</option>{options.tutors.map(tutor=><option key={tutor.id} value={tutor.id}>{tutor.name}</option>)}</select></label>
        <label>Pet<select required value={form.pet_id} disabled={saving||loading} onChange={event=>setForm({...form,pet_id:event.target.value})}><option value="">Selecione um pet</option>{pets.map(pet=><option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label>
        {!loading&&!loadError&&form.tutor_id&&!pets.length&&options.pets.length>0&&<div className="full-span business-setup-hint"><p>Este cliente ainda não tem um pet cadastrado. Cadastre o animal e vincule-o ao cliente antes de agendar.</p>{onSetup&&canSetup?.('pets')?<button type="button" className="text-link" disabled={saving} onClick={()=>prepareSetup('pets')}>Ir para Pets</button>:<p>Peça ao responsável pelo pet shop para cadastrar o pet.</p>}</div>}
        <label>Profissional<select required value={form.professional_id} disabled={saving||loading} onChange={event=>setForm({...form,professional_id:event.target.value})}><option value="">Selecione um profissional</option>{options.professionals.map(professional=><option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>
        <label>Início (horário da empresa)<input required type="datetime-local" min={minimumTime} value={form.starts_at} disabled={saving||loading} onChange={event=>setForm({...form,starts_at:event.target.value})}/></label>
        <p className="full-span business-form-hint">Agende a partir de hoje, em um horário futuro no fuso da empresa.</p>
        {taxiAvailable&&<TaxiDogFields value={taxiForm} onChange={setTaxiForm} options={taxiOptions} timezone={timezone} minimumTime={minimumTime} appointmentStart={form.starts_at} duration={duration} disabled={saving||loading}/>}
        <div className="full-span"><strong className="field-title">Serviços</strong><div className="checks">{options.services.map(service=><label key={service.id}><input type="checkbox" checked={form.service_ids.includes(service.id)} disabled={saving||loading} onChange={event=>setForm({...form,service_ids:event.target.checked?[...form.service_ids,service.id]:form.service_ids.filter(id=>id!==service.id)})}/>{service.name} · {service.duration_minutes} min · {money(service.price_cents)}</label>)}</div><p className="muted">Selecione os serviços. Tempo total: {duration} minutos.</p><p className="business-form-hint">O profissional precisa ter esses serviços habilitados e jornada disponível em Profissionais → Horários.</p></div>
        <label className="full-span">Observações<textarea value={form.notes} disabled={saving} onChange={event=>setForm({...form,notes:event.target.value})}/></label>
        </>}
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={saving} onClick={closeNew}>{!loading&&missingSetup.length?'Fechar':'Cancelar'}</button>{!loading&&!loadError&&!missingSetup.length&&<button type="submit" className="primary-btn" disabled={saving||!form.service_ids.length}>{saving?'Agendando...':'Agendar'}</button>}</div>
      </form>
    </FormDialog>}
  </div>;
}
