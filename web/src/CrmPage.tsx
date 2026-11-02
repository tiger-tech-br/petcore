import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowLeft, ArrowRight, CalendarClock, Check, CheckCheck, ChevronLeft, ChevronRight, Clock3, Mail, MessageCircle, PawPrint, Phone, Plus, Search, UsersRound, X} from 'lucide-react';
import {api, zonedToISO} from './api';
import FormDialog from './FormDialog';
import {Empty, PageHeader, Status} from './ui';

type Props = {setMessage:(value:string)=>void; setError:(value:string)=>void};
type Segment = 'all'|'inactive'|'without_visits';
type TaskFilter = 'open'|'overdue'|'done'|'cancelled'|'all';
type Channel = 'whatsapp'|'phone'|'email'|'in_person'|'other';
type TaskStatus = 'open'|'done'|'cancelled';
type CrmClient = {
  id:string; name:string; phone:string; email:string|null; notes:string; created_at:string;
  pet_count:number; completed_visits:number; last_visit_at:string|null; next_appointment_at:string|null;
  last_contact_at:string|null; pending_tasks:number; next_task_due_at:string|null;
};
type CrmTask = {
  id:string; tutor_id:string; tutor_name:string; title:string; notes:string; due_at:string;
  status:TaskStatus; created_at:string; created_by_name:string; completed_at:string|null;
};
type CrmContact = {id:string; tutor_id:string; channel:Channel; summary:string; occurred_at:string; created_at:string; created_by_name:string};
type ClientList = {
  items:CrmClient[]; total:number; page:number; pageSize:number; inactiveDays:number; timezone:string;
  summary:{clients:number; withoutVisits:number; inactive:number; pendingTasks:number; overdueTasks:number};
};
type TaskList = {items:CrmTask[]; total:number; page:number; pageSize:number};
type ClientDetail = {
  client:CrmClient; timezone:string;
  pets:{id:string; name:string; species:string; breed:string|null}[];
  appointments:{id:string; starts_at:string; status:string; pet_name:string; professional_name:string; service_names:string[]}[];
  contacts:CrmContact[]; tasks:CrmTask[];
};

