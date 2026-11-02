import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, Clock3, Plus, RefreshCw} from 'lucide-react';
import {api, dateTime, endIso, money, startIso, today, zonedToISO} from './api';
import FormDialog from './FormDialog';
import {Empty, PageHeader, Status} from './ui';

type Choice = {id:string; name:string};
type Service = Choice & {price_cents:number; duration_minutes:number};
type Options = {tutors:Choice[]; pets:(Choice & {tutor_id:string})[]; professionals:Choice[]; services:Service[]};
type Appointment = {
  id:string; tutor_name:string; pet_name:string; professional_id:string;
  professional_name:string; starts_at:string; status:string; services:Service[];
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
type Step = 'details'|'move'|'history';
type Props = {setMessage:(value:string)=>void; setError:(value:string)=>void; initialNew?:boolean; searchQuery?:string};
const blankOptions:Options = {tutors:[], pets:[], professionals:[], services:[]};
const newForm = (date:string):AppointmentForm => ({tutor_id:'', pet_id:'', professional_id:'', service_ids:[], starts_at:`${date}T09:00`, notes:''});
const wallTime = (date:string) => new Date(date).toLocaleString('sv-SE', {
  timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'
}).replace(' ', 'T');

export default function CalendarPage({setMessage, setError, initialNew=false, searchQuery=''}:Props) {
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
  const loadRequest = useRef(0);
  const historyRequest = useRef(0);

  function setDialogError(value:string) {
    setDialogErrorState(value);
    if(value) setError(value);
  }

  async function load() {
    const request = ++loadRequest.current;
    setLoading(true); setLoadError('');
    try {
      const from = encodeURIComponent(startIso(date)), to = encodeURIComponent(endIso(date,mode==='week'?7:1));
      const [items,opts] = await Promise.all([
        api<Appointment[]>(`/calendar/appointments?from=${from}&to=${to}`),
        api<Options>('/calendar/options')
      ]);
      if (request===loadRequest.current) {setRows(items); setOptions(opts);}
    } catch (error) {
      if (request===loadRequest.current) {setLoadError((error as Error).message); setError((error as Error).message);}
    } finally {
      if (request===loadRequest.current) setLoading(false);
    }
  }
  useEffect(()=>{void load(); return ()=>{loadRequest.current++;};},[date,mode]);
  useEffect(()=>{if(initialNew) openNew();},[initialNew]);
  useEffect(()=>()=>{historyRequest.current++;},[]);

  const listed = rows.filter(item=>(!professionalFilter||item.professional_id===professionalFilter)&&
    (!searchQuery||[item.pet_name,item.tutor_name,item.professional_name].join(' ').toLocaleLowerCase('pt-BR').includes(searchQuery.toLocaleLowerCase('pt-BR'))));
  const pets = options.pets.filter(pet=>pet.tutor_id===form.tutor_id);
  const selectedServices = options.services.filter(service=>form.service_ids.includes(service.id));
  const duration = selectedServices.reduce((sum,service)=>sum+service.duration_minutes,0);

  function openNew() {
    historyRequest.current++;
    setSelected(null); setStep('details'); setDialogError(''); setForm(newForm(date)); setShowForm(true);
  }
  function openDetails(item:Appointment) {
    historyRequest.current++;
    setShowForm(false); setSelected(item); setStep('details'); setHistoryRows([]); setDialogError('');
  }
  function closeNew() {if(!saving){setShowForm(false); setDialogError('');}}
  function closeDetails() {
    if(saving) return;
    historyRequest.current++;
    setSelected(null); setStep('details'); setDialogError('');
  }
  function backToDetails() {
    historyRequest.current++;
    setStep('details'); setDialogError(''); setHistoryLoading(false);
  }

  async function create(event:FormEvent) {
    event.preventDefault(); if(saving) return;
    setSaving(true); setDialogError('');
    try {
      await api('/calendar/appointments','POST',{...form,starts_at:zonedToISO(form.starts_at)});
      setMessage('Atendimento agendado e gravado no banco.'); setShowForm(false); await load();
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
  function startMove(next:Move) {
    if(!selected) return;
    setMove(next); setNewTime(wallTime(selected.starts_at)); setNewProfessional(selected.professional_id);
    setReason(''); setConsent(false); setDialogError(''); setStep('move');
  }
  async function saveMove(event:FormEvent) {
    event.preventDefault(); if(saving||!selected) return;
    setSaving(true); setDialogError('');
    try {
      await api(`/calendar/appointments/${selected.id}/move`,'POST',{
        mode:move,starts_at:zonedToISO(newTime),professional_id:newProfessional,reason,tutor_consent:consent
      });
      setSelected(null); setStep('details');
      setMessage(move==='anticipate'?'Atendimento antecipado com autorização registrada.':'Agendamento reagendado; horário anterior liberado.');
      await load();
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
    : step==='history' ? `Histórico de ${selected.pet_name}` : `Atendimento de ${selected.pet_name}` : '';
  const missingSetup=[!options.services.length?'serviços em Serviços':null,!options.professionals.length?'um profissional e sua jornada em Profissionais':null,!options.tutors.length?'o cliente em Clientes e pets':null,!options.pets.length?'o pet vinculado ao cliente em Clientes e pets':null].filter(Boolean);

  return <>
    <PageHeader eyebrow="ROTINA DE ATENDIMENTOS" title="Agenda de atendimentos"
      subtitle="Organize horários, serviços e profissionais sem conflitos de reserva."
      action={<button className="primary-btn" onClick={openNew} aria-haspopup="dialog"><Plus size={17}/>Novo agendamento</button>}/>
    <div className="panel">
      <div className="list-tools calendar-tools">
        <div className="segmented"><button className={mode==='day'?'chosen':''} onClick={()=>setMode('day')}>Dia</button><button className={mode==='week'?'chosen':''} onClick={()=>setMode('week')}>Semana</button></div>
        <label className="date-select">Data <input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label>
        <select aria-label="Filtrar por profissional" value={professionalFilter} onChange={event=>setProfessionalFilter(event.target.value)}><option value="">Todos os profissionais</option>{options.professionals.map(professional=><option key={professional.id} value={professional.id}>{professional.name}</option>)}</select>
        <button className="icon-button" onClick={load} title="Atualizar" aria-label="Atualizar"><RefreshCw size={18}/></button>
      </div>
      {loading?<Empty label="Consultando a agenda..."/>:loadError?<div className="business-setup-hint"><p>Não foi possível consultar a agenda. Tente carregar novamente antes de criar um atendimento.</p><button type="button" className="text-link" onClick={()=>void load()}>Tentar novamente</button></div>:listed.length?<div className="appointment-list">{listed.map(item=><button key={item.id} className={`appointment-line ${selected?.id===item.id?'selected':''}`} onClick={()=>openDetails(item)} aria-haspopup="dialog">
        <div className="appointment-time"><Clock3 size={16}/>{new Date(item.starts_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</div>
        <div className="appointment-detail"><strong>{item.pet_name} <span className="subtle">· {item.tutor_name}</span></strong><small>{item.services.map(service=>service.name).join(' + ')} · {item.professional_name}</small></div>
        <Status status={item.status}/>
      </button>)}</div>:<Empty label={missingSetup.length?`Antes do primeiro agendamento, cadastre ${missingSetup.join('; ')}.`:'Não há atendimentos no período selecionado. Use Novo agendamento para reservar um horário.'}/>}
    </div>

    {selected&&<FormDialog title={detailsTitle} description={`${selected.tutor_name} · ${selected.professional_name} · ${dateTime(selected.starts_at)}`} onClose={closeDetails} busy={saving} error={dialogError} wide>
      {step==='details'&&<>
        <Status status={selected.status}/>
        <p>{selected.services.map(service=>service.name).join(' + ')} · {selected.services.reduce((sum,service)=>sum+service.duration_minutes,0)} minutos</p>
        <div className="action-row">
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
        </div>
        {saving&&<p role="status">Atualizando atendimento...</p>}
        <div className="form-actions"><button type="button" className="ghost-btn" disabled={saving} onClick={closeDetails}>Fechar</button></div>
      </>}
      {step==='move'&&<form className="form-grid" onSubmit={saveMove} aria-busy={saving}>
        <label>Data e horário<input required type="datetime-local" value={newTime} disabled={saving} onChange={event=>setNewTime(event.target.value)}/></label>
        <label>Profissional<select required value={newProfessional} disabled={saving} onChange={event=>setNewProfessional(event.target.value)}>{options.professionals.map(professional=><option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>
        <label className="full-span">Motivo<input required minLength={3} value={reason} disabled={saving} onChange={event=>setReason(event.target.value)}/></label>
        {move==='anticipate'&&<label className="full-span check-label"><input type="checkbox" required checked={consent} disabled={saving} onChange={event=>setConsent(event.target.checked)}/>Confirmo que o tutor concordou com a antecipação.</label>}
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={saving} onClick={backToDetails}><ArrowLeft size={16}/>Voltar</button><button type="submit" className="primary-btn" disabled={saving}>{saving?'Salvando...':'Salvar novo horário'}</button></div>
      </form>}
      {step==='history'&&<>
        {historyLoading?<Empty label="Carregando histórico..."/>:historyRows.length?<div className="history">{historyRows.map(item=><p key={item.id}>{dateTime(item.created_at)} · {item.actor_name} · {historyKindLabel(item.kind)}{item.reason?` · ${item.reason}`:''}</p>)}</div>:!dialogError&&<Empty label="Nenhuma alteração registrada."/>}
        <div className="form-actions"><button type="button" className="ghost-btn" onClick={backToDetails}><ArrowLeft size={16}/>Voltar ao atendimento</button></div>
      </>}
    </FormDialog>}

    {showForm&&<FormDialog title="Novo agendamento" description="Preencha os dados do atendimento e confirme para reservar o horário." onClose={closeNew} busy={saving} error={dialogError||loadError} wide>
      {loading&&<p role="status" className="muted">Carregando opções do agendamento...</p>}
      <form className="form-grid" onSubmit={create} aria-busy={saving}>
        {!loading&&!loadError&&missingSetup.length>0&&<div className="full-span business-setup-hint"><strong>Faltam alguns cadastros para agendar.</strong><p>Feche esta janela e cadastre {missingSetup.join('; ')}. Depois, volte a Novo agendamento.</p></div>}
        <label>Tutor<select required value={form.tutor_id} disabled={saving||loading} onChange={event=>setForm({...form,tutor_id:event.target.value,pet_id:''})}><option value="">Selecione um tutor</option>{options.tutors.map(tutor=><option key={tutor.id} value={tutor.id}>{tutor.name}</option>)}</select></label>
        <label>Pet<select required value={form.pet_id} disabled={saving||loading} onChange={event=>setForm({...form,pet_id:event.target.value})}><option value="">Selecione um pet</option>{pets.map(pet=><option key={pet.id} value={pet.id}>{pet.name}</option>)}</select></label>
        <label>Profissional<select required value={form.professional_id} disabled={saving||loading} onChange={event=>setForm({...form,professional_id:event.target.value})}><option value="">Selecione um profissional</option>{options.professionals.map(professional=><option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>
        <label>Início (horário da empresa)<input required type="datetime-local" value={form.starts_at} disabled={saving||loading} onChange={event=>setForm({...form,starts_at:event.target.value})}/></label>
        <div className="full-span"><strong className="field-title">Serviços</strong><div className="checks">{options.services.map(service=><label key={service.id}><input type="checkbox" checked={form.service_ids.includes(service.id)} disabled={saving||loading} onChange={event=>setForm({...form,service_ids:event.target.checked?[...form.service_ids,service.id]:form.service_ids.filter(id=>id!==service.id)})}/>{service.name} · {service.duration_minutes} min · {money(service.price_cents)}</label>)}</div><p className="muted">Selecione os serviços. Tempo total: {duration} minutos.</p><p className="business-form-hint">O profissional precisa ter esses serviços habilitados e jornada disponível em Profissionais → Horários.</p></div>
        <label className="full-span">Observações<textarea value={form.notes} disabled={saving} onChange={event=>setForm({...form,notes:event.target.value})}/></label>
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={saving} onClick={closeNew}>Cancelar</button><button type="submit" className="primary-btn" disabled={saving||loading||!form.service_ids.length}>{saving?'Agendando...':'Confirmar agendamento'}</button></div>
      </form>
    </FormDialog>}
  </>;
}
