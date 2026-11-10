// Development-only harness. Uses the real components/styles and never an API server.
// Vite's production entry remains index.html; this file is not imported by production.
import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AppShell, {type MenuKey} from '../src/AppShell';
import AuthScreen from '../src/AuthScreen';
import CalendarPage from '../src/CalendarPage';
import Overview from '../src/Overview';
import DataPage, {type Resource} from '../src/DataPage';
import CrmPage from '../src/CrmPage';
import FinancePage from '../src/FinancePage';
import InventoryPage from '../src/InventoryPage';
import ReportsPage from '../src/ReportsPage';
import WaitlistPage from '../src/WaitlistPage';
import TeamPage from '../src/TeamPage';
import PrivacyPage from '../src/PrivacyPage';
import {PlanOnboardingDialog,PlatformOperations,SubscriptionPage,SupportPage} from '../src/CommercialPages';
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

const qaTimestamp=`${today()}T10:00:00-03:00`;
const pageOf=<T,>(items:T[])=>({items,total:items.length,page:1,pageSize:20});
const fixtureProducts=[
  {id:'qa-product-a',name:'Shampoo suave para cães e gatos',sku:'SHAMPOO-500',unit:'frasco',price_cents:4500,cost_cents:2200,min_stock:5,stock_quantity:3,active:true,created_at:qaTimestamp,updated_at:qaTimestamp},
  {id:'qa-product-b',name:'Escova para cuidados diários',sku:'ESCOVA-01',unit:'un.',price_cents:2800,cost_cents:1200,min_stock:2,stock_quantity:12,active:true,created_at:qaTimestamp,updated_at:qaTimestamp}
];
const fixtureDaily=Array.from({length:10},(_,index)=>({date:`${today().slice(0,7)}-${String(index+1).padStart(2,'0')}`,receipts_cents:15000+index*3500,refunds_cents:index===3?2000:0,expenses_cents:6000+index*900,expense_refunds_cents:0,net_cents:9000+index*2600-(index===3?2000:0)}));
const fixtureTotals={receipts_cents:307500,refunds_cents:2000,expenses_cents:100500,expense_refunds_cents:0,net_cents:205000,receivables_cents:5500,payables_cents:22000};
const fixtureCash={id:'qa-cash',opened_at:qaTimestamp,closed_at:null,opening_cents:10000,counted_cents:null,expected_cents:38500,difference_cents:null,notes:'Fundo de caixa fictício para a demonstração.',closing_notes:'',opened_by_name:'Marina Exemplo',closed_by_name:null};
const fixtureSales=[
  {id:'qa-sale-a',code:'CMD-0001',tutor_id:ids.tutorA,tutor_name:'Ana Exemplo',appointment_id:null,status:'open',subtotal_cents:8000,discount_cents:500,total_cents:7500,paid_cents:2000,balance_cents:5500,due_date:today(),notes:'Comanda fictícia com banho e produto para cuidados em casa.',created_at:qaTimestamp,cancelled_at:null,cancellation_reason:''},
  {id:'qa-sale-b',code:'CMD-0002',tutor_id:ids.tutorB,tutor_name:'Bruno Exemplo',appointment_id:null,status:'paid',subtotal_cents:5500,discount_cents:0,total_cents:5500,paid_cents:5500,balance_cents:0,due_date:today(),notes:'',created_at:qaTimestamp,cancelled_at:null,cancellation_reason:''}
];
const fixtureExpenses=[{id:'qa-expense',title:'Reposição de produtos e materiais de atendimento',category:'supplies',amount_cents:22000,due_date:today(),status:'open',notes:'Compra fictícia de shampoo e materiais.',created_at:qaTimestamp,paid_at:null,payment_method:null,cancelled_at:null,cancellation_reason:''}];
const fixtureCrmClients=tutors.slice(0,2).map((item,index)=>({...item,notes:'Cliente fictício: prefere confirmar os horários por telefone.',created_at:qaTimestamp,pet_count:1,completed_visits:index?0:8,last_visit_at:index?null:qaTimestamp,next_appointment_at:futureDay(2),last_contact_at:qaTimestamp,pending_tasks:1,next_task_due_at:futureDay(1)}));
const fixtureTasks=[
  {id:'qa-task-a',tutor_id:ids.tutorA,tutor_name:'Ana Exemplo',title:'Confirmar retorno para banho e tosa',notes:'Conferir a disponibilidade da tutora e registrar o melhor período para o próximo atendimento.',due_at:futureDay(-1),status:'open',created_at:qaTimestamp,created_by_name:'Marina Exemplo',completed_at:null},
  {id:'qa-task-b',tutor_id:ids.tutorB,tutor_name:'Bruno Exemplo',title:'Acompanhar o primeiro atendimento',notes:'Perguntar como foi a experiência de Thor e atualizar as observações do cadastro.',due_at:futureDay(2),status:'open',created_at:qaTimestamp,created_by_name:'Juliana Exemplo',completed_at:null}
];
const fixtureWaitlist=[{id:'qa-wait',tutor_id:ids.tutorA,tutor_name:'Ana Exemplo',pet_id:ids.petA,pet_name:'Luna',service_id:ids.serviceA,service_name:'Banho e cuidados especiais',professional_id:ids.professionalA,earliest_at:`${today()}T13:00:00-03:00`,latest_at:`${today()}T18:00:00-03:00`,status:'waiting',notes:'Prefere atendimento no período da tarde.'}];
const fixtureTeam=[{id:ids.user,name:'Marina Exemplo',email:'marina@example.test',role:'admin',active:true,permissions:[]},{id:'qa-employee',name:'Juliana Exemplo',email:'juliana.atendimento@example.test',role:'employee',active:true,permissions:['appointments','tutors','crm']}];
const fixturePrivacy=[{id:'qa-privacy',tutor_id:ids.tutorA,tutor_name:'Ana Exemplo',anonymized_at:null,kind:'access',status:'in_progress',description:'Solicito uma cópia das informações do meu cadastro e dos atendimentos de Luna.',identity_verified:true,verification_method:'in_person',identity_verified_at:qaTimestamp,resolution:'Identidade conferida presencialmente. Levantamento dos registros em andamento.',created_at:qaTimestamp,updated_at:qaTimestamp,resolved_at:null,created_by_name:'Marina Exemplo'}];
const fixtureTicket={id:'qa-support',tenant_id:ids.company,company_name:'Vila Pet • demonstração',subject:'Dúvida sobre a organização da agenda',category:'technical',status:'in_progress',created_at:qaTimestamp,updated_at:qaTimestamp};

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
  if(method==='GET'&&path==='/business/summary')return reply({from:fixtureDaily[0].date,to:today(),timezone:'America/Sao_Paulo',totals:fixtureTotals,daily:fixtureDaily,paymentMethods:[{payment_method:'pix',receipts_cents:307500,refunds_cents:2000}],cash:fixtureCash});
  if(method==='GET'&&path==='/business/products')return reply({...pageOf(fixtureProducts),summary:{products:2,lowStock:1,units:15}});
  if(method==='GET'&&path==='/business/options')return reply({...options,products:fixtureProducts,appointments:fixturesFor(today()),timezone:'America/Sao_Paulo'});
  if(method==='GET'&&path==='/business/cash')return reply({current:fixtureCash,recent:[fixtureCash],timezone:'America/Sao_Paulo'});
  if(method==='GET'&&path==='/business/sales')return reply(pageOf(fixtureSales));
  if(method==='GET'&&path.startsWith('/business/sales/'))return reply({sale:fixtureSales.find(item=>path.endsWith(item.id))??fixtureSales[0],items:[{id:'qa-line-a',description:'Banho',quantity:1,unit_price_cents:3500,total_cents:3500},{id:'qa-line-b',description:fixtureProducts[0].name,quantity:1,unit_price_cents:4500,total_cents:4500}],payments:[{id:'qa-payment',kind:'sale_payment',amount_cents:2000,payment_method:'pix',created_at:qaTimestamp,created_by_name:'Marina Exemplo'}],timezone:'America/Sao_Paulo'});
  if(method==='GET'&&path==='/business/expenses')return reply(pageOf(fixtureExpenses));
  if(method==='GET'&&path==='/business/stock-movements')return reply(pageOf([{id:'qa-movement',product_id:fixtureProducts[0].id,product_name:fixtureProducts[0].name,quantity_delta:-2,balance_after:3,reason:'usage',note:'Consumo fictício em atendimentos de banho e tosa.',created_at:qaTimestamp,created_by_name:'Juliana Exemplo'}]));
  if(method==='GET'&&path==='/business/reports')return reply({from:fixtureDaily[0].date,to:today(),timezone:'America/Sao_Paulo',sales:{count:12,total_cents:350000,discount_cents:5000},financial:fixtureTotals,services:[{name:'Banho completo e cuidados especiais',quantity:18,total_cents:63000},{name:'Tosa higiênica',quantity:9,total_cents:18000}],products:[{name:fixtureProducts[0].name,quantity:6,total_cents:27000}],professionals:professionals.map((item,index)=>({...item,completed:12-index*3,cancelled:1,no_show:0,service_value_cents:84000-index*20000})),appointments:[{status:'done',count:21},{status:'confirmed',count:8},{status:'cancelled',count:2}],lowStock:[fixtureProducts[0]]});
  if(method==='GET'&&path==='/crm/clients')return reply({...pageOf(fixtureCrmClients),inactiveDays:60,timezone:'America/Sao_Paulo',summary:{clients:2,withoutVisits:1,inactive:1,pendingTasks:2,overdueTasks:1}});
  if(method==='GET'&&path==='/crm/tasks')return reply(pageOf(fixtureTasks));
  if(method==='GET'&&path.startsWith('/crm/clients/'))return reply({client:fixtureCrmClients.find(item=>path.endsWith(item.id))??fixtureCrmClients[0],timezone:'America/Sao_Paulo',pets:[{...pets[0],breed:'Sem raça definida'}],appointments:fixturesFor(today()).map(item=>({...item,service_names:item.services.map(service=>service.name)})),contacts:[{id:'qa-contact',tutor_id:ids.tutorA,channel:'phone',summary:'Combinamos um retorno para conferir os melhores horários. A tutora informou que prefere o período da tarde.',occurred_at:qaTimestamp,created_at:qaTimestamp,created_by_name:'Marina Exemplo'}],tasks:fixtureTasks});
  if(method==='GET'&&path==='/calendar/waitlist')return reply(fixtureWaitlist);
  if(method==='GET'&&/^\/calendar\/waitlist\/[^/]+\/opportunities$/.test(path))return reply({options:[{starts_at:`${today()}T14:00:00-03:00`,professional_id:ids.professionalA,professional_name:'Juliana Exemplo'}]});
  if(method==='GET'&&path==='/team')return reply(fixtureTeam);
  if(method==='GET'&&path==='/settings')return reply({late_tolerance_minutes:15,reminder_minutes_before:120});
  if(method==='GET'&&path==='/privacy/requests')return reply({...pageOf(fixturePrivacy),timezone:'America/Sao_Paulo',summary:{open:0,inProgress:1,completed:0,rejected:0,filesPending:1}});
  if(method==='GET'&&path.startsWith('/privacy/requests/'))return reply({request:fixturePrivacy[0],events:[{id:'qa-privacy-event',action:'created',status:'open',created_at:qaTimestamp,actor_name:'Marina Exemplo',reason_code:null}]});
  if(method==='GET'&&path==='/privacy/tutors')return reply({items:tutors.map(item=>({...item,anonymized_at:null}))});
  if(method==='GET'&&path==='/privacy/cleanup-queue')return reply({items:[{id:'qa-photo-job',request_id:'qa-privacy',state:'queued',attempt_count:1,next_attempt_at:qaTimestamp,last_error_code:null,created_at:qaTimestamp,finished_at:null}]});
  if(method==='GET'&&path==='/commercial/support')return reply(pageOf([fixtureTicket]));
  if(method==='GET'&&path==='/commercial/support/qa-support')return reply({ticket:fixtureTicket,messages:[{id:'qa-message-a',from_platform:false,body:'Gostaria de saber como organizar os horários dos profissionais e localizar os atendimentos da semana.',created_at:qaTimestamp},{id:'qa-message-b',from_platform:true,body:'Na Agenda, escolha a visualização Semana e use o filtro de profissional para conferir cada jornada.',created_at:qaTimestamp}]});
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
  const businessScreens:MenuKey[]=['crm','finance','inventory','reports','waitlist','team','privacy','support'];
  const initialView:MenuKey=requested==='overview'||requested==='onboarding'?'overview':requested==='clients'?'tutors':requested==='subscription'?'subscription':requested==='platform'?'platform':businessScreens.includes(requested as MenuKey)?requested as MenuKey:'calendar';
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
    {view==='overview'?<Overview go={go} can={()=>true} isAdmin onNew={()=>{setView('calendar');localScreen('form');}}/>:resource?<DataPage resource={resource} setMessage={setNotice} setError={setError} initialSearch={search} onSetup={target=>go(target)} canSetup={()=>true}/>:view==='subscription'?<SubscriptionPage setMessage={setNotice} setError={setError}/>:view==='platform'?<PlatformOperations setMessage={setNotice} setError={setError}/>:view==='calendar'?<CalendarPage setMessage={setNotice} setError={setError} initialNew={requested==='form'} searchQuery={search} onSaved={()=>setSearch('')}/>:view==='crm'?<CrmPage setMessage={setNotice} setError={setError}/>:view==='finance'?<FinancePage setMessage={setNotice} setError={setError}/>:view==='inventory'?<InventoryPage setMessage={setNotice} setError={setError}/>:view==='reports'?<ReportsPage setMessage={setNotice} setError={setError}/>:view==='waitlist'?<WaitlistPage setMessage={setNotice} setError={setError}/>:view==='team'?<TeamPage setMessage={setNotice} setError={setError}/>:view==='privacy'?<PrivacyPage setMessage={setNotice} setError={setError}/>:view==='support'?<SupportPage setMessage={setNotice} setError={setError}/>:<div className="panel"><p>Esta tela não faz parte da prévia local.</p><button type="button" className="ghost-btn" onClick={()=>go('overview')}>Voltar para Hoje</button></div>}
  </AppShell>;
}

const container=document.getElementById('root');
if(!container)throw Error('Contêiner da prévia local ausente.');
createRoot(container).render(<Harness/>);
