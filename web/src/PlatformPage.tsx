import {useEffect,useState,type FormEvent} from 'react';
import {Building2,Plus,Settings2} from 'lucide-react';
import {api} from './api';
import FormDialog from './FormDialog';
import {Empty,PageHeader} from './ui';
import {PlatformOperations} from './CommercialPages';

export default function PlatformPage({setMessage,setError}:{setMessage:(value:string)=>void;setError:(value:string)=>void}) {
  const [rows,setRows]=useState<any[]>([]),[name,setName]=useState(''),[email,setEmail]=useState(''),[invite,setInvite]=useState('');
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setLocalError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true);
  const [area,setArea]=useState<'companies'|'operations'>('companies');
  function setDialogError(value:string){setLocalError(value);if(value)setError(value);}
  async function load(){setLoading(true);try{setRows(await api<any[]>('/auth/platform/companies'));}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);
  function start(){setName('');setEmail('');setInvite('');setNotice('');setDialogError('');setOpen(true);}
  async function create(event:FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setDialogError('');
    try {
      const result=await api<any>('/auth/platform/companies','POST',{name,email,timezone:'America/Sao_Paulo'});
      setInvite(`${location.origin}/?invite=${result.inviteToken}`);setNotice('Empresa cadastrada. Copie o convite e envie ao responsável.');setMessage('Empresa cadastrada. Copie o link de convite e envie ao responsável por um canal seguro.');await load();
    }catch(e){setDialogError((e as Error).message);}finally{setBusy(false);}
  }
  async function copy(){try{await navigator.clipboard.writeText(invite);setNotice('Link de convite copiado.');}catch{setDialogError('Não foi possível copiar automaticamente. Selecione e copie o link abaixo.');}}
  return <>
    <PageHeader eyebrow="PAINEL DA PLATAFORMA" title="Empresas assinantes" subtitle="Cadastre um pet shop e convide o responsável para ativar sua conta." action={<button className="primary-btn" onClick={start}><Plus size={17}/>Nova empresa</button>}/>
    <div className="commercial-tabs" role="group" aria-label="Áreas da administração"><button className={area==='companies'?'selected':''} aria-pressed={area==='companies'} onClick={()=>setArea('companies')}><Building2 size={17}/>Empresas</button><button className={area==='operations'?'selected':''} aria-pressed={area==='operations'} onClick={()=>setArea('operations')}><Settings2 size={17}/>Gestão da plataforma</button></div>
    {area==='companies'?<section className="panel"><div className="panel-head"><h2>Pet shops cadastrados</h2><span className="count">{rows.length} empresas</span></div>{loading?<Empty label="Carregando empresas..."/>:rows.length?rows.map(item=><div className="company-row" key={item.id}><div className="company-icon"><Building2 size={19}/></div><div><strong>{item.name}</strong><small>{item.member_count} usuário(s) · {item.timezone}</small></div><span className="status confirmed">{item.active?'Ativa':'Inativa'}</span></div>):<Empty label="Nenhuma empresa cadastrada. Use Nova empresa para convidar o primeiro responsável."/>}</section>:<PlatformOperations key={rows.length} setMessage={setMessage} setError={setError}/>}
    {open&&<FormDialog title={invite?'Convite da nova empresa':'Nova empresa'} description="O responsável poderá usar o convite para definir sua própria senha." error={error} notice={notice} busy={busy} onClose={()=>setOpen(false)}>
      {invite?<><div className="invitation"><strong>Link de convite (uso único, válido por 7 dias)</strong><textarea readOnly aria-label="Link de convite" value={invite}/><button type="button" className="ghost-btn" onClick={()=>void copy()}>Copiar link</button><small>Compartilhe o link com o responsável. O convite não é enviado automaticamente.</small></div><div className="form-actions"><button type="button" className="primary-btn" onClick={()=>setOpen(false)}>Concluir</button></div></>:<form className="stack-form" onSubmit={create}>
        <label>Nome do pet shop<input required minLength={2} disabled={busy} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Jardim Pet"/></label>
        <label>E-mail do responsável<input required type="email" disabled={busy} value={email} onChange={e=>setEmail(e.target.value)} placeholder="responsavel@empresa.com"/></label>
        <div className="form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Criando...':'Cadastrar e gerar convite'}</button></div>
      </form>}
    </FormDialog>}
  </>;
}
