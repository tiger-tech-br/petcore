// Dev-only fixtures: no real GPS, accounts, messages or provider API credentials.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import AppShell,{type MenuKey} from '../src/AppShell';
import DriverTrackingPage from '../src/DriverTrackingPage';
import PublicTrackingPage from '../src/PublicTrackingPage';
import TrackingPanel from '../src/TrackingPanel';
import TransportSettingsPanel from '../src/TransportSettingsPanel';
import type {Session} from '../src/api';
import type {TransportJob,TransportSettings} from '../src/trackingTypes';
import '../src/styles/main.scss';

if(!import.meta.env.DEV)throw Error('A prévia de localização existe somente no desenvolvimento local.');
const params=new URLSearchParams(location.search),screen=params.get('screen')??'driver',scenario=params.get('state')??'live';
if(params.get('mode')==='android')document.documentElement.dataset.petcoreNative='android';
const ids={user:'b1111111-1111-4111-8111-111111111111',company:'b2222222-2222-4222-8222-222222222222',driver:'b3333333-3333-4333-8333-333333333333',delivery:'b4444444-4444-4444-8444-444444444444',taxi:'b5555555-5555-4555-8555-555555555555',session:'b6666666-6666-4666-8666-666666666666'};
const publicToken='c'.repeat(48);
const settings:TransportSettings={tracking_enabled:true,shop_address:'Rua da Demonstração, 100 · Vila Pet fictícia',shop_latitude:-23.551,shop_longitude:-46.631};
const drivers=[{id:ids.driver,name:'Motorista de demonstração com sobrenome comprido',phone:'11900000000',active:true,user_id:ids.user}];
let publicEnded=scenario==='ended',sharing=params.get('capture')==='active';
function point(){const stamp=new Date(Date.now()-(scenario==='stale'?180000:5000)).toISOString();return scenario==='waiting'?null:{latitude:-23.5505,longitude:-46.6333,accuracy:18,captured_at:stamp,received_at:stamp};}
function tracking(){return{active:!publicEnded,session_id:publicEnded?undefined:ids.session,expires_at:new Date(Date.now()+45*60000).toISOString(),status:(publicEnded?'ended':scenario==='waiting'?'waiting':scenario==='stale'?'stale':'live') as 'ended'|'waiting'|'stale'|'live',position:publicEnded?null:point()};}
const jobs:TransportJob[]=[{kind:'delivery',id:ids.delivery,label:'Entrega de demonstração · ração e acessórios',status:'out_for_delivery',driver_id:ids.driver,driver_name:drivers[0].name,address:'Avenida dos Exemplos, 500, apartamento 123 · bairro fictício',reference:'Cadastro fictício para conferir o tamanho dos textos.',destination:{address:'Avenida dos Exemplos, 500, apartamento 123 · bairro fictício',latitude:null,longitude:null},tracking:tracking(),can_start:true,next_status:'delivered',next_label:'Marcar como entregue'},
 {kind:'taxi',id:ids.taxi,label:'Pet Luna · busca de demonstração',status:'scheduled',driver_id:ids.driver,driver_name:drivers[0].name,address:'Rua do Exemplo, 200 · bairro de demonstração',reference:'Portão azul. Não corresponde a uma entrega real.',destination:{address:'Rua do Exemplo, 200 · bairro de demonstração',latitude:null,longitude:null},tracking:{active:false,status:'waiting',position:null},can_start:false,next_status:'en_route',next_label:'Iniciar caminho da busca'}];

