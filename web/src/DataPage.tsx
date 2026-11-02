import React, {useEffect, useState} from 'react';
import {Plus, RefreshCw, Search} from 'lucide-react';
import {api, money, zonedToISO, type Obj} from './api';
import FormDialog from './FormDialog';
import {Empty, PageHeader} from './ui';
import {parseCents} from './businessUi';

export type Resource = 'tutors'|'pets'|'professionals'|'services';
type Field = {key:string; label:string; kind?:'select'|'date'|'number'|'email'|'textarea'|'checkbox'; required?:boolean; options?:{value:string;label:string}[]};
const config:Record<Resource,{label:string;singular:string;subtitle:string;fields:Field[]}> = {
  tutors:{label:'Tutores',singular:'tutor',subtitle:'Contatos e informações dos responsáveis pelos pets.',fields:[{key:'name',label:'Nome completo',required:true},{key:'phone',label:'Telefone'},{key:'email',label:'E-mail',kind:'email'},{key:'email_reminders_opt_in',label:'Confirmo que o tutor autorizou receber lembretes de agendamento por e-mail.',kind:'checkbox'},{key:'notes',label:'Observações',kind:'textarea'}]},
  pets:{label:'Pets',singular:'pet',subtitle:'Histórico e dados dos animais atendidos.',fields:[{key:'name',label:'Nome do pet',required:true},{key:'tutor_id',label:'Tutor responsável',kind:'select',required:true},{key:'species',label:'Espécie',required:true},{key:'breed',label:'Raça'},{key:'size',label:'Porte',kind:'select',required:true,options:[{value:'pequeno',label:'Pequeno'},{value:'medio',label:'Médio'},{value:'grande',label:'Grande'}]},{key:'birth_date',label:'Nascimento',kind:'date'},{key:'notes',label:'Observações de atendimento',kind:'textarea'}]},
  professionals:{label:'Profissionais',singular:'profissional',subtitle:'Equipe técnica, serviços habilitados e horários de trabalho.',fields:[{key:'name',label:'Nome do profissional',required:true},{key:'user_id',label:'Conta do funcionário (opcional)',kind:'select'},{key:'active',label:'Ativo',kind:'checkbox'}]},
  services:{label:'Serviços',singular:'serviço',subtitle:'Serviços, preços, duração e disponibilidade.',fields:[{key:'name',label:'Nome do serviço',required:true},{key:'description',label:'Descrição',kind:'textarea'},{key:'price_cents',label:'Preço (R$)',kind:'number',required:true},{key:'duration_minutes',label:'Duração (minutos)',kind:'number',required:true},{key:'active',label:'Ativo',kind:'checkbox'}]}
};

