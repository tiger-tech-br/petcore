// Development-only harness. Uses the real components/styles and never an API server.
// Vite's production entry remains index.html; this file is not imported by production.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import AppShell, {type MenuKey} from '../src/AppShell';
import AuthScreen from '../src/AuthScreen';
import CalendarPage from '../src/CalendarPage';
import {today, type Session} from '../src/api';
import '../src/styles/main.scss';

document.documentElement.dataset.petcoreNative='android';
document.documentElement.dataset.petcoreQa='fictitious-local';

const ids={company:'10000000-0000-4000-8000-000000000001',user:'10000000-0000-4000-8000-000000000002',tutorA:'10000000-0000-4000-8000-000000000003',tutorB:'10000000-0000-4000-8000-000000000004',petA:'10000000-0000-4000-8000-000000000005',petB:'10000000-0000-4000-8000-000000000006',professionalA:'10000000-0000-4000-8000-000000000007',professionalB:'10000000-0000-4000-8000-000000000008',serviceA:'10000000-0000-4000-8000-000000000009',serviceB:'10000000-0000-4000-8000-000000000010'};
const tutors=[{id:ids.tutorA,name:'Ana Exemplo',phone:'',email:'ana@example.test'},{id:ids.tutorB,name:'Bruno Exemplo',phone:'',email:'bruno@example.test'}];
const pets=[{id:ids.petA,tutor_id:ids.tutorA,name:'Luna',tutor_name:'Ana Exemplo',species:'Cão'},{id:ids.petB,tutor_id:ids.tutorB,name:'Thor',tutor_name:'Bruno Exemplo',species:'Cão'}];
const professionals=[{id:ids.professionalA,name:'Juliana Exemplo'},{id:ids.professionalB,name:'Rafael Exemplo'}];
const services=[{id:ids.serviceA,name:'Banho',price_cents:3500,duration_minutes:30},{id:ids.serviceB,name:'Tosa higiênica',price_cents:2000,duration_minutes:30}];
const options={tutors,pets,professionals,services};
const session:Session={user:{id:ids.user,name:'Marina Exemplo',role:'admin',tenantId:ids.company,companyName:'Vila Pet • demonstração',scopeProfessionalId:null,permissions:[]},companies:[{id:ids.company,name:'Vila Pet • demonstração',role:'admin'}],legal:{required:false,version:'qa-unpublished'},subscription:{writable:true,access_until:null,trial_ends_at:null,paid_through:null,status:'trial',onboarding_completed_at:'2026-11-09T12:00:00Z',trial_started_at:'2026-11-09T12:00:00Z',onboarding_plan:'free',trial_days:30}};

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
  // Deliberately no billing, real e-mail, legal acceptance or fallback to a server.
  return reply({error:`QA local: rota simulada indisponível (${method} ${path}). Nenhum servidor foi acessado.`},501);
}) as typeof fetch;

function localScreen(screen:'login'|'agenda'|'form'){
  const next=new URL(location.href);next.search='';next.searchParams.set('screen',screen);location.assign(next.href);
}
function Harness(){
  const requested=new URLSearchParams(location.search).get('screen')||'login';
  const [view,setView]=useState<MenuKey>('calendar'),[search,setSearch]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
  if(requested==='login')return <AuthScreen onDone={()=>localScreen('agenda')} onReadLegal={()=>setNotice('Documentos não publicados nesta prévia local.')}/>;
  return <AppShell session={session} view={view} go={target=>{setView(target==='overview'?'overview':'calendar');setSearch('');}} onSearch={(_target,query)=>{setView('calendar');setSearch(query);}} company={()=>{}} logout={()=>localScreen('login')}>
    {error&&<div className="alert error" role="alert">{error}</div>}
    {notice&&<div className="alert success" role="status">{notice}</div>}
    <CalendarPage setMessage={setNotice} setError={setError} initialNew={requested==='form'} searchQuery={search} onSaved={()=>setSearch('')}/>
  </AppShell>;
}

const container=document.getElementById('root');
if(!container)throw Error('Contêiner da prévia local ausente.');
createRoot(container).render(<Harness/>);
