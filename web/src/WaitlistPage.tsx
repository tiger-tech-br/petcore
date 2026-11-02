import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Plus,RefreshCw} from 'lucide-react';
import {api,dateTime,today,zonedToISO} from './api';
import FormDialog from './FormDialog';
import {Empty,PageHeader} from './ui';

type Options={tutors:any[];pets:any[];professionals:any[];services:any[]};
type Props={setMessage:(value:string)=>void;setError:(value:string)=>void};
const blankOptions:Options={tutors:[],pets:[],professionals:[],services:[]};
const wallTime=(value:string)=>new Date(value).toLocaleString('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(' ','T');

export default function WaitlistPage({setMessage,setError}:Props) {
  const [rows,setRows]=useState<any[]>([]),[options,setOptions]=useState<Options>(blankOptions),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
  const [dialog,setDialog]=useState<'request'|'booking'|null>(null),[error,setLocalError]=useState(''),[busy,setBusy]=useState(false),[finding,setFinding]=useState(false),[offering,setOffering]=useState('');
  const [form,setForm]=useState({tutor_id:'',pet_id:'',service_id:'',professional_id:'',earliest_at:`${today()}T08:00`,latest_at:`${today()}T18:00`,notes:''});
  const [booking,setBooking]=useState<any|null>(null),[bookingTime,setBookingTime]=useState(''),[bookingProfessional,setBookingProfessional]=useState(''),[opportunities,setOpportunities]=useState<any[]>([]);
  const findingRequest=useRef(0);
  function setDialogError(value:string){setLocalError(value);if(value)setError(value);}

  async function load() {
    setLoading(true);setLoadError('');
    try {const [items,opts]=await Promise.all([api<any[]>('/calendar/waitlist'),api<Options>('/calendar/options')]);setRows(items);setOptions(opts);}
    catch(e){setLoadError((e as Error).message);setError((e as Error).message);} finally{setLoading(false);}
  }
  useEffect(()=>{void load();return()=>{findingRequest.current++;};},[]);
  function closeDialog(){if(busy)return;findingRequest.current++;setFinding(false);setDialog(null);}
  function openRequest(){setDialogError('');setDialog('request');}
  function prepareBooking(item:any){findingRequest.current++;setFinding(false);setBooking(item);setDialogError('');setOpportunities([]);setBookingTime(wallTime(item.earliest_at));setBookingProfessional(item.professional_id||options.professionals[0]?.id||'');setDialog('booking');}
  async function findOptions(item:any) {
    prepareBooking(item);const request=++findingRequest.current;setFinding(true);
    try {
      const result=await api<{options:any[]}>(`/calendar/waitlist/${item.id}/opportunities`);
      if(request!==findingRequest.current)return;
      setOpportunities(result.options);
      if(result.options.length){setBookingTime(wallTime(result.options[0].starts_at));setBookingProfessional(result.options[0].professional_id);}
    } catch(e){if(request===findingRequest.current)setDialogError((e as Error).message);} finally{if(request===findingRequest.current)setFinding(false);}
  }
  async function create(event:FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setDialogError('');
    try {
      await api('/calendar/waitlist','POST',{...form,professional_id:form.professional_id||null,earliest_at:zonedToISO(form.earliest_at),latest_at:zonedToISO(form.latest_at)});
      setDialog(null);setForm({...form,tutor_id:'',pet_id:'',notes:''});setMessage('Pedido incluído na lista de espera.');await load();
    } catch(e){setDialogError((e as Error).message);} finally{setBusy(false);}
  }
  async function offer(id:string) {
    if(offering)return;setOffering(id);
    try {await api(`/calendar/waitlist/${id}/offer`,'POST');setMessage('Oferta marcada internamente. Entre em contato com o tutor; nenhuma mensagem automática foi enviada.');await load();}
    catch(e){setError((e as Error).message);} finally{setOffering('');}
  }
  async function confirmBooking(event:FormEvent) {
    event.preventDefault();if(busy||!booking)return;setBusy(true);setDialogError('');
    try {await api(`/calendar/waitlist/${booking.id}/book`,'POST',{starts_at:zonedToISO(bookingTime),professional_id:bookingProfessional,tutor_consent:true});setDialog(null);setMessage('Encaixe confirmado e reservado.');await load();}
    catch(e){setDialogError((e as Error).message);} finally{setBusy(false);}
  }
  return <>
    <PageHeader eyebrow="APROVEITE OPORTUNIDADES" title="Lista de espera e encaixes" subtitle="Registre pedidos de horários e confirme encaixes sem sobreposição." action={<button className="primary-btn" onClick={openRequest}><Plus size={17}/>Adicionar à lista</button>}/>
    <section className="panel"><h2>Solicitações</h2>{loading?<Empty label="Carregando solicitações..."/>:rows.length?rows.map(item=><div className="wait-row" key={item.id}><strong>{item.pet_name}</strong><small>{item.tutor_name} · {item.service_name}<br/>{dateTime(item.earliest_at)} até {dateTime(item.latest_at)}</small><span className="status pending">{item.status==='waiting'?'Aguardando':item.status==='offered'?'Ofertado':item.status==='booked'?'Agendado':'Fechado'}</span>{['waiting','offered'].includes(item.status)&&<div className="action-row">{item.status==='waiting'&&<button className="ghost-btn" disabled={Boolean(offering)} onClick={()=>void offer(item.id)}>{offering===item.id?'Registrando...':'Registrar oferta'}</button>}<button className="ghost-btn" onClick={()=>void findOptions(item)}>Buscar horários</button><button className="primary-btn" onClick={()=>prepareBooking(item)}>Confirmar encaixe</button></div>}</div>):<Empty label="Nenhuma solicitação registrada."/>}</section>
    {dialog==='request'&&<FormDialog title="Adicionar à lista de espera" description="Informe o pet, o serviço e o período desejado." error={error||loadError} busy={busy} onClose={closeDialog} wide>
      {loading?<Empty label="Carregando opções..."/>:loadError?<button className="ghost-btn" onClick={()=>void load()}>Tentar carregar opções novamente</button>:<form className="form-grid" onSubmit={create}>
        <label>Tutor<select required disabled={busy} value={form.tutor_id} onChange={e=>setForm({...form,tutor_id:e.target.value,pet_id:''})}><option value="">Selecione</option>{options.tutors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Pet<select required disabled={busy} value={form.pet_id} onChange={e=>setForm({...form,pet_id:e.target.value})}><option value="">Selecione</option>{options.pets.filter(item=>item.tutor_id===form.tutor_id).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Serviço<select required disabled={busy} value={form.service_id} onChange={e=>setForm({...form,service_id:e.target.value})}><option value="">Selecione</option>{options.services.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Profissional (opcional)<select disabled={busy} value={form.professional_id} onChange={e=>setForm({...form,professional_id:e.target.value})}><option value="">Qualquer profissional</option>{options.professionals.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Disponível a partir de<input type="datetime-local" required disabled={busy} value={form.earliest_at} onChange={e=>setForm({...form,earliest_at:e.target.value})}/></label>
        <label>Disponível até<input type="datetime-local" required disabled={busy} value={form.latest_at} onChange={e=>setForm({...form,latest_at:e.target.value})}/></label>
        <label className="full-span">Observações<textarea disabled={busy} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Salvando...':'Adicionar à lista'}</button></div>
      </form>}
    </FormDialog>}
    {dialog==='booking'&&booking&&<FormDialog title={`Confirmar encaixe de ${booking.pet_name}`} description="Confirme a concordância do tutor antes de reservar. As sugestões podem deixar de estar disponíveis." error={error||loadError} busy={busy} onClose={closeDialog}>
      {finding?<Empty label="Buscando horários disponíveis..."/>:loadError?<button className="ghost-btn" onClick={()=>void load()}>Tentar carregar opções novamente</button>:<>
        {opportunities.length>0?<div className="checks" aria-label="Horários sugeridos">{opportunities.map((item,index)=><button key={index} className="ghost-btn" type="button" disabled={busy} onClick={()=>{setBookingTime(wallTime(item.starts_at));setBookingProfessional(item.professional_id);}}>{dateTime(item.starts_at)} · {item.professional_name}</button>)}</div>:<p className="muted">Informe o horário e o profissional para confirmar o encaixe.</p>}
        {error&&<button className="text-link" disabled={busy} onClick={()=>void findOptions(booking)}><RefreshCw size={15}/>Buscar horários novamente</button>}
        <form className="form-grid" onSubmit={confirmBooking}>
          <label>Início<input type="datetime-local" required disabled={busy} value={bookingTime} onChange={e=>setBookingTime(e.target.value)}/></label>
          <label>Profissional<select required disabled={busy} value={bookingProfessional} onChange={e=>setBookingProfessional(e.target.value)}><option value="">Selecione</option>{options.professionals.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Reservando...':'Confirmo autorização do tutor e reservo'}</button></div>
        </form>
      </>}
    </FormDialog>}
  </>;
}
