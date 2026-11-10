// Development-only harness. Uses the real components/styles and never an API server.
// Vite's production entry remains index.html; this file is not imported by production.
import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AppShell, {type MenuKey} from '../src/AppShell';
import AuthScreen from '../src/AuthScreen';
import CalendarPage from '../src/CalendarPage';
import Overview from '../src/Overview';
import DataPage, {type Resource} from '../src/DataPage';
import {PlanOnboardingDialog,PlatformOperations,SubscriptionPage} from '../src/CommercialPages';
import {today, type Session} from '../src/api';
import '../src/styles/main.scss';

const parameters=new URLSearchParams(location.search);
if(parameters.get('mode')==='web')delete document.documentElement.dataset.petcoreNative;
else document.documentElement.dataset.petcoreNative='android';
document.documentElement.dataset.petcoreQa='fictitious-local';

const ids={company:'10000000-0000-4000-8000-000000000001',user:'10000000-0000-4000-8000-000000000002',tutorA:'10000000-0000-4000-8000-000000000003',tutorB:'10000000-0000-4000-8000-000000000004',petA:'10000000-0000-4000-8000-000000000005',petB:'10000000-0000-4000-8000-000000000006',professionalA:'10000000-0000-4000-8000-000000000007',professionalB:'10000000-0000-4000-8000-000000000008',serviceA:'10000000-0000-4000-8000-000000000009',serviceB:'10000000-0000-4000-8000-000000000010'};
const tutors=[{id:ids.tutorA,name:'Ana Exemplo',phone:'11900000001',email:'ana@example.test'},{id:ids.tutorB,name:'Bruno Exemplo',phone:'11900000002',email:'bruno.contato.compras.petshop.com.nome.longo@example.test'},{id:'10000000-0000-4000-8000-000000000011',name:'Cliente de Exemplo com Nome Comprido',phone:'',email:''}];
const pets=[{id:ids.petA,tutor_id:ids.tutorA,name:'Luna',tutor_name:'Ana Exemplo',species:'Cão'},{id:ids.petB,tutor_id:ids.tutorB,name:'Thor',tutor_name:'Bruno Exemplo',species:'Cão'}];
const professionals=[{id:ids.professionalA,name:'Juliana Exemplo'},{id:ids.professionalB,name:'Rafael Exemplo'}];
const services=[{id:ids.serviceA,name:'Banho',price_cents:3500,duration_minutes:30},{id:ids.serviceB,name:'Tosa higiênica',price_cents:2000,duration_minutes:30}];
const options={tutors,pets,professionals,services};
const session:Session={user:{id:ids.user,name:'Marina Exemplo',role:'admin',tenantId:ids.company,companyName:'Vila Pet • demonstração',scopeProfessionalId:null,permissions:[]},companies:[{id:ids.company,name:'Vila Pet • demonstração',role:'admin'}],legal:{required:false,version:'qa-unpublished'},subscription:{writable:true,access_until:null,trial_ends_at:null,paid_through:null,status:'trial',onboarding_completed_at:'2026-11-09T12:00:00Z',trial_started_at:'2026-11-09T12:00:00Z',onboarding_plan:'free',trial_days:30}};
const futureDay=(days:number)=>{const date=new Date(today()+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString();};
const paidBilling=parameters.get('billing')==='paid';
const checkoutPlans=[{id:'monthly',name:'PetCore Mensal',amount_cents:3500,interval_months:1,checkout_reviewed:true,checkout_url:'https://pag.ae/82jFKCTjo',active:true},{id:'yearly',name:'PetCore Anual',amount_cents:35000,interval_months:12,checkout_reviewed:true,checkout_url:'https://pag.ae/82jFLbrjr',active:true}];
const localSubscription={tenant_id:ids.company,plan_id:'monthly',plan_name:'PetCore Mensal',status:paidBilling?'active':'trial',trial_ends_at:futureDay(30),paid_through:paidBilling?futureDay(30):null,amount_cents:3500,interval_months:1,grace_days:3,access_until:futureDay(30),writable:true,suspension_reason:'',trial_days:30,trial_started_at:new Date().toISOString(),onboarding_completed_at:parameters.get('screen')==='onboarding'?null:new Date().toISOString(),onboarding_plan:'free',recurrence_cancelled_at:null as string|null};
const fixturePayments=paidBilling?[{id:'qa-fictitious-payment',plan_id:'monthly',amount_cents:3500,provider_reference:'QA-FICTICIO-NAO-E-PAGAMENTO',period_start:new Date().toISOString(),period_end:futureDay(30),received_at:new Date().toISOString(),voided_at:null}]:[];

// Checkout navigation is observed locally, including the asynchronously reserved
// popup. The harness never opens PagBank or submits a real payment.
const checkoutAttempt=(value:string)=>window.dispatchEvent(new CustomEvent('petcore-qa-checkout',{detail:value}));
window.open=((url?:string|URL)=>{
  if(url&&String(url)!=='about:blank')checkoutAttempt(String(url));
  let closed=false;
  return {opener:null,get closed(){return closed;},close(){closed=true;},location:{set href(value:string){checkoutAttempt(value);}}} as unknown as Window;
}) as typeof window.open;
document.addEventListener('click',event=>{
  const link=event.target instanceof Element?event.target.closest('a'):null;
  if(link&&new URL(link.href,location.href).origin!==location.origin){event.preventDefault();checkoutAttempt(link.href);}
},true);

type Appointment={id:string;tutor_name:string;pet_name:string;professional_id:string;professional_name:string;starts_at:string;status:string;services:typeof services};
const localAppointments:Appointment[]=[];
let sequence=1;
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fixturesFor=(day:string):Appointment[]=>[
  {id:'qa-appointment-a',tutor_name:tutors[0].name,pet_name:pets[0].name,professional_id:professionals[0].id,professional_name:professionals[0].name,starts_at:`${day}T09:00:00-03:00`,status:'confirmed',services:[services[0]]},
  {id:'qa-appointment-b',tutor_name:tutors[1].name,pet_name:pets[1].name,professional_id:professionals[1].id,professional_name:professionals[1].name,starts_at:`${day}T10:30:00-03:00`,status:'pending',services:[services[0],services[1]]},
  {id:'qa-appointment-c',tutor_name:tutors[0].name,pet_name:'Mel',professional_id:professionals[0].id,professional_name:professionals[0].name,starts_at:`${day}T11:30:00-03:00`,status:'in_progress',services:[services[1]]}
];

// This replaces fetch before any component effect executes. No original fetch is retained.
window.fetch=(async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
  const raw=input instanceof Request?input.url:String(input);
  const url=new URL(raw,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))throw Error('QA local: rede externa e APIs reais bloqueadas.');
  const method=init?.method||(input instanceof Request?input.method:'GET');
  const path=url.pathname.slice(4);
  let body:Record<string,unknown>={};
  if(typeof init?.body==='string'){try{body=JSON.parse(init.body) as Record<string,unknown>;}catch{return reply({error:'Corpo fictício inválido.'},400);}}
  if(method==='GET'&&path==='/public/legal')return reply({published:false,version:'qa-unpublished',operator:{brand:'PetCore',supportEmail:'suporte@example.test',privacyEmail:'privacidade@example.test'}});
  if(method==='GET'&&path==='/auth/me')return reply(session);
  if(method==='GET'&&path==='/notifications')return reply({items:[],unreadCount:0});
  if(method==='GET'&&path==='/calendar/options')return reply(options);
  if(method==='GET'&&path==='/data/tutors')return reply(tutors);
  if(method==='GET'&&path==='/data/pets')return reply(pets);
  if(method==='GET'&&path==='/data/services')return reply(services);
  if(method==='GET'&&path==='/data/professionals')return reply(professionals.map(item=>({...item,active:true})));
  if(method==='GET'&&path==='/options/pet-tutors')return reply(tutors);
  if(method==='GET'&&path==='/options/professional-accounts')return reply([]);
  if(method==='GET'&&path==='/commercial/setup')return reply({services:2,professionals:2,readyProfessionals:2,tutors:3,pets:2,appointments:3,sales:0,receipts:0});
  if(method==='GET'&&path==='/business/summary')return reply({totals:{receipts_cents:0,refunds_cents:0,expenses_cents:0,expense_refunds_cents:0,net_cents:0}});
  if(method==='GET'&&path==='/business/products')return reply({items:[],summary:{products:0,lowStock:0},page:1,pageSize:3,total:0});
  if(method==='GET'&&path==='/commercial/me')return reply({subscription:localSubscription,plans:checkoutPlans,payments:fixturePayments,canManage:true,supportEmail:'suporte@example.test',billingMode:'pagbank_recurring_link_manual_reconciliation',trialDays:30,checkoutRequiresSupport:paidBilling&&!localSubscription.recurrence_cancelled_at});
  if(method==='GET'&&path==='/commercial/platform/settings')return reply({brand:'Tiger Tech • QA local',legal_name:'Responsável fictício',support_email:'suporte@example.test',privacy_email:'privacidade@example.test',address:'Endereço fictício da prévia',privacy_text:'Documento fictício não publicado.',terms_text:'Documento fictício não publicado.',published:false,legal_version:'qa-unpublished',effective_date:null,subprocessors:[],trial_days:30,grace_days:3,plans:checkoutPlans});
  if(method==='GET'&&path==='/commercial/platform/subscriptions')return reply({items:[{id:ids.company,name:'Vila Pet • demonstração',active:true,...localSubscription}],page:1,pageSize:20,total:1});
  if(method==='GET'&&path===`/commercial/platform/subscriptions/${ids.company}`)return reply({company:{id:ids.company,name:'Vila Pet • demonstração',active:true},subscription:localSubscription,payments:fixturePayments,plans:checkoutPlans});
  if(method==='POST'&&path===`/commercial/platform/subscriptions/${ids.company}/cancel-recurring`){
    if(body.confirmed_in_pagbank!==true||typeof body.provider_reference!=='string'||body.provider_reference.trim().length<3||typeof body.reason!=='string'||body.reason.trim().length<5||typeof body.password!=='string'||!body.password)return reply({error:'Preencha a confirmação fictícia. Não use sua senha real na prévia.'},422);
    if(body.expected_paid_through!==localSubscription.paid_through)return reply({error:'O período fictício mudou. Consulte a assinatura novamente.'},409);
    localSubscription.recurrence_cancelled_at=new Date().toISOString();return reply({ok:true});
  }
  if(method==='POST'&&path==='/commercial/choose-plan'){
    const plan=checkoutPlans.find(item=>item.id===body.plan_id);if(!plan)return reply({error:'Plano fictício inválido.'},422);
    if(paidBilling&&!localSubscription.recurrence_cancelled_at)return reply({ok:true,action:'support',plan_id:plan.id,ticket_id:'qa-billing-change',message:'Solicitação fictícia registrada no suporte. A cobrança anterior não foi cancelada nesta prévia.'});
    localSubscription.plan_id=plan.id;localSubscription.plan_name=plan.name;return reply({ok:true,action:'checkout',plan_id:plan.id,checkout_url:plan.checkout_url});
  }
  if(method==='POST'&&path==='/commercial/cancel-subscription'){
    if(body.confirmed!==true)return reply({error:'Confirme o pedido de cancelamento fictício.'},422);
    return reply({ok:true,ticket_id:'qa-billing-cancellation',message:'Pedido fictício registrado no suporte. O período já pago permanece disponível; esta prévia não cancela cobranças reais.'});
  }
  if(method==='POST'&&path==='/commercial/onboarding'){
    if(paidBilling){localSubscription.onboarding_completed_at=new Date().toISOString();return reply({ok:true,plan:localSubscription.plan_id,checkout_url:null,paymentAlreadyConfirmed:true});}
    if(body.plan==='free'){localSubscription.onboarding_completed_at=new Date().toISOString();localSubscription.status='trial';return reply({ok:true,plan:'free',checkout_url:null});}
    const plan=checkoutPlans.find(item=>item.id===body.plan);if(!plan)return reply({error:'Plano fictício inválido.'},422);
    localSubscription.plan_id=plan.id;localSubscription.plan_name=plan.name;localSubscription.status='pending';localSubscription.onboarding_completed_at=new Date().toISOString();localSubscription.onboarding_plan=plan.id;
    return reply({ok:true,plan:plan.id,checkout_url:plan.checkout_url});
  }
  if(method==='GET'&&path==='/calendar/appointments'){
    const date=(url.searchParams.get('from')||today()).slice(0,10);
    return reply([...fixturesFor(date),...localAppointments.filter(item=>item.starts_at.slice(0,10)===date)]);
  }
  if(method==='GET'&&/^\/calendar\/appointments\/[^/]+\/history$/.test(path))return reply([{id:'qa-history',created_at:`${today()}T08:00:00-03:00`,actor_name:'Equipe fictícia',kind:'created'}]);
  if(method==='POST'&&path==='/auth/login')return reply({ok:true});
  if(method==='POST'&&path==='/auth/logout')return reply({ok:true});
  if(method==='POST'&&path==='/auth/password/forgot')return reply({message:'Prévia local: nenhum e-mail foi enviado.'});
  if(method==='POST'&&path==='/calendar/appointments'){
    const tutor=tutors.find(item=>item.id===body.tutor_id),pet=pets.find(item=>item.id===body.pet_id),professional=professionals.find(item=>item.id===body.professional_id);
    const chosen=services.filter(item=>Array.isArray(body.service_ids)&&body.service_ids.includes(item.id));
    if(!tutor||!pet||pet.tutor_id!==tutor.id||!professional||!chosen.length||typeof body.starts_at!=='string')return reply({error:'Escolha os cadastros fictícios para completar a prévia.'},422);
    const row:Appointment={id:`qa-local-created-${sequence++}`,tutor_name:tutor.name,pet_name:pet.name,professional_id:professional.id,professional_name:professional.name,starts_at:body.starts_at,status:'pending',services:chosen};
    localAppointments.push(row);return reply(row,201);
  }
  // Deliberately no real e-mail, legal acceptance or fallback to a server.
  return reply({error:`QA local: rota simulada indisponível (${method} ${path}). Nenhum servidor foi acessado.`},501);
}) as typeof fetch;