// A simulated native status lets the activity bar be checked without a sensor.
if(params.get('capture')==='active'){
 Object.defineProperty(navigator,'userAgent',{configurable:true,value:navigator.userAgent+' PetCoreAndroid/QA'});
 const bridge:{postMessage:(message:string)=>void;onmessage?:((event:{data:string})=>void)|null}={postMessage(message){const value=JSON.parse(message);if(value.type==='stop'){sharing=false;publicEnded=true;}queueMicrotask(()=>bridge.onmessage?.({data:JSON.stringify({state:sharing?'tracking':'stopped',...(sharing?{session_id:ids.session,last_upload_at:new Date().toISOString()}:{})})}));}};
 Object.assign(window,{PetCoreTracking:bridge});
}
// Any accidental sensor call fails locally; this fixture never asks permission.
Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(){throw Error('O GPS real está desativado nesta prévia.');},clearWatch(){},getCurrentPosition(){throw Error('O GPS real está desativado nesta prévia.');}}});
Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{}});
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
window.fetch=async(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.origin),path=url.pathname.replace(/^\/api/,''),method=init?.method??'GET';
 const body=typeof init?.body==='string'?JSON.parse(init.body):{};
 if(path==='/transport/my-jobs')return reply({items:scenario==='empty'?[]:jobs.map(job=>({...job,tracking:job.kind==='delivery'?tracking():job.tracking})),timezone:'America/Sao_Paulo'});
 if(path==='/transport/settings')return reply(method==='PUT'?Object.assign(settings,body):settings);
 if(path==='/transport/options')return reply({settings,drivers,users:[{id:ids.user,name:'Motorista de demonstração',email:'motorista@example.test'}]});
 if(path==='/transport/drivers'&&method==='GET')return reply({items:drivers});
 if(path==='/transport/drivers'&&method==='POST'){const driver={id:crypto.randomUUID(),name:body.name,phone:body.phone,active:body.active,user_id:null as string|null};drivers.push(driver as typeof drivers[number]);return reply(driver,201);}
 if(/^\/transport\/drivers\/[^/]+\/account$/.test(path)){const driver=drivers.find(item=>item.id===path.split('/')[3]);if(driver)driver.user_id=body.user_id;return reply({ok:true});}
 if(/^\/transport\/drivers\/[^/]+$/.test(path)&&method==='PATCH'){const driver=drivers.find(item=>item.id===path.split('/')[3]);if(driver)Object.assign(driver,body);return reply(driver);}
 if(/^\/transport\/deliveries\/[^/]+\/driver$/.test(path)){jobs[0].driver_id=body.driver_id;jobs[0].driver_name=drivers.find(driver=>driver.id===body.driver_id)?.name??null;publicEnded=true;sharing=false;return reply({ok:true});}
 if(/^\/transport\/jobs\/(taxi|delivery)\/[^/]+\/status$/.test(path)){const job=jobs.find(item=>item.id===path.split('/')[4]);if(!job)return reply({error:'Viagem fictícia não encontrada.'},404);job.status=body.status;job.can_start=['out_for_delivery','en_route','with_pet'].includes(job.status);if(['delivered','completed'].includes(job.status)){publicEnded=true;sharing=false;job.next_status=undefined;job.next_label=undefined;}return reply(job);}
 if(/^\/transport\/jobs\/(taxi|delivery)\/[^/]+\/start$/.test(path))return reply({error:'Prévia local: a captura real do GPS está desligada. Os dados do mapa são fictícios.'},422);
 if(/^\/transport\/jobs\/(taxi|delivery)\/[^/]+$/.test(path)){const job=jobs.find(item=>item.id===path.split('/')[4]);return job?reply({...job,tracking:job.kind==='delivery'?tracking():job.tracking}):reply({error:'Viagem fictícia não encontrada.'},404);}
 if(/^\/transport\/tracking\/[^/]+\/share$/.test(path))return reply({token:publicToken,path:'/acompanhar/'+publicToken,link:'https://petcore.example.test/acompanhar/'+publicToken,expires_at:new Date(Date.now()+45*60000).toISOString()});
 if(/^\/transport\/tracking\/[^/]+\/stop$/.test(path)){sharing=false;publicEnded=true;return reply({ok:true});}
 if(path==='/public/tracking/'+publicToken)return publicEnded?reply({error:'Acompanhamento encerrado.'},410):reply({status:tracking().status,position:point(),updated_at:point()?.received_at??null,expires_at:new Date(Date.now()+45*60000).toISOString()});
 if(path.includes('/notifications'))return reply({items:[],unreadCount:0});
 return reply({error:'Rota não simulada na prévia local.'},404);
};

function Fixture(){
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[panel,setPanel]=useState(true),[view,setView]=useState<MenuKey>('driver');
 const session:Session={user:{id:ids.user,name:'Motorista de demonstração',role:screen==='driver'?'employee':'admin',tenantId:ids.company,companyName:'Vila Pet · prévia local',scopeProfessionalId:null,permissions:['transport_driver']},companies:[{id:ids.company,name:'Vila Pet · prévia local',role:'admin'}],features:{tracking:true,delivery:true,taxi_dog:true,retail:true,operation_mode:'complete'}};
 if(screen==='public')return <PublicTrackingPage token={publicToken}/>;
 return <AppShell session={session} view={view} go={setView} onSearch={()=>{}} company={()=>{}} logout={()=>setMessage('Prévia local: nenhum login real.')}>
  {message&&<div className="alert success" role="status">{message}</div>}{error&&<div className="alert danger" role="alert">{error}<button onClick={()=>setError('')} aria-label="Dispensar">×</button></div>}
  {screen==='settings'?<TransportSettingsPanel setMessage={setMessage} setError={setError}/>:screen==='panel'?<section className="panel" style={{padding:24}}><h1>Acompanhamento de demonstração</h1><p>Dados fictícios. A captura real do GPS está desligada.</p><button className="primary-btn" onClick={()=>setPanel(true)}>Abrir acompanhamento</button>{panel&&<TrackingPanel kind="delivery" jobId={ids.delivery} canAssign onClose={()=>setPanel(false)} setMessage={setMessage} setError={setError}/>}</section>:<DriverTrackingPage setMessage={setMessage} setError={setError}/>}
 </AppShell>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
