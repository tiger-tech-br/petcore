import {useEffect, useMemo, useState} from 'react';
import {AlertCircle, ArrowRight, CalendarCheck2, CalendarDays, CheckCircle2, Clock3, PawPrint, Plus, Scissors, Stethoscope, UsersRound, Wallet} from 'lucide-react';
import {api, endIso, money, startIso, today} from './api';

type Target = 'calendar'|'tutors'|'pets'|'waitlist';
type Appointment = {id:string;pet_name:string;tutor_name:string;professional_id:string;professional_name:string;starts_at:string;status:string;services:{name:string;price_cents:number}[]};
const labels:Record<string,string> = {pending:'A confirmar',confirmed:'Confirmado',in_progress:'Em atendimento',done:'Concluído',cancelled:'Cancelado',no_show:'Cliente faltou'};
const statusIcons = {pending:Clock3,confirmed:CalendarCheck2,in_progress:Stethoscope,done:CheckCircle2,cancelled:AlertCircle,no_show:AlertCircle};

function AppointmentStatus({status}:{status:string}) {
  const Icon = statusIcons[status as keyof typeof statusIcons] || Clock3;
  return <span className={`status ${status}`}><Icon size={15}/>{labels[status]||status}</span>;
}
function Metric({label,value,icon:Icon,tone='teal',className=''}:{label:string;value:string|number;icon:typeof CalendarDays;tone?:string;className?:string}) {
  return <div className={`overview-stat ${tone} ${className}`}><span className="overview-stat-icon"><Icon size={29} strokeWidth={1.7}/></span><div><strong>{value}</strong><span>{label}</span></div></div>;
}
export default function Overview({go,can,onNew,query=''}:{go:(target:Target)=>void;can:(permission?:string)=>boolean;onNew:()=>void;query?:string}) {
  const [appointments,setAppointments] = useState<Appointment[]>([]), [tutors,setTutors] = useState<any[]>([]), [pets,setPets] = useState<any[]>([]);
  const [loading,setLoading] = useState(true), [error,setError] = useState(''), [professional,setProfessional] = useState('');
  useEffect(()=>{
    let active = true;
    const from = encodeURIComponent(startIso(today())), to = encodeURIComponent(endIso(today()));
    Promise.all([
      can('appointments') ? api<Appointment[]>(`/calendar/appointments?from=${from}&to=${to}`) : Promise.resolve([]),
      can('tutors') ? api<any[]>('/data/tutors') : Promise.resolve([]),
      can('pets') ? api<any[]>('/data/pets') : Promise.resolve([])
    ]).then(([a,t,p])=>{if(active){setAppointments(a);setTutors(t);setPets(p);}})
      .catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);
  const pending = appointments.filter(x=>x.status==='pending');
  const ongoing = appointments.filter(x=>x.status==='in_progress');
  const completed = appointments.filter(x=>x.status==='done');
  const professionals = [...new Map(appointments.map(a=>[a.professional_id,a.professional_name])).entries()];
  const filtered = useMemo(()=>appointments.filter(a=>(!professional||a.professional_id===professional)&&(!query||`${a.pet_name} ${a.tutor_name} ${a.professional_name} ${a.services.map(s=>s.name).join(' ')}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))),[appointments,professional,query]);
  const value = (n:number)=>loading?'—':n;
  const date = new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',weekday:'long',day:'numeric',month:'long'});
  const time = (s:string)=>new Date(s).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).replace(':','h');
  return <div className="overview-page">
    <div className="page-header overview-heading"><div><h1><span className="desktop-heading">Visão geral</span><span className="mobile-heading">Hoje</span></h1><p>{date.charAt(0).toUpperCase()+date.slice(1)}</p></div>{can('appointments')&&<button className="primary-btn new-appointment" onClick={onNew} aria-label="Novo agendamento"><Plus size={23}/><span>Novo agendamento</span></button>}</div>
    {error&&<div className="alert danger" role="alert"><AlertCircle size={18}/>{error}</div>}
    <div className="overview-stats">
      {can('appointments')&&<><Metric label="atendimentos hoje" value={value(appointments.length)} icon={CalendarDays}/><Metric label="em atendimento" value={value(ongoing.length)} icon={Stethoscope}/><Metric label="a confirmar" value={value(pending.length)} icon={Clock3} tone="amber" className="secondary-metric"/></>}
      {can('pets')&&<Metric label="pets cadastrados" value={value(pets.length)} icon={PawPrint} className="secondary-metric"/>}
    </div>
    <div className="overview-grid">
      <section className="panel today-panel">
        <div className="panel-head"><h2><CalendarDays size={26}/><span className="desktop-heading">Agenda de hoje</span><span className="mobile-heading">Próximos atendimentos</span></h2><div className="agenda-actions"><select aria-label="Filtrar agenda por profissional" value={professional} onChange={e=>setProfessional(e.target.value)}><option value="">Todos os profissionais</option>{professionals.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>{can('appointments')&&<button className="text-link" onClick={()=>go('calendar')}><span className="desktop-heading">Abrir agenda</span><span className="mobile-heading">Ver agenda</span><ArrowRight size={15}/></button>}</div></div>
        {loading?<div className="empty"><CalendarDays size={30}/><p>Carregando a agenda de hoje...</p></div>:!can('appointments')?<div className="empty"><CalendarDays size={30}/><p>Seu acesso não inclui a agenda de atendimentos.</p></div>:filtered.length?<>
          <div className="today-table-wrap"><table className="today-table"><thead><tr><th>Horário</th><th>Pet e tutor</th><th>Serviço</th><th>Profissional</th><th>Situação</th></tr></thead><tbody>{filtered.map((a,i)=><tr key={a.id}>
            <td>{time(a.starts_at)}</td><td><div className="pet-cell"><span className={`pet-avatar color-${i%5}`}><PawPrint size={22} fill="currentColor" strokeWidth={1}/></span><span><strong>{a.pet_name}</strong><small>{a.tutor_name}</small></span></div></td><td>{a.services.map(s=>s.name).join(' e ')}</td><td>{a.professional_name}</td><td><AppointmentStatus status={a.status}/></td>
          </tr>)}</tbody></table></div>
          <div className="today-mobile-list">{filtered.filter(a=>['confirmed','in_progress'].includes(a.status)).map((a,i)=><button className="mobile-appointment" key={a.id} onClick={()=>go('calendar')}><time>{time(a.starts_at)}</time><span className={`pet-avatar color-${i%5}`}><PawPrint size={22} fill="currentColor" strokeWidth={1}/></span><span className="mobile-pet-info"><strong>{a.pet_name}</strong><small>{a.services.map(s=>s.name).join(' e ')} · {a.professional_name}</small></span><AppointmentStatus status={a.status}/></button>)}{filtered.every(a=>['done','cancelled','no_show'].includes(a.status))&&<div className="empty"><CheckCircle2 size={26}/><p>Todos os atendimentos de hoje foram finalizados.</p></div>}</div>
        </>:<div className="empty"><CalendarDays size={32}/><p>{query||professional?'Nenhum atendimento encontrado com esse filtro.':'Nenhum atendimento agendado para hoje.'}</p>{!query&&!professional&&<button className="text-link" onClick={onNew}>Agendar um atendimento <ArrowRight size={15}/></button>}</div>}
      </section>
      <div className="overview-aside">
        <section className="panel pending-panel" id="pending-panel"><div className="panel-head"><h2><AlertCircle size={24}/>Pendências</h2>{pending.length>0&&<button className="text-link" onClick={()=>go('calendar')}>Ver todas <ArrowRight size={14}/></button>}</div>
          {loading?<p className="pending-empty">Consultando pendências...</p>:pending.length?pending.slice(0,2).map(a=><div className="pending-item" key={a.id}><span className="pending-icon"><CalendarCheck2 size={24}/></span><div><strong>Confirmar horário de {a.pet_name}</strong><p>{a.services.map(s=>s.name).join(' e ')} · {time(a.starts_at)}</p><button className="text-link" onClick={()=>go('calendar')}>Ver atendimento <ArrowRight size={14}/></button></div></div>):<div className="pending-clear"><CheckCircle2 size={26}/><strong>Tudo em dia!</strong><p>Você não tem horários aguardando confirmação hoje.</p></div>}
        </section>
        <section className="dog-reminder"><div><p>Confira os horários que ainda precisam de confirmação.</p><button className="text-link" disabled={!can('appointments')} onClick={()=>go('calendar')}>Ver pendências <ArrowRight size={16}/></button></div><img src="/images/petcore-dog.png" alt="Cachorro PetCore com gravata do Brasil"/></section>
      </div>
    </div>
    <div className="overview-bottom">
      {can('appointments')&&<section className="panel service-summary"><div className="panel-head"><h2><Wallet size={24}/>Serviços de hoje</h2><button className="text-link" onClick={()=>go('calendar')}>Ver agenda <ArrowRight size={15}/></button></div><div className="summary-values"><div><span>Valor agendado</span><strong>{loading?'—':money(appointments.filter(a=>!['cancelled','no_show'].includes(a.status)).reduce((sum,a)=>sum+a.services.reduce((n,s)=>n+s.price_cents,0),0))}</strong></div><div><span>Concluídos</span><strong>{value(completed.length)}</strong></div><div><span>Em andamento</span><strong>{value(ongoing.length)}</strong></div></div><small className="summary-note">Valores dos serviços agendados; não representam recebimentos.</small></section>}
      {(can('tutors')||can('pets'))&&<section className="panel records-summary"><div className="panel-head"><h2><UsersRound size={24}/>Clientes e pets</h2><button className="text-link" onClick={()=>go(can('tutors')?'tutors':'pets')}>Ver cadastros <ArrowRight size={15}/></button></div>{can('tutors')&&<button className="record-summary-row" onClick={()=>go('tutors')}><span><span className="record-dot"/>Clientes cadastrados</span><strong>{value(tutors.length)}</strong><ArrowRight size={16}/></button>}{can('pets')&&<button className="record-summary-row" onClick={()=>go('pets')}><span><span className="record-dot teal"/>Pets cadastrados</span><strong>{value(pets.length)}</strong><ArrowRight size={16}/></button>}</section>}
    </div>
    <p className="dashboard-footnote"><PawPrint size={12}/> Mais organização. Mais tempo para cuidar.</p>
  </div>;
}