type Props = {resource:Resource; setMessage:(value:string)=>void; setError:(value:string)=>void; initialSearch?:string};
export default function DataPage({resource,setMessage,setError,initialSearch=''}:Props) {
  const [rows,setRows] = useState<any[]>([]), [tutors,setTutors] = useState<any[]>([]), [team,setTeam] = useState<any[]>([]);
  const [loading,setLoading] = useState(true), [loadError,setLoadError] = useState(''), [search,setSearch] = useState(initialSearch);
  const [editing,setEditing] = useState<any|null>(null), [form,setForm] = useState<Record<string,any>>({}), [showForm,setShowForm] = useState(false);
  const [scheduleId,setScheduleId] = useState<string|null>(null), [busy,setBusy] = useState<'save'|'upload'|null>(null);
  const [dialogError,setDialogError] = useState(''), [dialogNotice,setDialogNotice] = useState('');
  const def = config[resource];
  const emptyMessages:Record<Resource,string>={tutors:'Cadastre o primeiro cliente em Adicionar tutor. Depois, abra a aba Pets para vincular seu animal.',pets:'Cadastre o cliente primeiro. Depois use Adicionar pet e selecione o tutor responsável.',professionals:'Use Adicionar profissional. Após salvar, clique em Horários para definir a jornada e habilitar os serviços.',services:'Use Adicionar serviço e informe o preço e a duração. Depois, habilite o serviço nos Horários do profissional.'};

  async function load(onError = setError) {
    setLoading(true);setLoadError('');
    try {
      setRows(await api<any[]>(`/data/${resource}`));
      if (resource === 'pets') setTutors(await api<any[]>('/data/tutors'));
      if (resource === 'professionals') setTeam(await api<any[]>('/team').catch(()=>[]));
    } catch (error) {const message=(error as Error).message;setLoadError(message);onError(message);if (onError !== setError) setError(message);} finally {setLoading(false);}
  }
  useEffect(()=>{void load();},[resource]);
  const filtered = rows.filter(row=>String(row.name||'').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));

  function open(record?:any) {
    setEditing(record||null);
    setForm(record ? {...record,price_cents:resource === 'services' ? record.price_cents/100 : record.price_cents} : {active:true,size:'medio',duration_minutes:60,price_cents:0,notes:'',phone:'',description:'',email_reminders_opt_in:false});
    setDialogError('');setDialogNotice('');setScheduleId(null);setShowForm(true);
  }
  function closeForm() {if (!busy) setShowForm(false);}
  async function save(event:React.FormEvent) {
    event.preventDefault();if (busy || loading || loadError) return;
    setBusy('save');setDialogError('');setDialogNotice('');
    try {
      const values:Obj = {};
      for (const field of def.fields) {
        let value = form[field.key];
        if (field.kind === 'checkbox') value = Boolean(value);
        if (field.kind === 'number') value = field.key === 'price_cents' ? parseCents(String(value??'0')) : Number(value||0);
        if (value === '' && ['birth_date','breed','email','user_id'].includes(field.key)) value = null;
        if (value !== undefined) values[field.key] = value;
      }
      await api(`/data/${resource}${editing ? '/'+editing.id : ''}`,editing ? 'PATCH' : 'POST',values);
      setMessage(`${def.singular[0].toUpperCase()+def.singular.slice(1)} ${editing ? 'atualizado' : 'cadastrado'} com sucesso.${resource==='professionals'?' Agora abra Horários para definir a jornada e os serviços realizados.':''}`);
      setShowForm(false);await load();
    } catch (error) {const message=(error as Error).message;setDialogError(message);setError(message);} finally {setBusy(null);}
  }
  async function uploadPhoto(event:React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget, file = input.files?.[0];
    if (!file || busy || loading || loadError || !editing) return;
    setBusy('upload');setDialogError('');setDialogNotice('');
    try {
      const data = new FormData();data.append('photo',file);
      const response = await fetch(`/api/pets/${editing.id}/photo`,{method:'POST',credentials:'include',headers:{'X-PetCore-Request':'1'},body:data});
      const reply = await response.json();
      if (!response.ok) throw Error(reply.error||'Falha ao enviar foto');
      setDialogNotice('Foto enviada à nuvem.');setMessage('Foto enviada à nuvem.');await load(setDialogError);
    } catch (error) {const message=(error as Error).message;setDialogError(message);setError(message);} finally {setBusy(null);input.value='';}
  }

  return <>
    <PageHeader eyebrow="CADASTROS DA EMPRESA" title={def.label} subtitle={def.subtitle} action={<button className="primary-btn" aria-haspopup="dialog" onClick={()=>open()}><Plus size={17}/>Adicionar {def.singular}</button>}/>
    <div className="panel">
      <div className="list-tools"><div className="search-box"><Search size={17}/><input aria-label={`Buscar ${def.label}`} placeholder={`Buscar ${def.label.toLowerCase()}...`} value={search} onChange={event=>setSearch(event.target.value)}/></div><span className="count">{filtered.length} registros</span><button title="Atualizar" aria-label="Atualizar lista" className="icon-button" disabled={loading} onClick={()=>load()}><RefreshCw size={18}/></button></div>
      {loading ? <Empty label="Carregando registros..."/> : filtered.length ? <div className="table-wrap"><table><thead><tr><th>Nome</th><th>{resource === 'pets' ? 'Tutor' : resource === 'services' ? 'Preço' : resource === 'tutors' ? 'Telefone' : 'Situação'}</th><th>{resource === 'services' ? 'Duração' : resource === 'pets' ? 'Espécie' : resource === 'tutors' ? 'E-mail' : ''}</th><th>Ações</th></tr></thead><tbody>{filtered.map(row=><tr key={row.id}>
        <td><strong>{row.name}</strong></td><td>{resource === 'pets' ? row.tutor_name : resource === 'services' ? money(row.price_cents) : resource === 'tutors' ? row.phone : row.active ? 'Ativo' : 'Inativo'}</td><td>{resource === 'services' ? row.duration_minutes+' min' : resource === 'pets' ? row.species : resource === 'tutors' ? row.email : ''}</td>
        <td><button className="table-action" aria-haspopup="dialog" onClick={()=>open(row)}>Editar</button>{resource === 'pets' && row.photo_key && <button className="table-action" onClick={async()=>{try {const result=await api<{url:string}>(`/pets/${row.id}/photo-url`);window.open(result.url,'_blank','noopener,noreferrer');} catch(error) {setError((error as Error).message);}}}>Ver foto</button>}{resource === 'professionals' && <button className="table-action" aria-haspopup="dialog" onClick={()=>{setScheduleId(row.id);setShowForm(false);}}>Horários</button>}</td>
      </tr>)}</tbody></table></div> : <Empty label={search ? 'Nenhum registro corresponde à busca.' : emptyMessages[resource]}/>}
      {resource==='professionals'&&rows.length>0&&<p className="business-form-hint">Depois do cadastro, use Horários para marcar os dias de trabalho e os serviços que cada profissional realiza. Essa configuração libera os horários na agenda.</p>}
    </div>
    {showForm && <FormDialog title={`${editing ? 'Editar' : 'Cadastrar'} ${def.singular}`} description={editing ? `Atualize as informações de ${editing.name}.` : def.subtitle} onClose={closeForm} busy={Boolean(busy)} error={dialogError||loadError} notice={dialogNotice} wide={resource === 'pets'}>
      <form onSubmit={save} className="form-grid">
        {loading && <p className="full-span muted" role="status">Carregando informações para o cadastro...</p>}
        {loadError && !loading && <div className="full-span"><p className="muted">Carregue novamente as informações antes de salvar.</p><button type="button" className="ghost-btn" disabled={Boolean(busy)} onClick={()=>{setDialogError('');void load(setDialogError);}}><RefreshCw size={16}/>Tentar carregar novamente</button></div>}
        {def.fields.map(field=><label key={field.key} className={field.kind === 'textarea' || field.key === 'email_reminders_opt_in' ? 'full-span' : ''}>{field.kind === 'checkbox' ? <span className="check-label"><input type="checkbox" checked={Boolean(form[field.key])} disabled={Boolean(busy)||(field.key==='email_reminders_opt_in'&&!form.email)} onChange={event=>setForm({...form,[field.key]:event.target.checked})}/>{field.label}</span> : <>
          {field.label}{field.kind === 'select' ? <select required={field.required} value={form[field.key]??''} disabled={Boolean(busy)} onChange={event=>setForm({...form,[field.key]:event.target.value})}><option value="">Selecione</option>{(field.key === 'tutor_id' ? tutors.map(tutor=>({value:tutor.id,label:tutor.name})) : field.key === 'user_id' ? team.filter(user=>user.role === 'employee').map(user=>({value:user.id,label:user.name})) : field.options||[]).map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.kind === 'textarea' ? <textarea value={form[field.key]??''} disabled={Boolean(busy)} onChange={event=>setForm({...form,[field.key]:event.target.value})}/> : <input required={field.required} type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : field.kind === 'email' ? 'email' : 'text'} min={field.kind === 'number' ? 0 : undefined} step={field.kind === 'number' && field.key === 'price_cents' ? '0.01' : field.kind === 'number' ? '1' : undefined} value={form[field.key]??''} disabled={Boolean(busy)} onChange={event=>setForm({...form,[field.key]:event.target.value,...(resource==='tutors'&&field.key==='email'&&event.target.value.trim().toLowerCase()!==String(form.email??'').trim().toLowerCase()?{email_reminders_opt_in:false}:{})})}/>}</>}</label>)}
        {resource === 'tutors' && <p className="full-span muted">Marque somente se o tutor autorizou o recebimento. A opção é desmarcada por padrão e pode ser desativada posteriormente. Se mudar o e-mail, confirme novamente a autorização para o novo endereço.</p>}
        {resource === 'pets' && editing && <div className="full-span photo-control"><strong>Foto armazenada na nuvem (JPEG/PNG/WebP, até 5 MB)</strong><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Enviar foto do pet" disabled={Boolean(busy)||loading||Boolean(loadError)} onChange={uploadPhoto}/>{busy === 'upload' && <span role="status">Enviando foto...</span>}</div>}
        <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={Boolean(busy)} onClick={closeForm}>Cancelar</button><button className="primary-btn" type="submit" disabled={Boolean(busy)||loading||Boolean(loadError)}>{busy === 'save' ? 'Salvando...' : loading ? 'Carregando...' : 'Salvar informações'}</button></div>
      </form>
    </FormDialog>}
    {resource === 'professionals' && scheduleId && <ScheduleEditor id={scheduleId} onClose={()=>setScheduleId(null)} setMessage={setMessage} setError={setError}/>}
  </>;
}