function localScreen(screen:'login'|'agenda'|'form'|'overview'|'clients'|'subscription'|'onboarding'|'platform'){
  const next=new URL(location.href);next.search='';next.searchParams.set('screen',screen);location.assign(next.href);
}
function Harness(){
  const requested=new URLSearchParams(location.search).get('screen')||'login';
  const initialView:MenuKey=requested==='overview'||requested==='onboarding'?'overview':requested==='clients'?'tutors':requested==='subscription'?'subscription':requested==='platform'?'platform':'calendar';
  const [view,setView]=useState<MenuKey>(initialView),[search,setSearch]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[onboarding,setOnboarding]=useState(requested==='onboarding'),[checkout,setCheckout]=useState('');
  useEffect(()=>{const capture=(event:Event)=>setCheckout((event as CustomEvent<string>).detail);window.addEventListener('petcore-qa-checkout',capture);return()=>window.removeEventListener('petcore-qa-checkout',capture);},[]);
  const go=(target:MenuKey)=>{setView(target);setSearch('');};
  const resource:Resource|null=['tutors','pets','professionals','services'].includes(view)?view as Resource:null;
  if(requested==='login')return <AuthScreen onDone={()=>localScreen('agenda')} onReadLegal={()=>setNotice('Documentos não publicados nesta prévia local.')}/>;
  const shellSession:Session=view==='platform'?{...session,user:{...session.user,role:'platform'}}:session;
  return <AppShell session={shellSession} view={view} go={go} onSearch={(target,query)=>{setView(target);setSearch(query);}} company={()=>{}} logout={()=>localScreen('login')}>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {notice&&<div className="alert success" role="status">{notice}</div>}
    {checkout&&<aside className="alert success" role="status">Prévia local: destino do pagamento capturado, sem abrir o provedor: <span style={{overflowWrap:'anywhere'}}>{checkout}</span></aside>}
    {onboarding&&<PlanOnboardingDialog onDone={()=>{setOnboarding(false);setView('subscription');}} onLogout={()=>localScreen('login')}/>}
    {view==='overview'?<Overview go={go} can={()=>true} isAdmin onNew={()=>{setView('calendar');localScreen('form');}}/>:resource?<DataPage resource={resource} setMessage={setNotice} setError={setError} initialSearch={search} onSetup={target=>go(target)} canSetup={()=>true}/>:view==='subscription'?<SubscriptionPage setMessage={setNotice} setError={setError}/>:view==='platform'?<PlatformOperations setMessage={setNotice} setError={setError}/>:view==='calendar'?<CalendarPage setMessage={setNotice} setError={setError} initialNew={requested==='form'} searchQuery={search} onSaved={()=>setSearch('')}/>:<div className="panel"><p>Esta tela não faz parte da prévia local.</p><button type="button" className="ghost-btn" onClick={()=>go('overview')}>Voltar para Hoje</button></div>}
  </AppShell>;
}

const container=document.getElementById('root');
if(!container)throw Error('Contêiner da prévia local ausente.');
createRoot(container).render(<Harness/>);
