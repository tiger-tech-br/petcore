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
import PublicBookingPage from '../src/PublicBookingPage';
import PublicBookingSettings from '../src/PublicBookingSettings';
import PublicBookingInbox from '../src/PublicBookingInbox';
import DeliveryPage from '../src/DeliveryPage';
import PublicDeliveryPage from '../src/PublicDeliveryPage';
import PublicDeliverySettings from '../src/PublicDeliverySettings';
import PublicDeliveryInbox from '../src/PublicDeliveryInbox';
import TaxiDogPage from '../src/TaxiDogPage';
import type {TaxiBooking,TaxiDriver,TaxiService,TaxiTrip} from '../src/taxiDog';
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
let taxiEnabled=parameters.get('taxi')!=='off';
const fixtureTaxiServices:TaxiService[]=[{id:'10000000-0000-4000-8000-000000000015',name:'Táxi Dog — busca e entrega',price_cents:2500,transport_mode:'round_trip',service_type:'transport',active:true}];
const fixtureTaxiDrivers:TaxiDriver[]=[{id:'10000000-0000-4000-8000-000000000016',name:'Pedro Exemplo',phone:'11900000003',active:true},{id:'10000000-0000-4000-8000-000000000017',name:'Carolina Exemplo',phone:'11900000004',active:true}];
const taxiOptions=()=>({enabled:taxiEnabled,can_manage:true,timezone:'America/Sao_Paulo',server_now:new Date().toISOString(),services:fixtureTaxiServices,drivers:fixtureTaxiDrivers});
const options=()=>({tutors,pets,professionals,services,timezone:'America/Sao_Paulo',server_now:new Date().toISOString(),taxi_dog:taxiOptions()});
const session:Session={user:{id:ids.user,name:'Marina Exemplo',role:'admin',tenantId:ids.company,companyName:'Vila Pet • demonstração',scopeProfessionalId:null,permissions:[]},companies:[{id:ids.company,name:'Vila Pet • demonstração',role:'admin'}],features:{taxi_dog:taxiEnabled,delivery:parameters.get('screen')==='deliveries'||parameters.get('screen')?.startsWith('public-delivery')===true},legal:{required:false,version:'qa-unpublished'},subscription:{writable:true,access_until:null,trial_ends_at:null,paid_through:null,status:'trial',onboarding_completed_at:'2026-11-09T12:00:00Z',trial_started_at:'2026-11-09T12:00:00Z',onboarding_plan:'free',trial_days:30}};
const futureDay=(days:number)=>{const date=new Date(today()+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString();};
const paidBilling=parameters.get('billing')==='paid';
const checkoutPlans=[{id:'monthly',name:'PetCore Mensal',amount_cents:3500,interval_months:1,checkout_reviewed:true,checkout_url:'https://pag.ae/82jFKCTjo',active:true},{id:'yearly',name:'PetCore Anual',amount_cents:35000,interval_months:12,checkout_reviewed:true,checkout_url:'https://pag.ae/82jFLbrjr',active:true}];
const localSubscription={tenant_id:ids.company,plan_id:'monthly',plan_name:'PetCore Mensal',status:paidBilling?'active':'trial',trial_ends_at:futureDay(30),paid_through:paidBilling?futureDay(30):null,amount_cents:3500,interval_months:1,grace_days:3,access_until:futureDay(30),writable:true,suspension_reason:'',trial_days:30,trial_started_at:new Date().toISOString(),onboarding_completed_at:parameters.get('screen')==='onboarding'?null:new Date().toISOString(),onboarding_plan:'free',recurrence_cancelled_at:null as string|null};
const fixturePayments=paidBilling?[{id:'qa-fictitious-payment',plan_id:'monthly',amount_cents:3500,provider_reference:'QA-FICTICIO-NAO-E-PAGAMENTO',period_start:new Date().toISOString(),period_end:futureDay(30),received_at:new Date().toISOString(),voided_at:null}]:[];

const qaTimestamp=`${today()}T10:00:00-03:00`;
const fixtureTaxiBookings:Record<string,TaxiBooking>={};
const baseTaxiBooking:TaxiBooking={id:'qa-taxi-booking',appointment_id:'qa-appointment-a',service_id:fixtureTaxiServices[0].id,service_name:fixtureTaxiServices[0].name,price_cents:2500,mode:'round_trip',address:'Rua dos Exemplos, 120, Bairro Jardim, Santo André — SP',reference:'Casa com portão azul. Avisar na portaria antes de chegar.',notes:'Pet utiliza caixa de transporte. Conferir o nome do tutor na entrega.',cancelled_at:null,editable:true,trips:[]};
baseTaxiBooking.trips=(['pickup','dropoff'] as const).map((leg,index)=>({id:`qa-taxi-trip-${leg}`,booking_id:baseTaxiBooking.id,appointment_id:baseTaxiBooking.appointment_id,leg,driver_id:fixtureTaxiDrivers[index].id,driver_name:fixtureTaxiDrivers[index].name,starts_at:`${today()}T${index?'09:30':'08:30'}:00-03:00`,ends_at:`${today()}T${index?'10:00':'09:00'}:00-03:00`,status:'scheduled',pet_name:'Luna',tutor_name:'Ana Exemplo',tutor_phone:tutors[0].phone,address:baseTaxiBooking.address,reference:baseTaxiBooking.reference,notes:baseTaxiBooking.notes,appointment_starts_at:`${today()}T09:00:00-03:00`,appointment_ends_at:`${today()}T09:30:00-03:00`,service_name:baseTaxiBooking.service_name,price_cents:2500}));
fixtureTaxiBookings[baseTaxiBooking.appointment_id]=baseTaxiBooking;
const pageOf=<T,>(items:T[])=>({items,total:items.length,page:1,pageSize:20});
const fixtureProducts=[
  {id:'qa-product-a',name:'Shampoo suave para cães e gatos',sku:'SHAMPOO-500',unit:'frasco',price_cents:4500,cost_cents:2200,min_stock:5,stock_quantity:3,active:true,created_at:qaTimestamp,updated_at:qaTimestamp},
  {id:'qa-product-b',name:'Escova para cuidados diários',sku:'ESCOVA-01',unit:'un.',price_cents:2800,cost_cents:1200,min_stock:2,stock_quantity:12,active:true,created_at:qaTimestamp,updated_at:qaTimestamp}
];
// Delivery fixtures are private to this development harness. Orders, inventory,
// customer contacts and receipts below never reach a backend or a provider.
const qaDeliveryState=parameters.get('delivery-state')||'',qaCatalogState=parameters.get('public-delivery-state')||'';
const qaDeliveryProducts=[...fixtureProducts,
 {id:'10000000-0000-4000-8000-000000000041',name:'Ração para cães adultos sabor frango — pacote de 10 kg',sku:'RACAO-10',unit:'pacote',price_cents:12990,cost_cents:8000,min_stock:2,stock_quantity:18,active:true,created_at:qaTimestamp,updated_at:qaTimestamp},
 {id:'10000000-0000-4000-8000-000000000042',name:'Petisco natural para cães de pequeno porte',sku:'PETISCO-01',unit:'pacote',price_cents:2190,cost_cents:900,min_stock:2,stock_quantity:0,active:true,created_at:qaTimestamp,updated_at:qaTimestamp}
];
type QaDeliveryStatus='preparing'|'out_for_delivery'|'delivered'|'cancelled';
type QaDelivery={id:string;code:string;sale_id:string;sale_code:string;tutor_id:string;tutor_name:string;phone:string;tutor_phone:string;address:string;reference:string;notes:string;status:QaDeliveryStatus;delivery_fee_cents:number;subtotal_cents:number;discount_cents:number;total_cents:number;paid_cents:number;balance_cents:number;sale_status:'open'|'paid'|'cancelled';due_date:string;created_at:string;updated_at:string;out_for_delivery_at:string|null;delivered_at:string|null;cancelled_at:string|null;cancellation_reason:string;items:{id:string;product_id:string;description:string;quantity:number;unit_price_cents:number;total_cents:number}[];timezone:string};
const qaDeliveries:QaDelivery[]=qaDeliveryState==='empty'?[]:[
 {id:'10000000-0000-4000-8000-000000000043',code:'ENT-0001',sale_id:'10000000-0000-4000-8000-000000000044',sale_code:'CMD-ENT1',tutor_id:ids.tutorA,tutor_name:tutors[0].name,phone:tutors[0].phone,tutor_phone:tutors[0].phone,address:'Rua dos Exemplos, 120, Jardim das Flores, Santo André — SP\nCasa 2, portão azul',reference:'Em frente à praça. Avisar antes de chegar.',notes:'Pedido fictício recebido pelo WhatsApp. Não enviar mensagem real.',status:'preparing',delivery_fee_cents:700,subtotal_cents:12990,discount_cents:0,total_cents:13690,paid_cents:0,balance_cents:13690,sale_status:'open',due_date:today(),created_at:qaTimestamp,updated_at:qaTimestamp,out_for_delivery_at:null,delivered_at:null,cancelled_at:null,cancellation_reason:'',items:[{id:'qa-delivery-line-a',product_id:qaDeliveryProducts[2].id,description:qaDeliveryProducts[2].name,quantity:1,unit_price_cents:12990,total_cents:12990}],timezone:'America/Sao_Paulo'},
 {id:'10000000-0000-4000-8000-000000000045',code:'ENT-0002',sale_id:'10000000-0000-4000-8000-000000000046',sale_code:'CMD-ENT2',tutor_id:ids.tutorB,tutor_name:'Bruno Exemplo com Sobrenome Comprido',phone:tutors[1].phone,tutor_phone:tutors[1].phone,address:'Avenida da Demonstração, 987, apartamento 123, Bloco das Acácias, São Bernardo do Campo — SP',reference:'Deixar com o responsável na portaria.',notes:'Pedido fictício recebido por telefone.',status:'out_for_delivery',delivery_fee_cents:900,subtotal_cents:5600,discount_cents:0,total_cents:6500,paid_cents:6500,balance_cents:0,sale_status:'paid',due_date:today(),created_at:qaTimestamp,updated_at:qaTimestamp,out_for_delivery_at:qaTimestamp,delivered_at:null,cancelled_at:null,cancellation_reason:'',items:[{id:'qa-delivery-line-b',product_id:qaDeliveryProducts[1].id,description:qaDeliveryProducts[1].name,quantity:2,unit_price_cents:2800,total_cents:5600}],timezone:'America/Sao_Paulo'}
];
const qaPublicDeliveryToken='f'.repeat(48),qaDeliveryNotice='Seu pedido será conferido pelo pet shop. A entrega, a disponibilidade e o pagamento serão confirmados no contato informado.';
let qaPublicDeliverySettings={enabled:qaCatalogState!=='disabled',token:qaPublicDeliveryToken,link:'',coverage_note:'Entregas fictícias nos bairros Jardim e Centro de Santo André. Consulte a disponibilidade para outros locais.',notice:'Atendimento de segunda a sábado. O pagamento será combinado após a confirmação.',delivery_fee_cents:qaCatalogState==='fixed-fee'?700:null as number|null,delivery_enabled:qaCatalogState!=='feature-off',operation_mode:'complete',subscription_writable:qaCatalogState!=='expired',confirmation_notice:qaDeliveryNotice,updated_at:qaTimestamp};
type QaDeliveryRequest={id:string;receipt:string;status:'pending'|'confirmed'|'rejected';customer_name:string;phone:string;address:string;reference:string;notes:string;subtotal_cents:number;quoted_delivery_fee_cents:number|null;delivery_order_id:string|null;rejection_reason:string;created_at:string;reviewed_at:string|null;items:{product_id:string;name:string;unit:string;quantity:number;unit_price_cents:number}[]};
const qaDeliveryRequests:QaDeliveryRequest[]=qaCatalogState==='empty-inbox'?[]:[{id:'10000000-0000-4000-8000-000000000047',receipt:'1'.repeat(40),status:'pending',customer_name:'Ana Exemplo com Nome Comprido',phone:'11900000001',address:'Rua dos Exemplos, 120, Jardim das Flores, Santo André — SP\nCasa 2, portão azul',reference:'Em frente à praça.',notes:'Por favor, confirmar a entrega antes de separar os produtos. Pedido fictício.',subtotal_cents:12990,quoted_delivery_fee_cents:null,delivery_order_id:null,rejection_reason:'',created_at:qaTimestamp,reviewed_at:null,items:[{product_id:qaDeliveryProducts[2].id,name:qaDeliveryProducts[2].name,unit:'pacote',quantity:1,unit_price_cents:12990}]},
 {id:'10000000-0000-4000-8000-000000000048',receipt:'2'.repeat(40),status:'pending',customer_name:'Bruno Exemplo',phone:'11900000002',address:'Avenida das Demonstrações, 987, apartamento 123, Santo André — SP',reference:'Conferir nome na portaria.',notes:'',subtotal_cents:5600,quoted_delivery_fee_cents:900,delivery_order_id:null,rejection_reason:'',created_at:qaTimestamp,reviewed_at:null,items:[{product_id:qaDeliveryProducts[1].id,name:qaDeliveryProducts[1].name,unit:'un.',quantity:2,unit_price_cents:2800}]}];
const qaDeliveryOperations=new Map<string,{fingerprint:string;delivery:QaDelivery}>(),qaDeliveryReceiptOperations=new Map<string,{fingerprint:string;request:QaDeliveryRequest}>();
let qaDeliverySubmitCalls=0;
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
type WaitlistFixture={id:string;tutor_id:string;tutor_name:string;pet_id:string;pet_name:string;service_id:string;service_name:string;duration_minutes:number;service_active:boolean;professional_id:string|null;earliest_at:string;latest_at:string;status:string;notes:string;appointment_id?:string};
const waitlistState=parameters.get('waitlist-state');
const waitlistDay=futureDay(waitlistState==='expired'?-1:1).slice(0,10);
const fixtureWaitlist:WaitlistFixture[]=waitlistState==='empty'?[]:[{id:'qa-wait',tutor_id:ids.tutorA,tutor_name:'Ana Exemplo',pet_id:ids.petA,pet_name:'Luna',service_id:ids.serviceA,service_name:'Banho e cuidados especiais',duration_minutes:services[0].duration_minutes,service_active:waitlistState!=='service_unavailable',professional_id:null,earliest_at:`${waitlistDay}T13:00:00-03:00`,latest_at:`${waitlistDay}T18:00:00-03:00`,status:'waiting',notes:'Prefere atendimento no período da tarde.'}];
const fixtureTeam=[{id:ids.user,name:'Marina Exemplo',email:'marina@example.test',role:'admin',active:true,permissions:[]},{id:'qa-employee',name:'Juliana Exemplo',email:'juliana.atendimento@example.test',role:'employee',active:true,permissions:['appointments','tutors','crm']}];
const fixturePrivacy=[{id:'qa-privacy',tutor_id:ids.tutorA,tutor_name:'Ana Exemplo',anonymized_at:null,kind:'access',status:'in_progress',description:'Solicito uma cópia das informações do meu cadastro e dos atendimentos de Luna.',identity_verified:true,verification_method:'in_person',identity_verified_at:qaTimestamp,resolution:'Identidade conferida presencialmente. Levantamento dos registros em andamento.',created_at:qaTimestamp,updated_at:qaTimestamp,resolved_at:null,created_by_name:'Marina Exemplo'}];
const fixtureTicket={id:'qa-support',tenant_id:ids.company,company_name:'Vila Pet • demonstração',subject:'Dúvida sobre a organização da agenda',category:'technical',status:'in_progress',created_at:qaTimestamp,updated_at:qaTimestamp};
const qaPublicToken='a'.repeat(48),qaPublicNotice='Seu pedido será confirmado pelo pet shop. O horário só fica reservado depois dessa confirmação.';
let qaPublicSettings={enabled:parameters.get('public-state')!=='disabled',token:qaPublicToken,path:`/agendar/${qaPublicToken}`,notice:'Para seu pet ficar tranquilo, chegue 10 minutos antes. A equipe confirma o horário pelo contato informado.',confirmation_notice:qaPublicNotice,legal_ready:parameters.get('public-state')!=='unpublished',subscription_writable:parameters.get('public-state')!=='expired',updated_at:qaTimestamp};
const qaPublicRequests=[{id:'10000000-0000-4000-8000-000000000031',receipt:'b'.repeat(40),status:'pending',starts_at:`${futureDay(1).slice(0,10)}T10:00:00-03:00`,ends_at:`${futureDay(1).slice(0,10)}T11:00:00-03:00`,created_at:qaTimestamp,updated_at:qaTimestamp,appointment_id:null as string|null,reviewed_at:null as string|null,rejection_reason:'',tutor:{name:'Ana Exemplo com Sobrenome Comprido',phone:'(11) 90000-0001',email:'ana.contato.demonstracao@example.test'},pet:{name:'Luna',species:'Cachorro',size:'pequeno',breed:'Shih-tzu'},services},
 {id:'10000000-0000-4000-8000-000000000032',receipt:'c'.repeat(40),status:'pending',starts_at:`${futureDay(2).slice(0,10)}T14:30:00-03:00`,ends_at:`${futureDay(2).slice(0,10)}T15:00:00-03:00`,created_at:qaTimestamp,updated_at:qaTimestamp,appointment_id:null as string|null,reviewed_at:null as string|null,rejection_reason:'',tutor:{name:'Bruno Exemplo',phone:'(11) 90000-0002',email:''},pet:{name:'Thor',species:'Cachorro',size:'grande',breed:'Sem raça definida'},services:[services[0]]}];
const qaPublicReceipts=new Map<string,{receipt:string;message:string;ok:boolean;status:string}>();
const qaClientRegistrations=new Map<string,unknown>();let qaClientSubmitCalls=0;
let qaPublicSlotsCalls=0,qaPublicSubmitCalls=0;
const fixtureExportTicket={id:'10000000-0000-4000-8000-000000000021',subject:'Exportação dos dados da Vila Pet • solicitação fictícia do administrador',status:'in_progress',created_at:qaTimestamp};
let fixtureSupportReads=0;
const fixtureSupportMessages=[{id:'qa-message-a',from_platform:false,body:'Gostaria de saber como organizar os horários dos profissionais e localizar os atendimentos da semana.',created_at:qaTimestamp},{id:'qa-message-b',from_platform:true,body:'Na Agenda, escolha a visualização Semana e use o filtro de profissional para conferir cada jornada.',created_at:qaTimestamp}];

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

type Appointment={id:string;tutor_name:string;pet_name:string;professional_id:string;professional_name:string;starts_at:string;status:string;services:typeof services;taxi_dog?:{id:string;mode:string;service_name:string;price_cents:number;cancelled_at:string|null;status:string}|null};
const localAppointments:Appointment[]=[];
let sequence=1;
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fixturesFor=(day:string):Appointment[]=>[
  {id:'qa-appointment-a',tutor_name:tutors[0].name,pet_name:pets[0].name,professional_id:professionals[0].id,professional_name:professionals[0].name,starts_at:`${day}T09:00:00-03:00`,status:'confirmed',services:[services[0]]},
  {id:'qa-appointment-b',tutor_name:tutors[1].name,pet_name:pets[1].name,professional_id:professionals[1].id,professional_name:professionals[1].name,starts_at:`${day}T10:30:00-03:00`,status:'pending',services:[services[0],services[1]]},
  {id:'qa-appointment-c',tutor_name:tutors[0].name,pet_name:'Mel',professional_id:professionals[0].id,professional_name:professionals[0].name,starts_at:`${day}T11:30:00-03:00`,status:'in_progress',services:[services[1]]}
];

function setQaTaxiBooking(appointmentId:string,draft:Record<string,any>|null,appointment?:Appointment){
 const previous=fixtureTaxiBookings[appointmentId];
 if(!draft){if(previous){previous.cancelled_at=new Date().toISOString();for(const trip of previous.trips)trip.status='cancelled';}return;}
 const service=fixtureTaxiServices.find(item=>item.id===draft.service_id);if(!service)throw Error('Escolha um serviço fictício de transporte.');
 const row:TaxiBooking={id:previous?.id||`qa-taxi-booking-${sequence++}`,appointment_id:appointmentId,service_id:service.id,service_name:service.name,price_cents:service.price_cents,mode:service.transport_mode,address:String(draft.address||''),reference:String(draft.reference||''),notes:String(draft.notes||''),cancelled_at:null,editable:true,trips:[]};
 const start=appointment?.starts_at||`${today()}T09:00:00-03:00`,end=new Date(Date.parse(start)+(appointment?.services.reduce((sum,item)=>sum+item.duration_minutes,0)||30)*60000).toISOString();
 for(const leg of ['pickup','dropoff'] as const){const planned=draft[leg] as Record<string,string>|undefined;if(!planned)continue;const staff=fixtureTaxiDrivers.find(item=>item.id===planned.driver_id);if(!staff)throw Error('Escolha um motorista fictício.');row.trips.push({id:`qa-taxi-trip-${sequence++}`,booking_id:row.id,appointment_id:appointmentId,leg,driver_id:staff.id,driver_name:staff.name,starts_at:planned.starts_at,ends_at:planned.ends_at,status:'scheduled',pet_name:appointment?.pet_name||'Luna',tutor_name:appointment?.tutor_name||'Ana Exemplo',tutor_phone:tutors[0].phone,address:row.address,reference:row.reference,notes:row.notes,appointment_starts_at:start,appointment_ends_at:end,service_name:row.service_name,price_cents:row.price_cents});}
 fixtureTaxiBookings[appointmentId]=row;
}
const taxiSummary=(appointmentId:string)=>{const booking=fixtureTaxiBookings[appointmentId];return booking?{id:booking.id,mode:booking.mode,service_name:booking.service_name,price_cents:booking.price_cents,cancelled_at:booking.cancelled_at,status:booking.cancelled_at?'cancelled':booking.trips.every(item=>item.status==='completed')?'completed':booking.trips.some(item=>['en_route','with_pet'].includes(item.status))?'active':'scheduled'}:null;};

function createQaDelivery(draft:Record<string,unknown>):QaDelivery{
 const tutor=tutors.find(item=>item.id===draft.tutor_id);if(!tutor)throw Error('Escolha um cliente fictício.');
 if(!String(draft.phone||'').trim()||!String(draft.address||'').trim())throw Error('Informe telefone e endereço fictícios para a entrega.');
 if(!Array.isArray(draft.items)||!draft.items.length)throw Error('Escolha os produtos fictícios.');
 const seen=new Set<string>(),lines=draft.items.map((raw,index)=>{
  const item=raw as Record<string,unknown>,product=qaDeliveryProducts.find(row=>row.id===item.product_id),quantity=Number(item.quantity);
  if(!product||seen.has(product.id)||!Number.isInteger(quantity)||quantity<1||quantity>product.stock_quantity)throw Error('Produto ou quantidade sem disponibilidade na prévia.');
  seen.add(product.id);return{id:`qa-delivery-line-${sequence++}-${index}`,product_id:product.id,description:product.name,quantity,unit_price_cents:product.price_cents,total_cents:quantity*product.price_cents};
 });
 const fee=Number(draft.delivery_fee_cents??0);if(!Number.isInteger(fee)||fee<0)throw Error('Informe uma taxa de entrega válida.');
 const subtotal=lines.reduce((sum,line)=>sum+line.total_cents,0),id=crypto.randomUUID(),saleId=crypto.randomUUID(),now=new Date().toISOString();
 const row:QaDelivery={id,code:id.slice(0,8).toUpperCase(),sale_id:saleId,sale_code:saleId.slice(0,8).toUpperCase(),tutor_id:tutor.id,tutor_name:tutor.name,phone:String(draft.phone),tutor_phone:String(draft.phone),address:String(draft.address),reference:String(draft.reference||''),notes:String(draft.notes||''),status:'preparing',delivery_fee_cents:fee,subtotal_cents:subtotal,discount_cents:0,total_cents:subtotal+fee,paid_cents:0,balance_cents:subtotal+fee,sale_status:'open',due_date:String(draft.due_date||today()),created_at:now,updated_at:now,out_for_delivery_at:null,delivered_at:null,cancelled_at:null,cancellation_reason:'',items:lines,timezone:'America/Sao_Paulo'};
 for(const line of lines)qaDeliveryProducts.find(product=>product.id===line.product_id)!.stock_quantity-=line.quantity;
 qaDeliveries.unshift(row);return row;
}

// This replaces fetch before any component effect executes. No original fetch is retained.
window.fetch=(async(input:RequestInfo|URL,init?:RequestInit):Promise<Response>=>{
  const raw=input instanceof Request?input.url:String(input);
  const url=new URL(raw,location.href);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))throw Error('QA local: rede externa e APIs reais bloqueadas.');
  const method=init?.method||(input instanceof Request?input.method:'GET');
  const path=url.pathname.slice(4);
  let body:Record<string,unknown>={};
  if(typeof init?.body==='string'){try{body=JSON.parse(init.body) as Record<string,unknown>;}catch{return reply({error:'Corpo fictício inválido.'},400);}}
  if(path.startsWith('/public/delivery/')){
    const expected=`/public/delivery/${qaPublicDeliverySettings.token}`;
    if(!path.startsWith(expected)||['notfound','feature-off'].includes(qaCatalogState)||!qaPublicDeliverySettings.enabled||!qaPublicDeliverySettings.subscription_writable)return reply({error:'Catálogo fictício indisponível.'},404);
    if(method==='GET'&&path===expected){
      const query=(url.searchParams.get('q')||'').toLowerCase(),page=Math.max(1,Number(url.searchParams.get('page')||1));
      const products=qaCatalogState==='empty'?[]:qaDeliveryProducts.filter(product=>product.active&&product.name.toLowerCase().includes(query));
      return reply({businessName:'Vila Pet • produtos e cuidados',coverage_note:qaPublicDeliverySettings.coverage_note,notice:qaPublicDeliverySettings.notice,delivery_fee_cents:qaPublicDeliverySettings.delivery_fee_cents,confirmation_notice:qaDeliveryNotice,products:products.slice((page-1)*24,page*24).map(({id,name,unit,price_cents,stock_quantity})=>({id,name,unit,price_cents,available:stock_quantity>0})),total:products.length,page,page_size:24});
    }
    if(method==='POST'&&path===expected+'/requests'){
      qaDeliverySubmitCalls++;const key=String(body.idempotency_key||''),fingerprint=JSON.stringify(body),prior=qaDeliveryReceiptOperations.get(key);
      if(!key)return reply({error:'Identificador de envio fictício obrigatório.'},422);
      if(prior){if(prior.fingerprint!==fingerprint)return reply({error:'A chave fictícia já foi usada com outros dados.'},409);return reply({ok:true,receipt:prior.request.receipt,status:'pending',message:qaDeliveryNotice},201);}
      if(body.website||!String(body.customer_name||'').trim()||!String(body.phone||'').trim()||String(body.address||'').trim().length<8||!Array.isArray(body.items)||!body.items.length)return reply({error:'Preencha seus dados fictícios e escolha os produtos.'},422);
      const requested=body.items as {product_id:string;quantity:number}[],seen=new Set<string>();
      const lines=[];
      for(const item of requested){const product=qaDeliveryProducts.find(row=>row.id===item.product_id);if(!product||!product.active||seen.has(product.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>product.stock_quantity)return reply({error:'Um produto ou quantidade não está disponível na prévia.'},409);seen.add(product.id);lines.push({product_id:product.id,name:product.name,unit:product.unit,quantity:item.quantity,unit_price_cents:product.price_cents});}
      const row:QaDeliveryRequest={id:crypto.randomUUID(),receipt:crypto.randomUUID().replace(/-/g,'')+'3'.repeat(8),status:'pending',customer_name:String(body.customer_name),phone:String(body.phone),address:String(body.address),reference:String(body.reference||''),notes:String(body.notes||''),subtotal_cents:lines.reduce((sum,line)=>sum+line.quantity*line.unit_price_cents,0),quoted_delivery_fee_cents:qaPublicDeliverySettings.delivery_fee_cents,delivery_order_id:null,rejection_reason:'',created_at:new Date().toISOString(),reviewed_at:null,items:lines};
      qaDeliveryRequests.unshift(row);qaDeliveryReceiptOperations.set(key,{fingerprint,request:row});
      if(qaCatalogState==='uncertain'&&qaDeliverySubmitCalls===1)throw new TypeError('Prévia: pedido fictício salvo antes de uma interrupção da rede.');
      return reply({ok:true,receipt:row.receipt,status:'pending',message:qaDeliveryNotice},201);
    }
  }
  if(method==='GET'&&path==='/public-delivery/settings')return reply(qaPublicDeliverySettings);
  if(method==='PUT'&&path==='/public-delivery/settings'){
    if(!qaPublicDeliverySettings.subscription_writable)return reply({error:'Regularize a assinatura fictícia para alterar o catálogo.'},402);
    const token=body.rotate_token?'9'.repeat(48):qaPublicDeliverySettings.token;
    qaPublicDeliverySettings={...qaPublicDeliverySettings,enabled:body.enabled===true,coverage_note:String(body.coverage_note||''),notice:String(body.notice||''),delivery_fee_cents:body.delivery_fee_cents===null?null:Number(body.delivery_fee_cents),token,link:'',updated_at:new Date().toISOString()};return reply(qaPublicDeliverySettings);
  }
  if(method==='GET'&&path==='/deliveries/public-requests')return reply({items:qaDeliveryRequests.filter(item=>url.searchParams.get('status')==='all'||item.status==='pending')});
  if(/^\/deliveries\/public-requests\/[^/]+(?:\/(?:confirm|reject))?$/.test(path)){
    const id=path.split('/')[3],row=qaDeliveryRequests.find(item=>item.id===id);if(!row)return reply({error:'Pedido fictício não encontrado.'},404);
    if(method==='DELETE'){qaDeliveryRequests.splice(qaDeliveryRequests.indexOf(row),1);return reply({ok:true});}
    if(method==='POST'&&path.endsWith('/reject')){if(row.status!=='pending')return reply({error:'O pedido fictício já foi conferido.'},409);row.status='rejected';row.rejection_reason=String(body.reason||'');row.reviewed_at=new Date().toISOString();return reply({ok:true});}
    if(method==='POST'&&path.endsWith('/confirm')){
      const key=String(body.idempotency_key||''),fingerprint=path+JSON.stringify(body),prior=qaDeliveryOperations.get(key);
      if(prior)return prior.fingerprint===fingerprint?reply(prior.delivery,201):reply({error:'Operação fictícia com dados diferentes.'},409);
      if(qaCatalogState==='conflict')return reply({error:'O produto mudou de preço ou ficou sem estoque. Confira o pedido com o cliente.'},409);
      if(row.status!=='pending')return reply({error:'O pedido fictício já foi conferido.'},409);
      if(row.quoted_delivery_fee_cents===null&&body.delivery_fee_cents===undefined)return reply({error:'Informe a taxa de entrega combinada, inclusive zero se gratuita.'},422);
      let tutorId=String(body.tutor_id||'');
      if(!tutorId){const tutor={id:crypto.randomUUID(),name:row.customer_name,phone:row.phone,email:''};tutors.push(tutor);tutorId=tutor.id;}
      try{const delivery=createQaDelivery({tutor_id:tutorId,phone:row.phone,address:row.address,reference:row.reference,notes:row.notes,items:row.items.map(item=>({product_id:item.product_id,quantity:item.quantity})),delivery_fee_cents:body.delivery_fee_cents??row.quoted_delivery_fee_cents,due_date:body.due_date||today()});row.status='confirmed';row.delivery_order_id=delivery.id;row.reviewed_at=new Date().toISOString();qaDeliveryOperations.set(key,{fingerprint,delivery});return reply(delivery,201);}catch(cause){return reply({error:(cause as Error).message},409);}
    }
  }
  if(method==='GET'&&path==='/deliveries/options')return reply({tutors,products:qaDeliveryProducts,timezone:'America/Sao_Paulo'});
  if(method==='GET'&&path==='/deliveries'){
    const status=url.searchParams.get('status')||'active',query=(url.searchParams.get('q')||'').toLowerCase(),page=Math.max(1,Number(url.searchParams.get('page')||1)),pageSize=Math.min(100,Math.max(1,Number(url.searchParams.get('page_size')||20)));
    const rows=qaDeliveries.filter(item=>(status==='all'||status==='active'&&['preparing','out_for_delivery'].includes(item.status)||item.status===status)&&(!query||[item.code,item.sale_code,item.tutor_name,item.phone].some(value=>value.toLowerCase().includes(query))));
    return reply({items:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,page,pageSize});
  }
  if(method==='POST'&&path==='/deliveries'){
    const key=String(body.idempotency_key||''),fingerprint=path+JSON.stringify(body),prior=qaDeliveryOperations.get(key);
    if(prior)return prior.fingerprint===fingerprint?reply(prior.delivery,201):reply({error:'Operação fictícia com dados diferentes.'},409);
    try{const delivery=createQaDelivery(body);qaDeliveryOperations.set(key,{fingerprint,delivery});return reply(delivery,201);}catch(cause){return reply({error:(cause as Error).message},422);}
  }
  if(method==='GET'&&/^\/deliveries\/[^/]+$/.test(path)){const row=qaDeliveries.find(item=>item.id===path.split('/')[2]);return row?reply(row):reply({error:'Entrega fictícia não encontrada.'},404);}
  if(method==='POST'&&/^\/deliveries\/[^/]+\/status$/.test(path)){
    const row=qaDeliveries.find(item=>item.id===path.split('/')[2]);if(!row)return reply({error:'Entrega fictícia não encontrada.'},404);
    const key=String(body.idempotency_key||''),fingerprint=path+JSON.stringify(body),prior=qaDeliveryOperations.get(key);
    if(prior)return prior.fingerprint===fingerprint?reply(prior.delivery):reply({error:'Operação fictícia com dados diferentes.'},409);
    const status=String(body.status) as QaDeliveryStatus;if(row.status===status)return reply(row);
    if(['delivered','cancelled'].includes(row.status)||status==='delivered'&&row.status!=='out_for_delivery'||status==='out_for_delivery'&&row.status!=='preparing'||!['out_for_delivery','delivered','cancelled'].includes(status))return reply({error:'Confira a situação atual antes de avançar a entrega.'},409);
    if(status==='cancelled'&&String(body.reason||'').trim().length<3)return reply({error:'Informe o motivo do cancelamento fictício.'},422);
    row.status=status;row.updated_at=new Date().toISOString();
    if(status==='out_for_delivery')row.out_for_delivery_at=row.updated_at;
    if(status==='delivered')row.delivered_at=row.updated_at;
    if(status==='cancelled'){row.cancelled_at=row.updated_at;row.cancellation_reason=String(body.reason);row.sale_status='cancelled';row.balance_cents=0;for(const item of row.items)qaDeliveryProducts.find(product=>product.id===item.product_id)!.stock_quantity+=item.quantity;}
    qaDeliveryOperations.set(key,{fingerprint,delivery:row});return reply(row);
  }
  if(path.startsWith(`/public/booking/${qaPublicToken}`)&&(parameters.get('public-state')==='notfound'||!qaPublicSettings.enabled||!qaPublicSettings.subscription_writable))return reply({error:'Agendamento público indisponível.'},404);
  if(method==='GET'&&path===`/public/booking/${qaPublicToken}`){
    return reply({businessName:'Vila Pet • Banho e Tosa',timezone:'America/Sao_Paulo',services,notice:qaPublicSettings.notice,confirmation_notice:qaPublicNotice,enabled:true,horizon_days:90});
  }
  if(method==='GET'&&path===`/public/booking/${qaPublicToken}/slots`){
    qaPublicSlotsCalls++;
    if(parameters.get('public-state')==='slots-error'&&qaPublicSlotsCalls===1)return reply({error:'Prévia: falha temporária ao conferir horários.'},503);
    const date=url.searchParams.get('date')||today(),count=(url.searchParams.get('service_ids')||'').split(',').filter(Boolean).length;
    const slots=['09:00','10:00','11:15','13:00','14:30','15:30','16:00','17:00'].map(clock=>({starts_at:new Date(`${date}T${clock}:00-03:00`).toISOString(),ends_at:new Date(Date.parse(`${date}T${clock}:00-03:00`)+Math.max(count,1)*30*60000).toISOString()})).filter(slot=>Date.parse(slot.starts_at)>Date.now());
    return reply({slots:parameters.get('public-state')==='empty'?[]:slots,confirmation_notice:qaPublicNotice});
  }
  if(method==='POST'&&path===`/public/booking/${qaPublicToken}/requests`){
    qaPublicSubmitCalls++;const key=String(body.idempotency_key||'');
    if(!key)return reply({error:'A prévia precisa de identificador de envio.'},422);
    const existing=qaPublicReceipts.get(key),saved=existing??{ok:true,receipt:'d'.repeat(40),status:'pending',message:qaPublicNotice};qaPublicReceipts.set(key,saved);
    if(['uncertain','rate-error'].includes(parameters.get('public-state')||'')&&qaPublicSubmitCalls===1)throw new TypeError('Prévia: conexão interrompida após registrar pedido fictício.');
    if(parameters.get('public-state')==='rate-error'&&qaPublicSubmitCalls===2)return reply({error:'Prévia: aguarde antes de verificar novamente.'},429);
    return reply(saved,201);
  }
  if(method==='GET'&&path==='/public-booking/settings')return reply(qaPublicSettings);
  if(method==='PUT'&&path==='/public-booking/settings'){
    if(body.enabled&&!qaPublicSettings.subscription_writable)return reply({error:'Confira a assinatura antes de ativar o link.'},409);
    const token=body.rotate_token?'e'.repeat(48):qaPublicSettings.token;
    qaPublicSettings={...qaPublicSettings,enabled:body.enabled===true,notice:String(body.notice??''),token,path:`/agendar/${token}`,updated_at:new Date().toISOString()};return reply(qaPublicSettings);
  }
  if(method==='GET'&&path==='/public-booking/requests'){const status=url.searchParams.get('status')||'pending';return reply({items:qaPublicRequests.filter(row=>status==='all'||row.status===status)});}
  if(method==='POST'&&/^\/public-booking\/requests\/[^/]+\/(confirm|reject)$/.test(path)){
    const row=qaPublicRequests.find(item=>item.id===path.split('/')[3]);if(!row)return reply({error:'Pedido fictício não encontrado.'},404);
    if(parameters.get('public-state')==='conflict'&&path.endsWith('/confirm'))return reply({error:'O horário foi ocupado. Combine outro horário com o cliente.'},409);
    row.status=path.endsWith('/confirm')?'confirmed':'rejected';row.appointment_id=row.status==='confirmed'?'10000000-0000-4000-8000-000000000033':null;row.reviewed_at=new Date().toISOString();row.rejection_reason=String(body.reason??'');return reply({id:row.id,status:row.status,appointment_id:row.appointment_id});
  }
  if(method==='GET'&&path==='/taxi-dog/options')return reply(taxiOptions());
  if(method==='GET'&&path==='/taxi-dog/drivers')return reply({items:fixtureTaxiDrivers});
  if(method==='POST'&&path==='/taxi-dog/drivers'){const item:TaxiDriver={id:`qa-driver-${sequence++}`,name:String(body.name||''),phone:String(body.phone||''),active:body.active!==false};fixtureTaxiDrivers.push(item);return reply(item,201);}
  if(method==='PATCH'&&/^\/taxi-dog\/drivers\/[^/]+$/.test(path)){const item=fixtureTaxiDrivers.find(item=>item.id===path.split('/')[3]);if(!item)return reply({error:'Motorista fictício não encontrado.'},404);Object.assign(item,{name:String(body.name||''),phone:String(body.phone||''),active:body.active!==false});return reply(item);}
  if(method==='GET'&&path==='/taxi-dog/trips'){const from=url.searchParams.get('from')||today(),to=url.searchParams.get('to')||from,driver=url.searchParams.get('driver_id'),status=url.searchParams.get('status'),page=Number(url.searchParams.get('page')||1);const items=Object.values(fixtureTaxiBookings).flatMap(item=>item.trips).filter(item=>item.starts_at.slice(0,10)>=from&&item.starts_at.slice(0,10)<=to&&(!driver||item.driver_id===driver)&&(!status||item.status===status));return reply({items:items.slice((page-1)*20,page*20),pagination:{page,pageSize:20,total:items.length,totalPages:Math.max(1,Math.ceil(items.length/20))},timezone:'America/Sao_Paulo'});}
  if(method==='PATCH'&&/^\/taxi-dog\/trips\/[^/]+\/status$/.test(path)){const trip=Object.values(fixtureTaxiBookings).flatMap(item=>item.trips).find(item=>item.id===path.split('/')[3]);if(!trip)return reply({error:'Viagem fictícia não encontrada.'},404);if(trip.status!==body.expected_status)return reply({error:'A viagem foi alterada. Atualize a prévia.'},409);trip.status=body.status as TaxiTrip['status'];return reply({ok:true});}
  if(method==='GET'&&/^\/taxi-dog\/appointments\/[^/]+$/.test(path)){const booking=fixtureTaxiBookings[path.split('/')[3]];return reply({booking:booking?{...booking,editable:booking.cancelled_at!==null||booking.trips.every(item=>item.status==='scheduled')}:null});}
  if(method==='PUT'&&/^\/taxi-dog\/appointments\/[^/]+$/.test(path)){const id=path.split('/')[3];setQaTaxiBooking(id,body.taxi_dog as Record<string,any>|null,localAppointments.find(item=>item.id===id));return reply({ok:true});}
  if(method==='PATCH'&&path==='/settings'){taxiEnabled=body.taxi_dog_enabled===true;session.features={...session.features,taxi_dog:taxiEnabled,delivery:body.delivery_enabled===true};qaPublicDeliverySettings.delivery_enabled=body.delivery_enabled===true;return reply({ok:true});}
  if(method==='GET'&&path==='/public/legal')return reply({published:false,version:'qa-unpublished',effectiveDate:null,operator:{brand:'PetCore • prévia local',legalName:'Responsável fictício',address:null,supportEmail:'suporte@example.test',privacyEmail:'privacidade@example.test'},documents:{privacy:'Documento fictício apenas para conferir esta tela. Não é uma política publicada.',terms:'Termos fictícios apenas para conferir esta tela. Não representam aceite contratual.'},subprocessors:[]});
  if(method==='GET'&&path==='/auth/me')return reply(session);
  if(method==='GET'&&path==='/notifications')return reply({items:[],unreadCount:0});
  if(method==='GET'&&path==='/calendar/options')return reply(options());
  if(method==='GET'&&path==='/calendar/waitlist/options')return reply({...options(),services:waitlistState==='service_unavailable'?services.filter(item=>item.id!==ids.serviceA):services});
  if(method==='POST'&&path==='/data/clients-with-pets'){
    qaClientSubmitCalls++;const key=String(body.idempotency_key||'');if(!key)return reply({error:'Identificador de envio obrigatório.'},422);
    let saved=qaClientRegistrations.get(key);
    if(!saved){const owner=body.tutor as Record<string,any>,animals=body.pets as Record<string,any>[];const tutor={id:crypto.randomUUID(),name:owner.name,phone:owner.phone||'',email:owner.email||''};tutors.push(tutor);const added=animals.map(pet=>({...pet,id:crypto.randomUUID(),tutor_id:tutor.id,tutor_name:tutor.name,name:String(pet.name),species:String(pet.species)}));pets.push(...added);saved={tutor,pets:added};qaClientRegistrations.set(key,saved);}
    if(['uncertain','rate-error'].includes(parameters.get('client-state')||'')&&qaClientSubmitCalls===1)throw new TypeError('Prévia: envio fictício salvo antes da queda de conexão.');
    if(parameters.get('client-state')==='rate-error'&&qaClientSubmitCalls===2)return reply({error:'Prévia: aguarde para verificar novamente.'},429);
    return reply(saved,201);
  }
  if(method==='GET'&&path==='/data/tutors')return reply(tutors);
  if(method==='GET'&&path==='/data/pets')return reply(pets);
  if(method==='GET'&&path==='/data/services')return reply([...services,...fixtureTaxiServices.map(item=>({...item,duration_minutes:0}))]);
  if(method==='GET'&&path==='/data/professionals')return reply(professionals.map(item=>({...item,active:true})));
  if(method==='GET'&&path==='/options/pet-tutors')return reply(tutors);
  if(method==='GET'&&path==='/options/professional-accounts')return reply([]);
  if(method==='GET'&&path==='/commercial/setup')return reply({services:2,professionals:2,readyProfessionals:2,tutors:3,pets:2,appointments:3,sales:0,receipts:0});
  if(method==='GET'&&path==='/business/summary')return reply({from:fixtureDaily[0].date,to:today(),timezone:'America/Sao_Paulo',totals:fixtureTotals,daily:fixtureDaily,paymentMethods:[{payment_method:'pix',receipts_cents:307500,refunds_cents:2000}],cash:fixtureCash});
  if(method==='GET'&&path==='/business/products')return reply({...pageOf(fixtureProducts),summary:{products:2,lowStock:1,units:15}});
  if(method==='GET'&&path==='/business/options')return reply({...options(),services:[...services,...fixtureTaxiServices.map(item=>({...item,duration_minutes:0}))],products:fixtureProducts,appointments:fixturesFor(today()),timezone:'America/Sao_Paulo'});
  if(method==='GET'&&path==='/business/cash')return reply({current:fixtureCash,recent:[fixtureCash],timezone:'America/Sao_Paulo'});
  if(method==='GET'&&path==='/business/sales')return reply(pageOf([...fixtureSales,...qaDeliveries.map(row=>({id:row.sale_id,code:row.sale_code,tutor_id:row.tutor_id,tutor_name:row.tutor_name,appointment_id:null,status:row.sale_status,subtotal_cents:row.subtotal_cents,discount_cents:row.discount_cents,delivery_fee_cents:row.delivery_fee_cents,total_cents:row.total_cents,paid_cents:row.paid_cents,balance_cents:row.balance_cents,due_date:row.due_date,notes:'Comanda da entrega fictícia.',created_at:row.created_at,cancelled_at:row.cancelled_at,cancellation_reason:row.cancellation_reason}))]));
  if(method==='GET'&&/^\/business\/sales\/[^/]+$/.test(path)){
    const row=qaDeliveries.find(item=>item.sale_id===path.split('/')[3]);
    if(row)return reply({sale:{id:row.sale_id,code:row.sale_code,tutor_id:row.tutor_id,tutor_name:row.tutor_name,appointment_id:null,status:row.sale_status,subtotal_cents:row.subtotal_cents,discount_cents:row.discount_cents,delivery_fee_cents:row.delivery_fee_cents,total_cents:row.total_cents,paid_cents:row.paid_cents,balance_cents:row.balance_cents,due_date:row.due_date,notes:'Comanda da entrega fictícia.',created_at:row.created_at,cancelled_at:row.cancelled_at,cancellation_reason:row.cancellation_reason},items:row.items,payments:row.paid_cents?[{id:'qa-delivery-payment',kind:'sale_payment',amount_cents:row.paid_cents,payment_method:'pix',created_at:row.created_at,created_by_name:'Marina Exemplo'}]:[],timezone:row.timezone});
  }
  if(method==='GET'&&path.startsWith('/business/sales/'))return reply({sale:fixtureSales.find(item=>path.endsWith(item.id))??fixtureSales[0],items:[{id:'qa-line-a',description:'Banho',quantity:1,unit_price_cents:3500,total_cents:3500},{id:'qa-line-b',description:fixtureProducts[0].name,quantity:1,unit_price_cents:4500,total_cents:4500}],payments:[{id:'qa-payment',kind:'sale_payment',amount_cents:2000,payment_method:'pix',created_at:qaTimestamp,created_by_name:'Marina Exemplo'}],timezone:'America/Sao_Paulo'});
  if(method==='GET'&&path==='/business/expenses')return reply(pageOf(fixtureExpenses));
  if(method==='GET'&&path==='/business/stock-movements')return reply(pageOf([{id:'qa-movement',product_id:fixtureProducts[0].id,product_name:fixtureProducts[0].name,quantity_delta:-2,balance_after:3,reason:'usage',note:'Consumo fictício em atendimentos de banho e tosa.',created_at:qaTimestamp,created_by_name:'Juliana Exemplo'}]));
  if(method==='GET'&&path==='/business/reports')return reply({from:fixtureDaily[0].date,to:today(),timezone:'America/Sao_Paulo',sales:{count:12,total_cents:350000,discount_cents:5000},financial:fixtureTotals,services:[{name:'Banho completo e cuidados especiais',quantity:18,total_cents:63000},{name:'Tosa higiênica',quantity:9,total_cents:18000}],products:[{name:fixtureProducts[0].name,quantity:6,total_cents:27000}],professionals:professionals.map((item,index)=>({...item,completed:12-index*3,cancelled:1,no_show:0,service_value_cents:84000-index*20000})),appointments:[{status:'done',count:21},{status:'confirmed',count:8},{status:'cancelled',count:2}],lowStock:[fixtureProducts[0]]});
  if(method==='GET'&&path==='/crm/clients')return reply({...pageOf(fixtureCrmClients),inactiveDays:60,timezone:'America/Sao_Paulo',summary:{clients:2,withoutVisits:1,inactive:1,pendingTasks:2,overdueTasks:1}});
  if(method==='GET'&&path==='/crm/tasks')return reply(pageOf(fixtureTasks));
  if(method==='GET'&&path.startsWith('/crm/clients/'))return reply({client:fixtureCrmClients.find(item=>path.endsWith(item.id))??fixtureCrmClients[0],timezone:'America/Sao_Paulo',pets:[{...pets[0],breed:'Sem raça definida'}],appointments:fixturesFor(today()).map(item=>({...item,service_names:item.services.map(service=>service.name)})),contacts:[{id:'qa-contact',tutor_id:ids.tutorA,channel:'phone',summary:'Combinamos um retorno para conferir os melhores horários. A tutora informou que prefere o período da tarde.',occurred_at:qaTimestamp,created_at:qaTimestamp,created_by_name:'Marina Exemplo'}],tasks:fixtureTasks});
  if(method==='DELETE'&&/^\/calendar\/waitlist\/[^/]+$/.test(path)){
    const row=fixtureWaitlist.find(item=>item.id===path.split('/')[3]);
    if(!row)return reply({error:'Solicitação fictícia não encontrada.'},404);
    if(!['waiting','offered'].includes(row.status))return reply({error:'Somente solicitações em espera podem ser excluídas da lista.'},409);
    row.status='closed';return reply(row);
  }
  if(method==='GET'&&path==='/calendar/waitlist')return reply(fixtureWaitlist);
  if(method==='POST'&&path==='/calendar/waitlist'){
    const tutor=tutors.find(item=>item.id===body.tutor_id),pet=pets.find(item=>item.id===body.pet_id),service=services.find(item=>item.id===body.service_id);
    const start=Date.parse(String(body.earliest_at)),end=Date.parse(String(body.latest_at));
    if(!tutor||!pet||pet.tutor_id!==tutor.id||!service||!Number.isFinite(start)||!Number.isFinite(end)||start<=Date.now()||start+service.duration_minutes*60000>end)return reply({error:'Escolha um período futuro que comporte o serviço.'},422);
    if('professional_id' in body)return reply({error:'A prévia escolhe automaticamente quem atende.'},422);
    const row:WaitlistFixture={id:`qa-wait-${sequence++}`,tutor_id:tutor.id,tutor_name:tutor.name,pet_id:pet.id,pet_name:pet.name,service_id:service.id,service_name:service.name,duration_minutes:service.duration_minutes,service_active:waitlistState!=='service_unavailable'||service.id!==ids.serviceA,professional_id:null,earliest_at:new Date(start).toISOString(),latest_at:new Date(end).toISOString(),status:'waiting',notes:String(body.notes||'')};
    fixtureWaitlist.push(row);return reply(row,201);
  }
  if(/^\/calendar\/waitlist\/[^/]+\/(opportunities|availability|offer|book)$/.test(path)){
    const id=path.split('/')[3],action=path.split('/')[4],row=fixtureWaitlist.find(item=>item.id===id);
    if(!row)return reply({error:'Solicitação fictícia não encontrada.'},404);
    if(!['waiting','offered'].includes(row.status))return reply({error:'Esta oportunidade já foi utilizada.'},409);
    const service=services.find(item=>item.id===row.service_id),duration=(service?.duration_minutes||30)*60000;
    if(method==='GET'&&action==='opportunities'){
      const emptyReason=Date.parse(row.latest_at)<=Date.now()?'expired':!service||!row.service_active?'service_unavailable':['no_eligible_professional','no_availability'].includes(waitlistState||'')?waitlistState:null;
      if(emptyReason)return reply({options:[],reason:emptyReason,searchedUntil:row.latest_at});
      const start=Math.max(Date.parse(row.earliest_at),Math.floor(Date.now()/60000)*60000+60000),end=Date.parse(row.latest_at);
      const suggested=[];
      for(let time=start;time+duration<=end&&suggested.length<5;time+=30*60000)suggested.push({starts_at:new Date(time).toISOString(),ends_at:new Date(time+duration).toISOString(),professional_id:ids.professionalA,professional_name:professionals[0].name});
      return reply({options:suggested,...(!suggested.length?{reason:'no_availability'}:{}),searchedUntil:row.latest_at});
    }
    if(method==='PATCH'&&action==='availability'){
      const start=Date.parse(String(body.earliest_at)),end=Date.parse(String(body.latest_at));
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<=Date.now()||start+duration>end)return reply({error:'Escolha um período futuro que comporte o serviço.'},422);
      row.earliest_at=new Date(start).toISOString();row.latest_at=new Date(end).toISOString();row.status='waiting';return reply(row);
    }
    if(method==='POST'&&action==='offer'){
      if(row.status!=='waiting')return reply({error:'Oferta não disponível.'},409);
      row.status='offered';return reply({offer:row,delivered:false});
    }
    if(method==='POST'&&action==='book'){
      if('professional_id' in body)return reply({error:'A prévia escolhe automaticamente quem atende.'},422);
      const start=Date.parse(String(body.starts_at));
      if(!Number.isFinite(start)||start<=Date.now()||start<Date.parse(row.earliest_at)||start+duration>Date.parse(row.latest_at)||body.tutor_consent!==true)return reply({error:'Escolha um horário futuro dentro da disponibilidade do tutor.'},422);
      if(!service||!row.service_active)return reply({error:'O serviço não está disponível. Escolha um serviço ativo em um novo pedido.'},422);
      if(['no_eligible_professional','no_availability'].includes(waitlistState||''))return reply({error:'Esse horário não está disponível para o serviço escolhido. Escolha outro horário.'},409);
      const appointment:Appointment={id:`qa-wait-booked-${sequence++}`,tutor_name:row.tutor_name,pet_name:row.pet_name,professional_id:ids.professionalA,professional_name:professionals[0].name,starts_at:new Date(start).toISOString(),status:'pending',services:[service]};
      localAppointments.push(appointment);row.status='booked';row.appointment_id=appointment.id;return reply(appointment,201);
    }
  }
  if(method==='GET'&&path==='/team')return reply(fixtureTeam);
  if(method==='GET'&&path==='/settings')return reply({name:'Vila Pet • demonstração',timezone:'America/Sao_Paulo',operation_mode:parameters.get('operation')==='complete'||session.features?.delivery?'complete':'essential',late_tolerance_minutes:15,reminder_minutes_before:120,taxi_dog_enabled:taxiEnabled,delivery_enabled:qaPublicDeliverySettings.delivery_enabled});
  if(method==='GET'&&path==='/privacy/requests')return reply({...pageOf(fixturePrivacy),timezone:'America/Sao_Paulo',summary:{open:0,inProgress:1,completed:0,rejected:0,filesPending:1}});
  if(method==='GET'&&path.startsWith('/privacy/requests/'))return reply({request:fixturePrivacy[0],events:[{id:'qa-privacy-event',action:'created',status:'open',created_at:qaTimestamp,actor_name:'Marina Exemplo',reason_code:null}]});
  if(method==='GET'&&path==='/privacy/tutors')return reply({items:tutors.map(item=>({...item,anonymized_at:null}))});
  if(method==='GET'&&path==='/privacy/cleanup-queue')return reply({items:[{id:'qa-photo-job',request_id:'qa-privacy',state:'queued',attempt_count:1,next_attempt_at:qaTimestamp,last_error_code:null,created_at:qaTimestamp,finished_at:null}]});
  if(method==='GET'&&path==='/commercial/platform/support-summary')return reply({pending_count:1,emails:{queued:0,sending:0,sent:3,failed:0,uncertain:0},notifications_enabled:true,email_configured:true});
  if(method==='GET'&&path==='/commercial/support')return reply(pageOf([fixtureTicket]));
  if(method==='GET'&&path==='/commercial/support/qa-support'){
    fixtureSupportReads++;
    if(parameters.get('support-updates')==='error'&&fixtureSupportReads===2)return reply({error:'Falha fictícia ao atualizar. Nenhum servidor foi acessado.'},503);
    if(parameters.has('support-updates')&&fixtureSupportReads>1){fixtureTicket.status='resolved';fixtureTicket.updated_at=new Date().toISOString();fixtureSupportMessages.push({id:`qa-message-incoming-${fixtureSupportReads}`,from_platform:true,body:`Resposta externa fictícia ${fixtureSupportReads-1}: recebida durante o acompanhamento da conversa.`,created_at:fixtureTicket.updated_at});}
    return reply({ticket:fixtureTicket,messages:fixtureSupportMessages});
  }
  if(method==='GET'&&path==='/commercial/me')return reply({subscription:localSubscription,plans:checkoutPlans,payments:fixturePayments,canManage:true,supportEmail:'suporte@example.test',billingMode:'pagbank_recurring_link_manual_reconciliation',trialDays:30,checkoutRequiresSupport:paidBilling&&!localSubscription.recurrence_cancelled_at});
  if(method==='GET'&&path==='/commercial/platform/settings')return reply({brand:'Tiger Tech • QA local',legal_name:'Responsável fictício',support_email:'suporte@example.test',privacy_email:'privacidade@example.test',address:'Endereço fictício da prévia',privacy_text:'Documento fictício não publicado.',terms_text:'Documento fictício não publicado.',published:false,legal_version:'qa-unpublished',effective_date:null,subprocessors:[],trial_days:30,grace_days:3,plans:checkoutPlans});
  if(method==='GET'&&path==='/commercial/platform/subscriptions')return reply({items:[{id:ids.company,name:'Vila Pet • demonstração',active:true,...localSubscription}],page:1,pageSize:20,total:1});
  if(method==='GET'&&path===`/commercial/platform/subscriptions/${ids.company}`)return reply({company:{id:ids.company,name:'Vila Pet • demonstração',active:true},subscription:localSubscription,payments:fixturePayments,plans:checkoutPlans});
  if(method==='GET'&&path===`/commercial/platform/subscriptions/${ids.company}/export-requests`)return reply({items:parameters.get('export-requests')==='empty'?[]:[fixtureExportTicket]});
  if(method==='POST'&&path===`/commercial/platform/subscriptions/${ids.company}/export`){
    if(body.ticket_id!==fixtureExportTicket.id||body.identity_verified!==true||typeof body.password!=='string'||!body.password)return reply({error:'Preencha a autorização fictícia. Não use sua senha real na prévia.'},422);
    const signal=init?.signal||(input instanceof Request?input.signal:undefined);
    return await new Promise<Response>((resolve,reject)=>{
      const cancel=()=>{window.clearTimeout(timer);reject(new DOMException('Preparação fictícia cancelada.','AbortError'));};
      const timer=window.setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve(reply({error:'QA local: preparação simulada encerrada sem gerar arquivo ou acessar servidor.'},503));},60000);
      if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
    });
  }
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
    return reply([...fixturesFor(date),...localAppointments.filter(item=>item.starts_at.slice(0,10)===date)].map(item=>({...item,taxi_dog:taxiSummary(item.id)})));
  }
  if(method==='GET'&&/^\/calendar\/appointments\/[^/]+\/history$/.test(path))return reply([{id:'qa-history',created_at:`${today()}T08:00:00-03:00`,actor_name:'Equipe fictícia',kind:'created'}]);
  if(method==='POST'&&path==='/auth/login')return reply({ok:true});
  if(method==='POST'&&path==='/auth/logout')return reply({ok:true});
  if(method==='POST'&&path==='/auth/password/forgot')return reply({message:'Prévia local: nenhum e-mail foi enviado.'});
  if(method==='POST'&&path==='/calendar/appointments'){
    const tutor=tutors.find(item=>item.id===body.tutor_id),pet=pets.find(item=>item.id===body.pet_id),professional=body.professional_id?professionals.find(item=>item.id===body.professional_id):professionals[0];
    const chosen=services.filter(item=>Array.isArray(body.service_ids)&&body.service_ids.includes(item.id));
    if(!tutor||!pet||pet.tutor_id!==tutor.id||!professional||!chosen.length||typeof body.starts_at!=='string')return reply({error:'Escolha os cadastros fictícios para completar a prévia.'},422);
    const row:Appointment={id:`qa-local-created-${sequence++}`,tutor_name:tutor.name,pet_name:pet.name,professional_id:professional.id,professional_name:professional.name,starts_at:body.starts_at,status:'pending',services:chosen};
    if(body.taxi_dog)setQaTaxiBooking(row.id,body.taxi_dog as Record<string,any>,row);
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
  const businessScreens:MenuKey[]=['taxi-dog','deliveries','crm','finance','inventory','reports','waitlist','team','privacy','support'];
  const initialView:MenuKey=requested==='overview'||requested==='onboarding'?'overview':requested==='clients'?'tutors':requested==='subscription'?'subscription':requested==='platform'?'platform':requested.startsWith('public-delivery')?'deliveries':requested==='taxi'?'taxi-dog':businessScreens.includes(requested as MenuKey)?requested as MenuKey:'calendar';
  const [sessionVersion,setSessionVersion]=useState(0);void sessionVersion;
  const [platformSupportRequest,setPlatformSupportRequest]=useState(0);
  const [deliveryRevision,setDeliveryRevision]=useState(0);
  const [deliverySaleId,setDeliverySaleId]=useState<string|undefined>();
  const [view,setView]=useState<MenuKey>(initialView),[search,setSearch]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[onboarding,setOnboarding]=useState(requested==='onboarding'),[checkout,setCheckout]=useState('');
  useEffect(()=>{const capture=(event:Event)=>setCheckout((event as CustomEvent<string>).detail);window.addEventListener('petcore-qa-checkout',capture);return()=>window.removeEventListener('petcore-qa-checkout',capture);},[]);
  const go=(target:MenuKey)=>{setView(target);setSearch('');};
  const resource:Resource|null=['tutors','pets','professionals','services'].includes(view)?view as Resource:null;
  if(requested==='login')return <AuthScreen onDone={()=>localScreen('agenda')} onReadLegal={()=>setNotice('Documentos não publicados nesta prévia local.')}/>;
  if(requested==='public-booking')return <PublicBookingPage token={qaPublicToken}/>;
  if(requested==='public-delivery')return <PublicDeliveryPage token={qaPublicDeliveryToken}/>;
  const shellSession:Session=view==='platform'?{...session,user:{...session.user,role:'platform'}}:session;
  return <AppShell session={shellSession} view={view} go={go} onSearch={(target,query)=>{setView(target);setSearch(query);}} company={()=>{}} logout={()=>localScreen('login')} onOpenPlatformSupport={()=>{go('platform');setPlatformSupportRequest(value=>value+1);}}>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {notice&&<div className="alert success" role="status">{notice}</div>}
    {checkout&&<aside className="alert success" role="status">Prévia local: destino do pagamento capturado, sem abrir o provedor: <span style={{overflowWrap:'anywhere'}}>{checkout}</span></aside>}
    {onboarding&&<PlanOnboardingDialog onDone={()=>{setOnboarding(false);setView('subscription');}} onLogout={()=>localScreen('login')}/>}
    {requested==='public-delivery-settings'?<PublicDeliverySettings setMessage={setNotice} setError={setError} writable={qaPublicDeliverySettings.subscription_writable}/>:requested==='public-delivery-inbox'?<PublicDeliveryInbox setMessage={setNotice} setError={setError} writable={qaPublicDeliverySettings.subscription_writable} isAdmin onChanged={()=>setDeliveryRevision(value=>value+1)}/>:requested==='public-booking-settings'?<PublicBookingSettings setMessage={setNotice} setError={setError}/>:requested==='public-booking-inbox'?<PublicBookingInbox setMessage={setNotice} setError={setError} onChanged={()=>{}} writable/>:requested==='public-booking-combined'?<><PublicBookingSettings setMessage={setNotice} setError={setError}/><PublicBookingInbox setMessage={setNotice} setError={setError} onChanged={()=>{}} writable/></>:view==='overview'?<Overview go={go} can={()=>true} isAdmin onNew={()=>{setView('calendar');localScreen('form');}}/>:resource?<DataPage resource={resource} setMessage={setNotice} setError={setError} initialSearch={search} onSetup={target=>go(target)} canSetup={()=>true}/>:view==='subscription'?<SubscriptionPage setMessage={setNotice} setError={setError}/>:view==='platform'?<PlatformOperations setMessage={setNotice} setError={setError} supportRequest={platformSupportRequest}/>:view==='calendar'?<CalendarPage setMessage={setNotice} setError={setError} initialNew={requested==='form'||requested==='taxi-form'} canTaxiDog searchQuery={search} onSaved={()=>setSearch('')}/>:view==='taxi-dog'?<TaxiDogPage setMessage={setNotice} setError={setError} onSetup={go} canSetup={()=>true}/>:view==='deliveries'?<DeliveryPage key={deliveryRevision} setMessage={setNotice} setError={setError} onSetup={go} onOpenFinance={saleId=>{setDeliverySaleId(saleId);go('finance');}} publicSettings={<PublicDeliverySettings setMessage={setNotice} setError={setError} writable={qaPublicDeliverySettings.subscription_writable}/>} publicRequests={<PublicDeliveryInbox setMessage={setNotice} setError={setError} writable={qaPublicDeliverySettings.subscription_writable} isAdmin onChanged={()=>setDeliveryRevision(value=>value+1)}/>}/>:view==='crm'?<CrmPage setMessage={setNotice} setError={setError}/>:view==='finance'?<FinancePage setMessage={setNotice} setError={setError} initialSaleId={deliverySaleId}/>:view==='inventory'?<InventoryPage setMessage={setNotice} setError={setError}/>:view==='reports'?<ReportsPage setMessage={setNotice} setError={setError}/>:view==='waitlist'?<WaitlistPage setMessage={setNotice} setError={setError}/>:view==='team'?<TeamPage setMessage={setNotice} setError={setError} onSettingsSaved={()=>setSessionVersion(value=>value+1)}/>:view==='privacy'?<PrivacyPage setMessage={setNotice} setError={setError}/>:view==='support'?<SupportPage setMessage={setNotice} setError={setError}/>:<div className="panel"><p>Esta tela não faz parte da prévia local.</p><button type="button" className="ghost-btn" onClick={()=>go('overview')}>Voltar para Hoje</button></div>}
  </AppShell>;
}

const container=document.getElementById('root');
if(!container)throw Error('Contêiner da prévia local ausente.');
createRoot(container).render(<Harness/>);
