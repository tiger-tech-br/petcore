import {useEffect,useState,type FormEvent} from 'react';
import {Mail,Settings2} from 'lucide-react';
import {api} from './api';
import FormDialog from './FormDialog';
import {Empty,PageHeader} from './ui';

type Props={setMessage:(value:string)=>void;setError:(value:string)=>void};
const permissions=[['appointments','Atendimentos'],['agenda:all','Agenda de todos os profissionais'],['tutors','Clientes'],['pets','Pets'],['crm','CRM e relacionamento com clientes'],['waitlist','Lista de espera'],['services','Serviços'],['professionals','Profissionais'],['inventory','Produtos e estoque'],['finance','Financeiro, vendas, caixa e relatórios']];

export default function TeamPage({setMessage,setError}:Props) {
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
  return <>
    <PageHeader eyebrow="CONTROLE DE ACESSO" title="Equipe e configurações" subtitle="Gerencie as contas da equipe e as preferências de atendimento." action={<div className="page-header-actions"><button className="ghost-btn" onClick={()=>setDialog('settings')}><Settings2 size={17}/>Configurar atendimento</button><button className="primary-btn" onClick={openInvite}><Mail size={17}/>Convidar funcionário</button></div>}/>
    <section className="panel"><h2>Usuários da empresa</h2>{loading?<Empty label="Carregando equipe..."/>:rows.length?rows.map(item=><div key={item.id} className="team-row"><strong>{item.name}</strong><small>{item.email} · {item.role==='admin'?'Administrador':'Funcionário'}</small>{item.role==='employee'&&<><span className={`status ${item.active?'confirmed':'cancelled'}`}>{item.active?'Conta ativa':'Conta inativa'}</span><div className="action-row"><button className="ghost-btn" onClick={()=>openPermissions(item)} aria-label={`Editar permissões de ${item.name}`}>Editar permissões</button></div></>}</div>):<Empty label="Nenhum usuário encontrado."/>}</section>
    {dialog==='settings'&&<SettingsDialog onClose={()=>setDialog(null)} setMessage={setMessage} setPageError={setError}/>}
    {dialog==='invite'&&<FormDialog title={invite?'Convite do funcionário':'Convidar funcionário'} description="Cada funcionário usa uma conta individual." busy={busy} error={error} notice={notice} onClose={()=>setDialog(null)}>
      {invite?<><div className="invitation"><strong>Link de convite</strong><textarea readOnly aria-label="Link de convite do funcionário" value={invite}/><button type="button" className="ghost-btn" onClick={()=>void copy()}>Copiar convite</button><small>Envie o link ao funcionário. Nenhuma mensagem automática foi enviada.</small></div><div className="form-actions"><button type="button" className="primary-btn" onClick={()=>setDialog(null)}>Concluir</button></div></>:<form className="stack-form" onSubmit={create}><label>E-mail profissional<input type="email" required disabled={busy} value={email} onChange={e=>setEmail(e.target.value)}/></label><div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Gerando...':'Gerar convite'}</button></div></form>}
    </FormDialog>}
    {dialog==='permissions'&&editing&&<FormDialog title={`Permissões de ${editing.name}`} description="As alterações de acesso são verificadas pelo servidor." busy={busy} error={error} onClose={()=>setDialog(null)}>
      <form className="stack-form" onSubmit={save}><div className="checks">{permissions.map(([value,label])=><label key={value}><input type="checkbox" disabled={busy} checked={editing.permissions.includes(value)} onChange={e=>setEditing({...editing,permissions:e.target.checked?[...editing.permissions,value]:editing.permissions.filter((item:string)=>item!==value)})}/>{label}</label>)}</div><label className="check-label"><input type="checkbox" disabled={busy} checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/>Conta ativa</label><div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Salvando...':'Salvar permissões'}</button></div></form>
    </FormDialog>}
  </>;
}

function SettingsDialog({onClose,setMessage,setPageError}:{onClose:()=>void;setMessage:(value:string)=>void;setPageError:(value:string)=>void}) {
  const [settings,setSettings]=useState<any|null>(null),[error,setLocalError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  function setError(value:string){setLocalError(value);if(value)setPageError(value);}
  async function load(){setLoading(true);setError('');try{setSettings(await api('/settings'));}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  async function save(event:FormEvent) {
    event.preventDefault();if(busy||!settings)return;setBusy(true);setError('');
    try {await api('/settings','PATCH',{late_tolerance_minutes:Number(settings.late_tolerance_minutes),reminder_minutes_before:Number(settings.reminder_minutes_before)});setMessage('Configurações de atendimento salvas. Os jobs futuros usam essa antecedência, mas o envio automático depende do worker da próxima etapa.');onClose();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <FormDialog title="Configurações de atendimento" description="Defina a tolerância para atrasos e a antecedência dos lembretes." onClose={onClose} busy={busy} error={error}>
    {loading?<Empty label="Carregando configurações..."/>:settings?<form className="form-grid" onSubmit={save}>
      <label>Tolerância para atraso (minutos)<input type="number" min="0" max="120" required disabled={busy} value={settings.late_tolerance_minutes} onChange={e=>setSettings({...settings,late_tolerance_minutes:e.target.value})}/></label>
      <label>Lembrete antes do atendimento (minutos)<input type="number" min="0" max="10080" required disabled={busy} value={settings.reminder_minutes_before} onChange={e=>setSettings({...settings,reminder_minutes_before:e.target.value})}/></label>
      <p className="muted full-span">O envio automático de lembretes ainda não está ativado.</p>
      <div className="form-actions full-span"><button type="button" className="ghost-btn" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Salvando...':'Salvar configurações'}</button></div>
    </form>:<button className="ghost-btn" onClick={()=>void load()}>Tentar novamente</button>}
  </FormDialog>;
}
