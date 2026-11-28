import {useEffect,useState,type FormEvent} from 'react';
import {Mail,Settings2,UsersRound} from 'lucide-react';
import {api} from './api';
import FormDialog from './FormDialog';
import {Empty,PageHeader} from './ui';
import PublicBookingSettings from './PublicBookingSettings';
import TransportSettingsPanel from './TransportSettingsPanel';
import './styles/_shop-settings.scss';

type Props={setMessage:(value:string)=>void;setError:(value:string)=>void;onSettingsSaved?:()=>void|Promise<void>;isAdmin?:boolean};
const permissions=[['appointments','Atendimentos'],['agenda:all','Agenda de todos os profissionais'],['tutors','Clientes'],['pets','Pets'],['crm','CRM e relacionamento com clientes'],['waitlist','Lista de espera'],['taxi_dog','Táxi Dog: endereços, motoristas, buscas e entregas'],['transport_driver','Área do motorista: somente suas viagens e localização'],['services','Serviços'],['professionals','Profissionais'],['inventory','Produtos e estoque'],['finance','Financeiro, vendas, caixa e relatórios']];

export default function TeamPage({setMessage,setError,onSettingsSaved,isAdmin=true}:Props) {
  const [rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[dialog,setDialog]=useState<'invite'|'permissions'|'settings'|null>(null);
  const [editing,setEditing]=useState<any|null>(null),[email,setEmail]=useState(''),[invite,setInvite]=useState(''),[error,setLocalError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  function setDialogError(value:string){setLocalError(value);if(value)setError(value);}
  async function load(){setLoading(true);try{setRows(await api<any[]>('/team'));}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  function openInvite(){setEmail('');setInvite('');setDialogError('');setNotice('');setDialog('invite');}
  function openPermissions(item:any){setEditing({...item,permissions:[...item.permissions]});setDialogError('');setNotice('');setDialog('permissions');}
  async function create(event:FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setDialogError('');
    try {const result=await api<any>('/auth/invites','POST',{email});setInvite(`${location.origin}/?invite=${result.inviteToken}`);setNotice('Convite criado. Compartilhe o link com o funcionário.');setMessage('Convite de funcionário criado. Compartilhe o link com segurança.');}
    catch(e){setDialogError((e as Error).message);}finally{setBusy(false);}
  }
  async function save(event:FormEvent) {
    event.preventDefault();if(busy||!editing)return;setBusy(true);setDialogError('');
    try {await api(`/team/${editing.id}`,'PATCH',{permissions:editing.permissions,active:editing.active});setDialog(null);setMessage('Permissões salvas.');await load();}
    catch(e){setDialogError((e as Error).message);}finally{setBusy(false);}
  }
  async function copy(){try{await navigator.clipboard.writeText(invite);setNotice('Convite copiado.');}catch{setDialogError('Não foi possível copiar automaticamente. Selecione e copie o link.');}}
  return <div className="shop-settings-page">
    <PageHeader eyebrow="SEU PET SHOP" title="Meu pet shop" subtitle="Escolha como você trabalha e compartilhe o agendamento com seus clientes." action={isAdmin?<button className="primary-btn" onClick={()=>setDialog('settings')}><Settings2 size={19}/>Preferências do pet shop</button>:undefined}/>
    {isAdmin&&<PublicBookingSettings setMessage={setMessage} setError={setError}/>}
    {isAdmin&&<TransportSettingsPanel setMessage={setMessage} setError={setError} onSaved={onSettingsSaved}/>}
    <section className="panel shop-team-panel"><details><summary><UsersRound size={23}/><span>Pessoas com acesso</span><span className="shop-settings-optional">{loading?'Carregando...':`${rows.length} ${rows.length===1?'conta':'contas'}`}</span></summary><div className="shop-team-content"><p>Se você atende sozinho, use sua própria conta. Convide outra pessoa quando precisar dividir o trabalho.</p>{loading?<Empty label="Carregando contas..."/>:rows.length?rows.map(item=><div key={item.id} className="team-row"><strong>{item.name}</strong><small>{item.email} · {item.role==='admin'?'Responsável pelo pet shop':'Acesso da equipe'}</small>{item.role==='employee'&&<><span className={`status ${item.active?'confirmed':'cancelled'}`}>{item.active?'Conta ativa':'Conta inativa'}</span>{isAdmin&&<div className="action-row"><button className="ghost-btn" onClick={()=>openPermissions(item)} aria-label={`Editar permissões de ${item.name}`}>Editar acesso</button></div>}</>}</div>):<Empty label="Nenhuma conta encontrada."/>}{isAdmin&&<button type="button" className="ghost-btn" onClick={openInvite}><Mail size={18}/>Convidar outra pessoa</button>}</div></details></section>
    {dialog==='settings'&&<SettingsDialog onClose={()=>setDialog(null)} setMessage={setMessage} setPageError={setError} onSaved={onSettingsSaved}/>}
    {dialog==='invite'&&<FormDialog title={invite?'Convite do funcionário':'Convidar funcionário'} description="Cada funcionário usa uma conta individual." busy={busy} error={error} notice={notice} onClose={()=>setDialog(null)}>
      {invite?<><div className="invitation"><strong>Link de convite</strong><textarea readOnly aria-label="Link de convite do funcionário" value={invite}/><button type="button" className="ghost-btn" onClick={()=>void copy()}>Copiar convite</button><small>Envie o link ao funcionário. Nenhuma mensagem automática foi enviada.</small></div><div className="form-actions"><button type="button" className="primary-btn" onClick={()=>setDialog(null)}>Concluir</button></div></>:<form className="stack-form" onSubmit={create}><label>E-mail profissional<input type="email" required disabled={busy} value={email} onChange={e=>setEmail(e.target.value)}/></label><div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Gerando...':'Gerar convite'}</button></div></form>}
    </FormDialog>}
    {dialog==='permissions'&&editing&&<FormDialog title={`Permissões de ${editing.name}`} description="As alterações de acesso são verificadas pelo servidor." busy={busy} error={error} onClose={()=>setDialog(null)}>
      <form className="stack-form" onSubmit={save}><div className="checks">{permissions.map(([value,label])=><label key={value}><input type="checkbox" disabled={busy} checked={editing.permissions.includes(value)} onChange={e=>setEditing({...editing,permissions:e.target.checked?[...editing.permissions,value]:editing.permissions.filter((item:string)=>item!==value)})}/>{label}</label>)}</div><label className="check-label"><input type="checkbox" disabled={busy} checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/>Conta ativa</label><div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Salvando...':'Salvar permissões'}</button></div></form>
    </FormDialog>}
  </div>;
}

function SettingsDialog({onClose,setMessage,setPageError,onSaved}:{onClose:()=>void;setMessage:(value:string)=>void;setPageError:(value:string)=>void;onSaved?:()=>void|Promise<void>}) {
  const [settings,setSettings]=useState<any|null>(null),[error,setLocalError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  function setError(value:string){setLocalError(value);if(value)setPageError(value);}
  async function load(){setLoading(true);setError('');try{setSettings(await api('/settings'));}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function save(event:FormEvent) {
    event.preventDefault();if(busy||!settings)return;setBusy(true);setError('');
    try {await api('/settings','PATCH',{late_tolerance_minutes:Number(settings.late_tolerance_minutes),reminder_minutes_before:Number(settings.reminder_minutes_before),taxi_dog_enabled:settings.taxi_dog_enabled===true,delivery_enabled:settings.operation_mode!=='essential'&&settings.delivery_enabled===true,operation_mode:settings.operation_mode||'complete'});setMessage('Preferências do pet shop salvas.');onClose();await onSaved?.();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <FormDialog title="Preferências do pet shop" description="Escolha o que seu pet shop oferece e ajuste sua rotina de atendimento." onClose={onClose} busy={busy} error={error} wide>
    {loading?<Empty label="Carregando configurações..."/>:settings?<form className="form-grid" onSubmit={save}>
      <fieldset className="shop-operation-profile full-span" aria-describedby="shop-operation-help"><legend>Como seu pet shop trabalha?</legend><div className="shop-operation-options"><label className={(settings.operation_mode||'complete')==='essential'?'is-selected':''}><input type="radio" name="shop-operation-mode" value="essential" checked={settings.operation_mode==='essential'} disabled={busy} onChange={()=>setSettings({...settings,operation_mode:'essential'})}/><span><strong>Só banho e tosa</strong><span>Agenda, clientes e financeiro dos serviços.</span></span></label><label className={(settings.operation_mode||'complete')==='complete'?'is-selected':''}><input type="radio" name="shop-operation-mode" value="complete" checked={(settings.operation_mode||'complete')==='complete'} disabled={busy} onChange={()=>setSettings({...settings,operation_mode:'complete'})}/><span><strong>Atendimentos e venda de produtos</strong><span>Também mostra produtos e estoque.</span></span></label></div><p id="shop-operation-help">Você pode mudar depois. Seus cadastros e lançamentos serão mantidos.</p></fieldset>
      <label>Tolerância para atraso (minutos)<input type="number" min="0" max="120" required disabled={busy} value={settings.late_tolerance_minutes} onChange={e=>setSettings({...settings,late_tolerance_minutes:e.target.value})}/></label>
      <label>Lembrete antes do atendimento (minutos)<input type="number" min="0" max="10080" required disabled={busy} value={settings.reminder_minutes_before} onChange={e=>setSettings({...settings,reminder_minutes_before:e.target.value})}/></label>
      <p className="muted full-span">Os lembretes respeitam a autorização registrada para cada tutor e a configuração de envio da plataforma.</p>
      <div className="taxi-settings full-span"><label className="taxi-check"><input type="checkbox" disabled={busy} checked={settings.taxi_dog_enabled===true} onChange={event=>setSettings({...settings,taxi_dog_enabled:event.target.checked})}/><span>Ativar Táxi Dog neste pet shop</span></label><p>Libera o planejamento de buscas e entregas ligado aos agendamentos. Cadastre os valores em Serviços e os motoristas em Táxi Dog. A desativação exige concluir ou cancelar as viagens pendentes.</p></div>
      <div className="taxi-settings full-span"><label className="taxi-check"><input type="checkbox" disabled={busy||settings.operation_mode==='essential'} checked={settings.operation_mode!=='essential'&&settings.delivery_enabled===true} onChange={event=>setSettings({...settings,delivery_enabled:event.target.checked})}/><span>Ativar entregas de produtos</span></label><p>Mostra pedidos de entrega e o catálogo para rações e produtos. Disponível no modo com venda de produtos. A equipe autorizada no Financeiro pode gerenciar os pedidos.</p></div>
      <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Salvando...':'Salvar preferências'}</button></div>
    </form>:<button className="ghost-btn" onClick={()=>void load()}>Tentar novamente</button>}
  </FormDialog>;
}
