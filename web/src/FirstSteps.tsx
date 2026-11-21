import {useEffect,useState} from 'react';
import {ArrowRight,Check,ChevronDown,ClipboardList} from 'lucide-react';
import {api} from './api';
import type {MenuKey} from './AppShell';

type Setup={services:number;professionals:number;readyProfessionals:number;tutors:number;pets:number;appointments:number;sales:number;receipts:number};
export default function FirstSteps({go,can,onRegisterClient,onNew}:{go:(target:MenuKey)=>void;can:(permission?:string)=>boolean;onRegisterClient?:()=>void;onNew?:()=>void}){
  const [counts,setCounts]=useState<Setup|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[open,setOpen]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);setError('');api<Setup>('/commercial/setup').then(data=>{if(active){setCounts(data);if(data.services&&data.readyProfessionals&&data.tutors&&data.pets&&data.appointments)setOpen(false);}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Não foi possível consultar os primeiros passos.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[revision]);
  const needsPetForExistingClient=Boolean(counts?.tutors&&!counts?.pets);
  const steps:{title:string;description:string;target:MenuKey;permission:string;done:boolean;button:string}[]=[
    {title:'Informe os serviços que você oferece',description:'Cadastre banho, tosa e outros serviços com preço e duração.',target:'services',permission:'services',done:Boolean(counts?.services),button:counts?.services?'Ver serviços':'Cadastrar serviços'},
    {title:'Defina quem atende e os horários',description:'Cadastre quem atende, seus dias e horários de trabalho e os serviços realizados.',target:'professionals',permission:'professionals',done:Boolean(counts?.readyProfessionals),button:counts?.readyProfessionals?'Ver equipe e horários':counts?.professionals?'Configurar horários':'Cadastrar quem atende'},
    {title:'Cadastre o cliente e seu pet juntos',description:needsPetForExistingClient?'Abra o cliente já cadastrado e clique em Adicionar pet.':'Preencha os dados do cliente e do pet no mesmo formulário.',target:'tutors',permission:'tutors',done:Boolean(counts?.tutors&&counts?.pets),button:counts?.tutors&&counts?.pets?'Ver clientes e pets':needsPetForExistingClient?'Ver clientes':'Cadastrar cliente e pet'},
    {title:'Marque o primeiro atendimento',description:'Escolha o pet, o serviço e um horário disponível. O sistema define quem atende.',target:'calendar',permission:'appointments',done:Boolean(counts?.appointments),button:counts?.appointments?'Ver agenda':'Agendar atendimento'}
  ];
  const completed=steps.filter(step=>step.done).length;
  const nextStep=steps.findIndex(step=>!step.done);
  function openStep(step:typeof steps[number]){
    if(!step.done&&step.target==='tutors'&&!needsPetForExistingClient&&onRegisterClient){onRegisterClient();return;}
    if(!step.done&&step.target==='calendar'&&onNew){onNew();return;}
    go(step.target);
  }
  return <details className="business-first-steps" open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary><span className="business-first-symbol"><ClipboardList size={23}/></span><span><strong>{completed===steps.length?'Seu pet shop está pronto para agendar':'Prepare seu primeiro atendimento'}</strong><small>Quatro passos. Depois, use a agenda no dia a dia.</small></span><span className="business-first-progress">{counts?`${completed} de ${steps.length}`:'—'}</span><ChevronDown className="business-first-chevron" size={19}/></summary>
    {loading?<p className="business-first-loading" role="status">Consultando a configuração do pet shop...</p>:error?<div className="business-first-error"><p>{error}</p><button className="text-link" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button></div>:<><ol>{steps.map((step,index)=><li key={step.target} className={step.done?'is-complete':index===nextStep?'is-next':''} aria-current={index===nextStep?'step':undefined}><span className="business-first-number" aria-label={step.done?'Concluído':`Etapa ${index+1}`}>{step.done?<Check size={16}/>:index+1}</span><div>{index===nextStep&&<small className="business-first-next">Próximo passo</small>}<strong>{step.title}</strong><p>{step.description}</p>{can(step.permission)&&<button className="text-link" onClick={()=>openStep(step)}>{step.button}<ArrowRight size={14}/></button>}</div></li>)}</ol>{(!counts?.services||!counts.readyProfessionals||!counts.tutors||!counts.pets)&&<p className="business-first-tip">Você pode recolher este guia e voltar a ele quando precisar.</p>}{Boolean(counts?.appointments)&&!counts?.receipts&&can('finance')&&<div className="daily-optional-step"><strong>Depois do atendimento</strong><p>Quando receber o pagamento, registre o valor no Financeiro.</p><button className="text-link" onClick={()=>go('finance')}>Ir para Financeiro<ArrowRight size={14}/></button></div>}</>}
  </details>;
}