const DAYS = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
function ScheduleEditor({id,onClose,setMessage,setError:reportError}:{id:string;onClose:()=>void;setMessage:(value:string)=>void;setError:(value:string)=>void}) {
  const [schedule,setSchedule] = useState<any>({shifts:[],breaks:[],serviceIds:[]}), [services,setServices] = useState<any[]>([]);
  const [loading,setLoading] = useState(true), [loaded,setLoaded] = useState(false), [step,setStep] = useState<'schedule'|'absence'>('schedule');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const [absenceStart,setAbsenceStart] = useState(''), [absenceEnd,setAbsenceEnd] = useState(''), [absenceReason,setAbsenceReason] = useState('');

  async function load() {
    setLoading(true);setError('');
    try {const [data,available] = await Promise.all([api<any>(`/professionals/${id}/schedule`),api<any[]>('/data/services')]);setSchedule(data);setServices(available);setLoaded(true);}
    catch(failure) {const message=(failure as Error).message;setError(message);reportError(message);} finally {setLoading(false);}
  }
  useEffect(()=>{void load();},[id]);
  const shift = (weekday:number)=>schedule.shifts.find((entry:any)=>entry.weekday === weekday);
  function changeShift(weekday:number,key:'start_time'|'end_time',value:string) {
    const current = shift(weekday) || {weekday,start_time:'08:00',end_time:'18:00'};
    setSchedule({...schedule,shifts:[...schedule.shifts.filter((entry:any)=>entry.weekday !== weekday),{...current,[key]:value}]});
  }
  function toggleDay(weekday:number) {setSchedule({...schedule,shifts:shift(weekday) ? schedule.shifts.filter((entry:any)=>entry.weekday !== weekday) : [...schedule.shifts,{weekday,start_time:'08:00',end_time:'18:00'}]});}
  function changeStep(next:'schedule'|'absence') {setStep(next);setError('');setNotice('');}
  async function addAbsence(event:React.FormEvent) {
    event.preventDefault();if (busy) return;setBusy(true);setError('');setNotice('');
    try {
      await api(`/professionals/${id}/absences`,'POST',{starts_at:zonedToISO(absenceStart),ends_at:zonedToISO(absenceEnd),reason:absenceReason});
      setNotice('Indisponibilidade registrada no servidor.');setMessage('Indisponibilidade registrada no servidor.');setAbsenceStart('');setAbsenceEnd('');setAbsenceReason('');
    } catch(failure) {const message=(failure as Error).message;setError(message);reportError(message);} finally {setBusy(false);}
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();if (busy) return;setBusy(true);setError('');setNotice('');
    try {await api(`/professionals/${id}/schedule`,'PUT',schedule);setMessage('Horários e habilitações atualizados.');onClose();}
    catch(failure) {const message=(failure as Error).message;setError(message);reportError(message);} finally {setBusy(false);}
  }

  return <FormDialog title={step === 'schedule' ? 'Jornada e serviços permitidos' : 'Folgas e indisponibilidades'} description="Configure os horários de trabalho e a disponibilidade do profissional." onClose={()=>{if (!busy) onClose();}} wide busy={busy} error={error} notice={notice}>
    <div className="segmented" aria-label="Configuração do profissional"><button type="button" className={step === 'schedule' ? 'chosen' : ''} aria-pressed={step === 'schedule'} disabled={busy} onClick={()=>changeStep('schedule')}>Jornada e serviços</button><button type="button" className={step === 'absence' ? 'chosen' : ''} aria-pressed={step === 'absence'} disabled={busy} onClick={()=>changeStep('absence')}>Folgas</button></div>
    {loading ? <Empty label="Carregando jornada..."/> : !loaded ? <div className="empty"><p>Não foi possível carregar a jornada.</p><button className="ghost-btn" type="button" onClick={()=>load()}>Tentar novamente</button></div> : step === 'schedule' ? <form onSubmit={save}>
      <p className="business-form-hint">Marque os dias de trabalho, informe início e fim e escolha os serviços habilitados abaixo. Depois, salve a jornada para liberar os horários na agenda.</p>
      <h3>Dias e horários de trabalho</h3>
      <div className="shifts-grid">{DAYS.map((day,index)=><div className="shift-line" key={day}><label><input type="checkbox" disabled={busy} checked={Boolean(shift(index+1))} onChange={()=>toggleDay(index+1)}/>{day}</label>{shift(index+1) && <><input aria-label={`Início ${day}`} required disabled={busy} type="time" value={shift(index+1).start_time} onChange={event=>changeShift(index+1,'start_time',event.target.value)}/><input aria-label={`Fim ${day}`} required disabled={busy} type="time" value={shift(index+1).end_time} onChange={event=>changeShift(index+1,'end_time',event.target.value)}/></>}</div>)}</div>
      <h3>Intervalos de descanso</h3>
      <div className="checks">{schedule.breaks.map((entry:any,index:number)=><div key={index} className="break-item"><span>{DAYS[entry.weekday-1]} · {entry.start_time}–{entry.end_time}</span><button type="button" disabled={busy} className="text-link" onClick={()=>setSchedule({...schedule,breaks:schedule.breaks.filter((_:any,position:number)=>position !== index)})}>Remover</button></div>)}<button type="button" disabled={busy} className="ghost-btn" onClick={()=>setSchedule({...schedule,breaks:[...schedule.breaks,{weekday:1,start_time:'12:00',end_time:'13:00'}]})}>Adicionar intervalo na segunda</button></div>
      {schedule.breaks.length > 0 && <div className="form-grid">{schedule.breaks.map((entry:any,index:number)=><React.Fragment key={index}><label>Dia<select disabled={busy} value={entry.weekday} onChange={event=>setSchedule({...schedule,breaks:schedule.breaks.map((item:any,position:number)=>position === index ? {...item,weekday:Number(event.target.value)} : item)})}>{DAYS.map((day,position)=><option value={position+1} key={day}>{day}</option>)}</select></label><div className="break-hours"><input aria-label="Início do intervalo" required disabled={busy} type="time" value={entry.start_time} onChange={event=>setSchedule({...schedule,breaks:schedule.breaks.map((item:any,position:number)=>position === index ? {...item,start_time:event.target.value} : item)})}/><input aria-label="Fim do intervalo" required disabled={busy} type="time" value={entry.end_time} onChange={event=>setSchedule({...schedule,breaks:schedule.breaks.map((item:any,position:number)=>position === index ? {...item,end_time:event.target.value} : item)})}/></div></React.Fragment>)}</div>}
      <h3>Serviços habilitados</h3>
      {!services.length&&<p className="business-setup-hint">Ainda não há serviços cadastrados. Feche esta janela, cadastre os serviços no menu Serviços e volte para habilitá-los aqui.</p>}
      <div className="checks">{services.map(service=><label key={service.id}><input type="checkbox" disabled={busy} checked={schedule.serviceIds.includes(service.id)} onChange={event=>setSchedule({...schedule,serviceIds:event.target.checked ? [...schedule.serviceIds,service.id] : schedule.serviceIds.filter((value:string)=>value !== service.id)})}/>{service.name}</label>)}</div>
      <div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Salvando...' : 'Salvar jornada'}</button></div>
    </form> : <form className="form-grid" onSubmit={addAbsence}>
      <label>Início<input required disabled={busy} type="datetime-local" value={absenceStart} onChange={event=>setAbsenceStart(event.target.value)}/></label><label>Fim<input required disabled={busy} type="datetime-local" value={absenceEnd} onChange={event=>setAbsenceEnd(event.target.value)}/></label><label className="full-span">Motivo<input disabled={busy} value={absenceReason} onChange={event=>setAbsenceReason(event.target.value)}/></label>
      <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Registrando...' : 'Registrar indisponibilidade'}</button></div>
    </form>}
  </FormDialog>;
}