const channels:Record<Channel,string> = {whatsapp:'WhatsApp',phone:'Telefone',email:'E-mail',in_person:'Presencial',other:'Outro'};
const taskLabels:Record<TaskStatus,string> = {open:'Pendente',done:'Concluído',cancelled:'Cancelado'};
const errorText = (error:unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

function dateLabel(value:string|null, timezone:string, time=false) {
  if (!value) return 'Ainda não registrado';
  return new Intl.DateTimeFormat('pt-BR', {timeZone:timezone,dateStyle:'short',...(time?{timeStyle:'short' as const}:{})}).format(new Date(value));
}

function wallTime(timezone:string, date=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function overdue(task:CrmTask) {return task.status==='open'&&new Date(task.due_at).getTime()<Date.now();}

export default function CrmPage({setMessage,setError}:Props) {
  const [area,setArea]=useState<'clients'|'tasks'>('clients');
  const [search,setSearch]=useState(''),[query,setQuery]=useState('');
  const [segment,setSegment]=useState<Segment>('all'),[days,setDays]=useState(60),[page,setPage]=useState(1);
  const [clients,setClients]=useState<ClientList|null>(null),[loading,setLoading]=useState(true),[listError,setListError]=useState('');
  const [taskFilter,setTaskFilter]=useState<TaskFilter>('open'),[taskPage,setTaskPage]=useState(1);
  const [tasks,setTasks]=useState<TaskList|null>(null),[tasksLoading,setTasksLoading]=useState(false),[tasksError,setTasksError]=useState('');
  const [revision,setRevision]=useState(0),[selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<ClientDetail|null>(null);
  const [detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState(''),[detailRevision,setDetailRevision]=useState(0);
  const [mode,setMode]=useState<'detail'|'contact'|'task'>('detail'),[detailTab,setDetailTab]=useState<'summary'|'contacts'|'tasks'>('summary');
  const [saving,setSaving]=useState(false),[taskBusy,setTaskBusy]=useState<string|null>(null),[formError,setFormError]=useState('');
  const [channel,setChannel]=useState<Channel>('whatsapp'),[contactSummary,setContactSummary]=useState(''),[contactAt,setContactAt]=useState('');
  const [taskTitle,setTaskTitle]=useState(''),[taskNotes,setTaskNotes]=useState(''),[taskDue,setTaskDue]=useState('');
  const mounted=useRef(true);
  const timezone=detail?.timezone||clients?.timezone||'America/Sao_Paulo';

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{const timer=window.setTimeout(()=>{setQuery(search.trim());setPage(1);},300);return()=>window.clearTimeout(timer);},[search]);

  useEffect(()=>{
    let active=true;
    setLoading(true);setListError('');
    const params=new URLSearchParams({q:query,segment,inactive_days:String(days),page:String(page),page_size:'12'});
    api<ClientList>(`/crm/clients?${params}`).then(response=>{if(active)setClients(response);}).catch(cause=>{
      if(active){const text=errorText(cause);setListError(text);setError(text);}
    }).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[query,segment,days,page,revision,setError]);

  useEffect(()=>{
    if(area!=='tasks')return;
    let active=true;
    setTasksLoading(true);setTasksError('');
    const params=new URLSearchParams({filter:taskFilter,page:String(taskPage),page_size:'20'});
    api<TaskList>(`/crm/tasks?${params}`).then(response=>{if(active)setTasks(response);}).catch(cause=>{
      if(active){const text=errorText(cause);setTasksError(text);setError(text);}
    }).finally(()=>{if(active)setTasksLoading(false);});
    return()=>{active=false;};
  },[area,taskFilter,taskPage,revision,setError]);

  useEffect(()=>{
    if(!selected)return;
    let active=true;
    setDetailLoading(true);setDetailError('');
    api<ClientDetail>(`/crm/clients/${selected}`).then(response=>{if(active)setDetail(response);}).catch(cause=>{
      if(active){const text=errorText(cause);setDetailError(text);setError(text);}
    }).finally(()=>{if(active)setDetailLoading(false);});
    return()=>{active=false;};
  },[selected,detailRevision,setError]);

  function reportFormError(cause:unknown) {const text=errorText(cause);setFormError(text);setError(text);}
  function openClient(id:string, tab:'summary'|'contacts'|'tasks'='summary') {
    if(saving||taskBusy)return;
    setDetail(null);setDetailError('');setFormError('');setMode('detail');setDetailTab(tab);setSelected(id);
  }
  function closeDialog() {
    if(saving||taskBusy)return;
    setFormError('');
    if(mode!=='detail'){setMode('detail');return;}
    setSelected(null);setDetail(null);
  }
  function startContact() {
    setChannel('whatsapp');setContactSummary('');setContactAt(wallTime(timezone));setFormError('');setMode('contact');
  }
  function startTask() {
    setTaskTitle('');setTaskNotes('');setTaskDue(wallTime(timezone,new Date(Date.now()+86400000)));setFormError('');setMode('task');
  }
  function refreshData() {setRevision(value=>value+1);setDetailRevision(value=>value+1);}

  async function saveContact(event:FormEvent) {
    event.preventDefault();if(saving||!selected)return;
    setSaving(true);setFormError('');
    try {
      await api(`/crm/clients/${selected}/contacts`,'POST',{channel,summary:contactSummary.trim(),occurred_at:zonedToISO(contactAt,timezone)});
      if(!mounted.current)return;
      setMessage('Contato registrado no CRM.');setDetailTab('contacts');setMode('detail');refreshData();
    }catch(cause){if(mounted.current)reportFormError(cause);}finally{if(mounted.current)setSaving(false);}
  }
  async function saveTask(event:FormEvent) {
    event.preventDefault();if(saving||!selected)return;
    setSaving(true);setFormError('');
    try {
      await api(`/crm/clients/${selected}/tasks`,'POST',{title:taskTitle.trim(),notes:taskNotes.trim(),due_at:zonedToISO(taskDue,timezone)});
      if(!mounted.current)return;
      setMessage('Tarefa de retorno agendada no CRM.');setDetailTab('tasks');setMode('detail');refreshData();
    }catch(cause){if(mounted.current)reportFormError(cause);}finally{if(mounted.current)setSaving(false);}
  }
  async function changeTask(task:CrmTask,status:TaskStatus) {
    if(taskBusy||saving)return;
    setTaskBusy(task.id);setFormError('');
    try {
      await api(`/crm/tasks/${task.id}`,'PATCH',{status});
      if(!mounted.current)return;
      setMessage(status==='done'?'Tarefa de retorno concluída.':status==='cancelled'?'Tarefa de retorno cancelada.':'Tarefa de retorno reaberta.');
      // Uma tarefa pode sair da página depois de mudar de situação.
      if(tasks?.items.length===1&&taskPage>1)setTaskPage(value=>value-1);
      refreshData();
    }catch(cause){if(mounted.current){if(selected)reportFormError(cause);else{const text=errorText(cause);setTasksError(text);setError(text);}}}
    finally{if(mounted.current)setTaskBusy(null);}
  }
  function selectSegment(next:Segment) {setArea('clients');setSegment(next);setPage(1);}
  function selectTaskFilter(next:TaskFilter) {setArea('tasks');setTaskFilter(next);setTaskPage(1);}

  const summary=clients?.summary;
  const clientName=detail?.client.name||'Cliente';
  const dialogTitle=mode==='contact'?`Registrar contato com ${clientName}`:mode==='task'?`Agendar retorno de ${clientName}`:detail?.client.name||'Ficha do cliente';
  const dialogDescription=mode==='contact'?'Registre uma conversa que já aconteceu.':mode==='task'?'Crie uma tarefa para a equipe entrar em contato.':'Contatos, atendimentos e próximos passos em um só lugar.';

  return <div className="crm-page">
    <PageHeader eyebrow="CRM" title="Relacionamento com clientes" subtitle="Acompanhe o histórico de contatos e organize os próximos retornos."/>
    <div className="crm-stats" aria-label="Resumo do relacionamento">
      <button className="crm-stat" onClick={()=>selectSegment('all')}><span className="crm-stat-icon"><UsersRound size={23}/></span><span><strong>{summary?.clients??'—'}</strong><span>Clientes cadastrados</span></span></button>
      <button className="crm-stat" onClick={()=>selectSegment('without_visits')}><span className="crm-stat-icon crm-stat-icon--blue"><PawPrint size={23}/></span><span><strong>{summary?.withoutVisits??'—'}</strong><span>Sem atendimento concluído</span></span></button>
      <button className="crm-stat" onClick={()=>selectSegment('inactive')}><span className="crm-stat-icon crm-stat-icon--amber"><Clock3 size={23}/></span><span><strong>{summary?.inactive??'—'}</strong><span>Sem retorno há {days} dias</span></span></button>
      <button className="crm-stat" onClick={()=>selectTaskFilter('open')}><span className="crm-stat-icon"><CalendarClock size={23}/></span><span><strong>{summary?.pendingTasks??'—'}</strong><span>Tarefas pendentes</span>{!!summary?.overdueTasks&&<small>{summary.overdueTasks} atrasada{summary.overdueTasks===1?'':'s'}</small>}</span></button>
    </div>

    <div className="crm-area-switch" role="group" aria-label="Área do CRM">
      <button className={area==='clients'?'selected':''} aria-pressed={area==='clients'} onClick={()=>setArea('clients')}><UsersRound size={17}/>Clientes</button>
      <button className={area==='tasks'?'selected':''} aria-pressed={area==='tasks'} onClick={()=>setArea('tasks')}><CalendarClock size={17}/>Tarefas de retorno</button>
    </div>

    {area==='clients'?<section className="panel crm-directory" aria-label="Clientes do CRM">
      <div className="crm-directory-head"><div><h2>Sua carteira de clientes</h2><p>Um acompanhamento próximo começa pelo próximo contato.</p></div><span className="crm-count">{clients?.total??0} cliente{clients?.total===1?'':'s'}</span></div>
      <div className="crm-filters">
        <label className="crm-search"><Search size={19}/><span className="crm-sr-only">Buscar clientes</span><input type="search" placeholder="Buscar nome, telefone ou e-mail" value={search} maxLength={100} onChange={event=>setSearch(event.target.value)}/></label>
        <label className="crm-filter"><span>Relacionamento</span><select value={segment} onChange={event=>selectSegment(event.target.value as Segment)}><option value="all">Todos os clientes</option><option value="without_visits">Sem atendimento</option><option value="inactive">Sem retorno</option></select></label>
        <label className="crm-filter"><span>Sem retorno há</span><select value={days} onChange={event=>{setDays(Number(event.target.value));setPage(1);}}><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option></select></label>
      </div>
      <p className="crm-filter-note">“Sem retorno” considera a última visita concluída. Tarefas de contato não reservam um horário na agenda.</p>
      {loading?<Empty label="Carregando clientes..."/>:listError?<Retry message={listError} retry={()=>setRevision(value=>value+1)}/>:!clients?.items.length?<Empty label={query||segment!=='all'?'Nenhum cliente corresponde a esse filtro.':'Cadastre clientes em Clientes e pets para começar o acompanhamento.'}/>:<>
        <div className="crm-client-grid">{clients.items.map(client=><article className="crm-client-card" key={client.id}>
          <div className="crm-client-heading"><span className="crm-client-avatar" aria-hidden="true">{client.name.trim().charAt(0).toUpperCase()}</span><div><h3>{client.name}</h3><span><PawPrint size={13}/>{client.pet_count} pet{client.pet_count===1?'':'s'} · {client.completed_visits} visita{client.completed_visits===1?'':'s'}</span></div>{client.pending_tasks>0&&<span className="crm-task-count" title="Tarefas pendentes">{client.pending_tasks}</span>}</div>
          <div className="crm-client-contact"><span><Phone size={14}/>{client.phone||'Telefone não informado'}</span>{client.email&&<span><Mail size={14}/>{client.email}</span>}</div>
          <dl className="crm-client-dates"><div><dt>Última visita</dt><dd>{client.last_visit_at?dateLabel(client.last_visit_at,timezone):'Sem atendimento concluído'}</dd></div><div><dt>Último contato</dt><dd>{client.last_contact_at?dateLabel(client.last_contact_at,timezone):'Nenhum contato registrado'}</dd></div></dl>
          {client.next_task_due_at?<p className="crm-next-step"><CalendarClock size={15}/><span>Próximo contato: <strong>{dateLabel(client.next_task_due_at,timezone,true)}</strong></span></p>:<p className="crm-next-step crm-next-step--empty"><CalendarClock size={15}/>Nenhum retorno pendente</p>}
          <button className="crm-open-client" onClick={()=>openClient(client.id)} aria-label={`Abrir ficha de ${client.name}`}>Abrir ficha<ArrowRight size={17}/></button>
        </article>)}</div>
        <Pagination page={page} pageSize={clients.pageSize} total={clients.total} loading={loading} onPage={setPage}/>
      </>}
    </section>:<section className="panel crm-task-panel" aria-label="Tarefas de retorno">
      <div className="crm-directory-head"><div><h2>Próximos contatos</h2><p>Organize o que precisa ser feito e registre quando concluir.</p></div><label className="crm-filter"><span>Situação</span><select value={taskFilter} onChange={event=>selectTaskFilter(event.target.value as TaskFilter)}><option value="open">Pendentes</option><option value="overdue">Atrasadas</option><option value="done">Concluídas</option><option value="cancelled">Canceladas</option><option value="all">Todas</option></select></label></div>
      {tasksLoading?<Empty label="Carregando tarefas..."/>:tasksError?<Retry message={tasksError} retry={()=>setRevision(value=>value+1)}/>:!tasks?.items.length?<Empty label="Nenhuma tarefa nessa situação. Abra a ficha de um cliente para agendar um retorno."/>:<>
        <div className="crm-task-list">{tasks.items.map(task=><TaskCard key={task.id} task={task} timezone={timezone} busy={taskBusy!==null} onStatus={status=>void changeTask(task,status)} onClient={()=>openClient(task.tutor_id,'tasks')}/>)}</div>
        <Pagination page={taskPage} pageSize={tasks.pageSize} total={tasks.total} loading={tasksLoading||taskBusy!==null} onPage={setTaskPage}/>
      </>}
    </section>}
    <p className="crm-page-note"><MessageCircle size={14}/>Os registros e as tarefas são internos. Nenhuma mensagem é enviada automaticamente pelo CRM.</p>

    {selected&&<FormDialog wide title={dialogTitle} description={dialogDescription} onClose={closeDialog} busy={saving||taskBusy!==null} error={formError||detailError}>
      {detailLoading&&!detail?<Empty label="Carregando ficha do cliente..."/>:!detail?<button className="ghost-btn" onClick={()=>setDetailRevision(value=>value+1)}>Tentar novamente</button>:mode==='contact'?<form className="stack-form crm-entry-form" onSubmit={saveContact}>
        <div className="crm-entry-back"><button type="button" className="text-link" disabled={saving} onClick={()=>{setMode('detail');setFormError('');}}><ArrowLeft size={16}/>Voltar para a ficha</button></div>
        <div className="crm-entry-columns"><label>Canal do contato<select value={channel} disabled={saving} onChange={event=>setChannel(event.target.value as Channel)}>{Object.entries(channels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>Quando aconteceu<input type="datetime-local" required disabled={saving} value={contactAt} onChange={event=>setContactAt(event.target.value)}/></label></div>
        <label>Resumo da conversa<textarea required maxLength={3000} rows={5} placeholder="O que foi conversado e qual foi o combinado?" value={contactSummary} disabled={saving} onChange={event=>setContactSummary(event.target.value)}/></label>
        <p className="crm-form-note">Horário do estabelecimento. Registrar um contato não altera a autorização para lembretes por e-mail.</p>
        <div className="form-actions"><button type="button" className="ghost-btn" disabled={saving} onClick={closeDialog}>Cancelar</button><button type="submit" className="primary-btn" disabled={saving||!contactSummary.trim()}>{saving?'Salvando...':'Salvar contato'}</button></div>
      </form>:mode==='task'?<form className="stack-form crm-entry-form" onSubmit={saveTask}>
        <div className="crm-entry-back"><button type="button" className="text-link" disabled={saving} onClick={()=>{setMode('detail');setFormError('');}}><ArrowLeft size={16}/>Voltar para a ficha</button></div>
        <label>O que precisa ser feito?<input required maxLength={160} placeholder="Ex.: combinar o próximo banho da Mel" value={taskTitle} disabled={saving} onChange={event=>setTaskTitle(event.target.value)}/></label>
        <label>Data e horário do retorno<input type="datetime-local" required disabled={saving} value={taskDue} onChange={event=>setTaskDue(event.target.value)}/></label>
        <label>Orientações para a equipe<textarea maxLength={3000} rows={4} placeholder="Detalhes para ajudar no próximo contato (opcional)" value={taskNotes} disabled={saving} onChange={event=>setTaskNotes(event.target.value)}/></label>
        <p className="crm-form-note">Horário do estabelecimento. Esta tarefa é um lembrete interno e não cria um agendamento de serviço.</p>
        <div className="form-actions"><button type="button" className="ghost-btn" disabled={saving} onClick={closeDialog}>Cancelar</button><button type="submit" className="primary-btn" disabled={saving||!taskTitle.trim()}>{saving?'Salvando...':'Agendar retorno'}</button></div>
      </form>:<div className="crm-detail">
        <div className="crm-detail-profile"><span className="crm-client-avatar crm-client-avatar--large" aria-hidden="true">{detail.client.name.trim().charAt(0).toUpperCase()}</span><div><strong>{detail.client.name}</strong><span><Phone size={14}/>{detail.client.phone||'Telefone não informado'}</span>{detail.client.email&&<span><Mail size={14}/>{detail.client.email}</span>}</div></div>
        <div className="crm-detail-actions"><button className="ghost-btn" disabled={detailLoading||taskBusy!==null} onClick={startContact}><MessageCircle size={17}/>Registrar contato</button><button className="primary-btn" disabled={detailLoading||taskBusy!==null} onClick={startTask}><Plus size={18}/>Agendar retorno</button></div>
        <div className="crm-detail-tabs" role="group" aria-label="Seções da ficha"><button aria-pressed={detailTab==='summary'} className={detailTab==='summary'?'selected':''} onClick={()=>setDetailTab('summary')}>Resumo</button><button aria-pressed={detailTab==='contacts'} className={detailTab==='contacts'?'selected':''} onClick={()=>setDetailTab('contacts')}>Contatos</button><button aria-pressed={detailTab==='tasks'} className={detailTab==='tasks'?'selected':''} onClick={()=>setDetailTab('tasks')}>Retornos</button></div>
        {detailError&&<div className="crm-detail-retry"><button type="button" className="ghost-btn" disabled={detailLoading} onClick={()=>setDetailRevision(value=>value+1)}>Atualizar ficha</button></div>}
        {detailLoading&&<p className="crm-inline-loading" role="status">Atualizando ficha...</p>}
        {detailTab==='summary'?<div className="crm-detail-summary">
          <dl className="crm-detail-metrics"><div><dt>Visitas concluídas</dt><dd>{detail.client.completed_visits}</dd></div><div><dt>Última visita</dt><dd>{detail.client.last_visit_at?dateLabel(detail.client.last_visit_at,timezone):'Sem atendimento'}</dd></div><div><dt>Próximo atendimento</dt><dd>{detail.client.next_appointment_at?dateLabel(detail.client.next_appointment_at,timezone,true):'Nenhum agendado'}</dd></div></dl>
          <section className="crm-detail-section"><h3><PawPrint size={18}/>Pets da família</h3>{detail.pets.length?<div className="crm-pet-chips">{detail.pets.map(pet=><div key={pet.id}><strong>{pet.name}</strong><span>{pet.species}{pet.breed?` · ${pet.breed}`:''}</span></div>)}</div>:<p className="crm-muted">Nenhum pet cadastrado.</p>}</section>
          {detail.client.notes&&<section className="crm-detail-section"><h3>Observações do cadastro</h3><p className="crm-preserve-text">{detail.client.notes}</p></section>}
          <section className="crm-detail-section"><h3>Últimos atendimentos</h3><p className="crm-section-note">Até 10 atendimentos recentes, incluindo cancelamentos e faltas.</p>{detail.appointments.length?<div className="crm-appointment-list">{detail.appointments.map(appointment=><article key={appointment.id}><div><strong>{appointment.pet_name}</strong><span>{appointment.service_names.join(', ')||'Serviço não informado'}</span><small>{appointment.professional_name} · {dateLabel(appointment.starts_at,timezone,true)}</small></div><Status status={appointment.status}/></article>)}</div>:<p className="crm-muted">Nenhum atendimento registrado.</p>}</section>
        </div>:detailTab==='contacts'?<section className="crm-detail-section crm-contact-section"><div className="crm-section-head"><div><h3>Histórico de contatos</h3><p className="crm-section-note">Até 50 registros recentes, feitos pela equipe.</p></div><button className="text-link" disabled={detailLoading} onClick={startContact}><Plus size={15}/>Registrar</button></div>{detail.contacts.length?<ol className="crm-contact-timeline">{detail.contacts.map(contact=><li key={contact.id}><span className="crm-timeline-dot" aria-hidden="true"><MessageCircle size={15}/></span><div><div className="crm-contact-meta"><strong>{channels[contact.channel]}</strong><time dateTime={contact.occurred_at}>{dateLabel(contact.occurred_at,timezone,true)}</time></div><p className="crm-preserve-text">{contact.summary}</p><small>Registrado por {contact.created_by_name}</small></div></li>)}</ol>:<Empty label="Nenhum contato registrado. Registre a próxima conversa por aqui."/>}</section>:<section className="crm-detail-section"><h3>Tarefas de retorno</h3><p className="crm-section-note">Até 50 tarefas, com pendentes primeiro. Use a área Tarefas de retorno para consultar todas.</p>{detail.tasks.length?<div className="crm-task-list crm-task-list--detail">{detail.tasks.map(task=><TaskCard key={task.id} task={task} timezone={timezone} busy={taskBusy!==null||detailLoading} onStatus={status=>void changeTask(task,status)}/>)}</div>:<Empty label="Nenhum retorno registrado. Agende o próximo contato com este cliente."/>}</section>}
        <div className="form-actions"><button type="button" className="ghost-btn" disabled={taskBusy!==null} onClick={closeDialog}>Fechar ficha</button></div>
      </div>}
    </FormDialog>}
  </div>;
}

function Retry({message,retry}:{message:string;retry:()=>void}) {
  return <div className="crm-retry"><p>{message}</p><button className="ghost-btn" onClick={retry}>Tentar novamente</button></div>;
}

function Pagination({page,pageSize,total,loading,onPage}:{page:number;pageSize:number;total:number;loading:boolean;onPage:(value:number)=>void}) {
  const pages=Math.max(1,Math.ceil(total/pageSize));
  return <div className="crm-pagination"><span>{total?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)} de ${total}`:'Nenhum registro'}</span><div><button className="ghost-btn" disabled={loading||page<=1} onClick={()=>onPage(page-1)} aria-label="Página anterior"><ChevronLeft size={17}/></button><span>Página {page} de {pages}</span><button className="ghost-btn" disabled={loading||page>=pages} onClick={()=>onPage(page+1)} aria-label="Próxima página"><ChevronRight size={17}/></button></div></div>;
}

function TaskCard({task,timezone,busy,onStatus,onClient}:{task:CrmTask;timezone:string;busy:boolean;onStatus:(status:TaskStatus)=>void;onClient?:()=>void}) {
  const late=overdue(task);
  return <article className={`crm-task-card${late?' crm-task-card--late':''}`}>
    <div className="crm-task-card-main"><span className={`crm-task-symbol crm-task-symbol--${task.status}`} aria-hidden="true">{task.status==='done'?<CheckCheck size={20}/>:<CalendarClock size={20}/>}</span><div><div className="crm-task-title"><h3>{task.title}</h3><span className={`crm-task-status crm-task-status--${late?'late':task.status}`}>{late?'Atrasado':taskLabels[task.status]}</span></div>{onClient?<button className="crm-task-client" disabled={busy} onClick={onClient}>{task.tutor_name}<ArrowRight size={13}/></button>:null}<time dateTime={task.due_at}>{dateLabel(task.due_at,timezone,true)}</time>{task.notes&&<p className="crm-preserve-text">{task.notes}</p>}<small>Criado por {task.created_by_name}{task.completed_at?` · Concluído em ${dateLabel(task.completed_at,timezone,true)}`:''}</small></div></div>
    <div className="crm-task-actions">{task.status==='open'?<><button className="ghost-btn" disabled={busy} onClick={()=>onStatus('done')} aria-label={`Concluir tarefa ${task.title}`}><Check size={15}/>Concluir</button><button className="crm-cancel-task" disabled={busy} onClick={()=>onStatus('cancelled')} aria-label={`Cancelar tarefa ${task.title}`}><X size={15}/>Cancelar</button></>:<button className="ghost-btn" disabled={busy} onClick={()=>onStatus('open')} aria-label={`Reabrir tarefa ${task.title}`}>Reabrir</button>}</div>
  </article>;
}
