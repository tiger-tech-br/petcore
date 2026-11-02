import {useEffect,useState} from 'react';
import {ArrowRight,Check,ChevronDown,ClipboardList} from 'lucide-react';
import {api} from './api';
import type {MenuKey} from './AppShell';

type Setup={services:number;professionals:number;readyProfessionals:number;tutors:number;pets:number;appointments:number;sales:number;receipts:number};
export default function FirstSteps({go,can}:{go:(target:MenuKey)=>void;can:(permission?:string)=>boolean}){
  const [counts,setCounts]=useState<Setup|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[open,setOpen]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);setError('');api<Setup>('/commercial/setup').then(data=>{if(active){setCounts(data);if(data.services&&data.readyProfessionals&&data.tutors&&data.pets&&data.appointments&&data.receipts)setOpen(false);}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Não foi possível consultar os primeiros passos.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[revision]);
  const clientTarget:MenuKey=counts?.tutors?'pets':'tutors';
  const steps:{title:string;description:string;target:MenuKey;permission:string;done:boolean;button:string}[]=[
    {title:'Cadastre seus serviços',description:'Informe os serviços, preços e o tempo necessário para cada atendimento.',target:'services',permission:'services',done:Boolean(counts?.services),button:'Ver serviços'},
    {title:'Prepare a agenda do profissional',description:counts?.professionals?'Em Profissionais, abra Horários e informe a jornada e os serviços realizados.':'Cadastre o profissional e configure seus horários e os serviços que ele realiza.',target:'professionals',permission:'professionals',done:Boolean(counts?.readyProfessionals),button:'Ver profissionais'},
    {title:'Cadastre o cliente e seu pet',description:counts?.tutors?'Agora vincule o pet ao cliente em Clientes e pets.':'Comece pelo cadastro do cliente; depois cadastre o pet e escolha seu tutor.',target:clientTarget,permission:clientTarget,done:Boolean(counts?.tutors&&counts?.pets),button:counts?.tutors?'Ver pets':'Ver clientes'},
    {title:'Faça o primeiro agendamento',description:'Escolha o cliente, o pet, os serviços, o profissional e um horário disponível.',target:'calendar',permission:'appointments',done:Boolean(counts?.appointments),button:'Abrir agenda'},
    {title:'Registre o primeiro recebimento',description:counts?.sales?'Abra a venda no Financeiro e use Registrar recebimento somente depois de receber o pagamento.':'No Financeiro, abra uma venda (comanda) e informe o pagamento quando receber.',target:'finance',permission:'finance',done:Boolean(counts?.receipts),button:'Abrir Financeiro'}
  ];
  const completed=steps.filter(step=>step.done).length;
  return <details className="business-first-steps" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary><span className="business-first-symbol"><ClipboardList size={23}/></span><span><strong>{completed===5?'Seus primeiros passos estão concluídos':'Comece por aqui'}</strong><small>Um caminho simples para preparar o pet shop.</small></span><span className="business-first-progress">{counts?`${completed} de 5`:'—'}</span><ChevronDown className="business-first-chevron" size={19}/></summary>
    {loading?<p className="business-first-loading" role="status">Consultando a configuração do pet shop...</p>:error?<div className="business-first-error"><p>{error}</p><button className="text-link" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button></div>:<><ol>{steps.map((step,index)=><li key={step.target} className={step.done?'is-complete':''}><span className="business-first-number" aria-label={step.done?'Concluído':`Etapa ${index+1}`}>{step.done?<Check size={16}/>:index+1}</span><div><strong>{step.title}</strong><p>{step.description}</p>{can(step.permission)&&<button className="text-link" onClick={()=>go(step.target)}>{step.button}<ArrowRight size={14}/></button>}</div></li>)}</ol>{(!counts?.services||!counts.readyProfessionals||!counts.tutors||!counts.pets)&&<p className="business-first-tip">Antes de agendar, prepare os serviços, um profissional com jornada e o cadastro do cliente e pet. Você pode recolher este guia e voltar a ele quando precisar.</p>}</>}
  </details>;
}
