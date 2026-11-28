import React, {useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PawPrint,UsersRound,AlertCircle,CheckCircle2,X} from 'lucide-react';
import {api,type Session} from './api';
import AuthScreen from './AuthScreen';
import Overview from './Overview';
import AppShell, {type MenuKey} from './AppShell';
import DataPage, {type Resource} from './DataPage';
import CalendarPage from './CalendarPage';
import WaitlistPage from './WaitlistPage';
import DeliveryPage from './DeliveryPage';
import DriverTrackingPage from './DriverTrackingPage';
import PublicTrackingPage from './PublicTrackingPage';
import {stopAllTracking} from './trackingCapture';
import PublicDeliveryPage from './PublicDeliveryPage';
import PublicDeliverySettings from './PublicDeliverySettings';
import PublicDeliveryInbox from './PublicDeliveryInbox';
import TeamPage from './TeamPage';
import PublicBookingPage from './PublicBookingPage';
import PublicBookingInbox from './PublicBookingInbox';
import TaxiDogPage from './TaxiDogPage';
import PlatformPage from './PlatformPage';
import CrmPage from './CrmPage';
import InventoryPage from './InventoryPage';
import FinancePage from './FinancePage';
import ReportsPage from './ReportsPage';
import PrivacyPage from './PrivacyPage';
import LegalScreen from './LegalScreen';
import {PlanOnboardingDialog,SubscriptionPage,SupportPage,TermsConsentDialog} from './CommercialPages';
import './styles/main.scss';
import {activateNativeAndroid,listenNativeBack} from './nativeAndroid';

activateNativeAndroid();

function App(){
 const[session,setSession]=useState<Session|null>(null),[checking,setChecking]=useState(true),[view,setView]=useState<MenuKey>('overview'),[drawer,setDrawer]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[searchQuery,setSearchQuery]=useState(''),[newBooking,setNewBooking]=useState(false);
 const [legalView,setLegalView]=useState<'privacy'|'terms'|null>(()=>location.pathname==='/privacy'?'privacy':location.pathname==='/terms'?'terms':null);
 const legalBack=useRef('/');
 const [supportTicketId,setSupportTicketId]=useState<string|null>(null);
 const [platformSupportRequest,setPlatformSupportRequest]=useState(0);
 const [newClient,setNewClient]=useState(false),[bookingPreset,setBookingPreset]=useState<{tutor_id:string;pet_id?:string}|undefined>(),[calendarRevision,setCalendarRevision]=useState(0);
 const [deliveryRevision,setDeliveryRevision]=useState(0),[financeSaleId,setFinanceSaleId]=useState<string>();
 function readLegal(kind:'privacy'|'terms'){legalBack.current=location.pathname+location.search;history.pushState(null,'',`/${kind}`);setLegalView(kind);}
 function closeLegal(){history.replaceState(null,'',legalBack.current);setLegalView(null);}
 function navigate(target:MenuKey){setView(target);setDrawer(false);setSearchQuery('');setNewBooking(false);setNewClient(false);setBookingPreset(undefined);setFinanceSaleId(undefined);setSupportTicketId(null);setError('');setMessage('');}
 function registerClient(){navigate('tutors');setNewClient(true);}
 function bookForClient(selection:{tutor_id:string;pet_id?:string}){navigate('calendar');setBookingPreset(selection);setNewBooking(true);}
 useEffect(()=>listenNativeBack(()=>{
  if(legalView){closeLegal();return true;}
  if(session&&session.user.role!=='platform'&&view!=='overview'){navigate('overview');return true;}
  return false;
 }),[legalView,session,view]);
 async function refresh(){try{
  let me=await api<Session>('/auth/me');
  const invite=new URLSearchParams(location.search).get('invite');
  if(invite&&!me.legal?.required){try{await api('/auth/invite/join','POST',{inviteToken:invite});history.replaceState(null,'','/');me=await api<Session>('/auth/me');}catch(cause){setError((cause as Error).message);}}
  const incoming=new URL(location.href),ticket=incoming.searchParams.get('support_ticket'),supportCompany=incoming.searchParams.get('support_company');
  if(ticket&&/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(ticket)&&!me.legal?.required){
   if(me.user.role!=='platform'&&supportCompany&&me.user.tenantId!==supportCompany){
    if(me.companies.some(company=>company.id===supportCompany)){await api('/auth/select-company','POST',{tenantId:supportCompany});me=await api<Session>('/auth/me');}
    else setError('Entre com a conta vinculada ao pet shop para acessar essa solicitação.');
   }
   setView(me.user.role==='platform'?'platform':'support');setSupportTicketId(ticket);
   if(me.user.role==='platform')setPlatformSupportRequest(value=>value+1);
   incoming.searchParams.delete('support_ticket');incoming.searchParams.delete('support_company');history.replaceState(null,'',incoming.pathname+incoming.search+incoming.hash);
  }
  setSession(me);
 }catch{setSession(null);}finally{setChecking(false);}}
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{const changed=()=>setLegalView(location.pathname==='/privacy'?'privacy':location.pathname==='/terms'?'terms':null);window.addEventListener('popstate',changed);return()=>window.removeEventListener('popstate',changed);},[]);
 async function company(id:string){try{await stopAllTracking();await api('/auth/select-company','POST',{tenantId:id});await refresh();navigate('overview');}catch(e){setError((e as Error).message);}}
 async function logout(){try{await stopAllTracking();await api('/auth/logout','POST');setSession(null);navigate('overview');}catch(e){setError((e as Error).message);}}
 useEffect(()=>{const user=session?.user;if(user?.role==='employee'&&user.permissions.includes('transport_driver')&&!user.permissions.some(p=>['appointments','taxi_dog','finance','tutors','pets','inventory','team','crm'].includes(p))&&view==='overview')setView('driver');},[session,view]);
 if(legalView)return <LegalScreen kind={legalView} onBack={closeLegal}/>;
 if(checking)return <div className="full-center"><PawPrint/><p>Conectando ao PetCore...</p></div>;
 if(!session)return <AuthScreen onDone={refresh} onReadLegal={readLegal}/>;
 const {user}=session;
 const permitted=(permission?:string)=>permission==='inventory'&&session.features?.retail===false?false:!permission||user.role==='admin'||user.permissions.includes(permission);
 const termsRequired=session.legal?.required===true;
 const needsPlan=user.role==='admin'&&Boolean(user.tenantId)&&Boolean(session.subscription)&&!session.subscription?.onboarding_completed_at;
 return <><AppShell session={session} view={view} go={navigate} onSearch={(target,query)=>{navigate(target);setSearchQuery(query);}} company={company} logout={logout} onOpenPlatformSupport={()=>{navigate('platform');setPlatformSupportRequest(value=>value+1);}}>
  {error&&<div className="alert danger" role="alert"><AlertCircle size={17}/>{error}<button onClick={()=>setError('')} aria-label="Dispensar">×</button></div>}{message&&<div className="alert success" role="status"><CheckCircle2 size={17}/>{message}<button onClick={()=>setMessage('')} aria-label="Dispensar">×</button></div>}
  {user.role!=='platform'&&session.subscription?.onboarding_completed_at&&!session.subscription.writable&&<div className="commercial-readonly-banner" role="status"><AlertCircle size={21}/><div><strong>Seu acesso está disponível para consulta.</strong><p>{user.role==='admin'?'Regularize a assinatura para voltar a cadastrar e alterar informações. Seus dados, suporte e solicitações de privacidade continuam disponíveis.':'Peça ao responsável pelo pet shop para conferir a assinatura. Seus dados continuam disponíveis para consulta.'}</p></div>{view!=='subscription'&&<button type="button" className="text-link" onClick={()=>navigate('subscription')}>Ver assinatura</button>}</div>}
  {searchQuery&&<div className="search-context">Resultados para “{searchQuery}”<button className="text-link" onClick={()=>setSearchQuery('')}><X size={14}/>Limpar busca</button></div>}
  {user.role==='platform'?<PlatformPage setError={setError} setMessage={setMessage} supportRequest={platformSupportRequest} initialTicketId={supportTicketId}/>:<>
   {view==='overview'&&<Overview key={user.tenantId} go={navigate} can={permitted} isAdmin={user.role==='admin'} onRegisterClient={registerClient} onNew={()=>{navigate('calendar');setNewBooking(true);}}/>}
   {(view==='tutors'||view==='pets')&&<div className="resource-tabs" aria-label="Cadastros">{permitted('tutors')&&<button className={view==='tutors'?'selected':''} onClick={()=>navigate('tutors')}><UsersRound size={17}/>Clientes</button>}{permitted('pets')&&<button className={view==='pets'?'selected':''} onClick={()=>navigate('pets')}><PawPrint size={17}/>Pets</button>}</div>}
   {(['tutors','pets','professionals','services'] as MenuKey[]).includes(view)&&permitted(view)&&<DataPage key={view+'-'+user.tenantId+'-'+searchQuery} resource={view as Resource} initialSearch={searchQuery} initialNew={newClient} onFormOpened={()=>setNewClient(false)} onBook={permitted('appointments')?bookForClient:undefined} currentUser={{id:user.id,name:user.name}} setMessage={setMessage} setError={setError} canSetup={permitted} onSetup={navigate}/>}
   {view==='calendar'&&permitted('appointments')&&<>{(user.role==='admin'||user.permissions.includes('agenda:all'))&&<PublicBookingInbox key={'inbox-'+user.tenantId} setMessage={setMessage} setError={setError} writable={session.subscription?.writable===true} onChanged={()=>setCalendarRevision(value=>value+1)}/>}<CalendarPage key={user.tenantId+'-'+calendarRevision} initialNew={newBooking} initialSelection={bookingPreset} searchQuery={searchQuery} setMessage={setMessage} setError={setError} canSetup={permitted} canTaxiDog={session.features?.taxi_dog===true&&permitted('taxi_dog')} onSetup={navigate} onSaved={()=>{setSearchQuery('');setNewBooking(false);setBookingPreset(undefined);}}/></>}
   {view==='driver'&&session.features?.tracking===true&&permitted('transport_driver')&&<DriverTrackingPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='taxi-dog'&&permitted('taxi_dog')&&<TaxiDogPage key={user.tenantId} setMessage={setMessage} setError={setError} canSetup={permitted} onSetup={navigate} canTracking={session.features?.tracking===true}/>}
   {view==='waitlist'&&permitted('waitlist')&&<WaitlistPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='deliveries'&&session.features?.delivery===true&&permitted('finance')&&<DeliveryPage key={user.tenantId+'-'+deliveryRevision} setMessage={setMessage} setError={setError} canTracking={session.features?.tracking===true} onSetup={navigate} onOpenFinance={id=>{navigate('finance');setFinanceSaleId(id);}} publicSettings={user.role==='admin'?<PublicDeliverySettings setMessage={setMessage} setError={setError} writable={session.subscription?.writable===true}/>:undefined} publicRequests={<PublicDeliveryInbox setMessage={setMessage} setError={setError} writable={session.subscription?.writable===true} isAdmin={user.role==='admin'} onChanged={()=>setDeliveryRevision(value=>value+1)}/>}/>}
   {view==='crm'&&permitted('crm')&&<CrmPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='inventory'&&permitted('inventory')&&<InventoryPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='finance'&&permitted('finance')&&<FinancePage key={user.tenantId} initialSaleId={financeSaleId} setMessage={setMessage} setError={setError}/>}
   {view==='reports'&&permitted('finance')&&<ReportsPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='privacy'&&user.role==='admin'&&<PrivacyPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='subscription'&&<SubscriptionPage key={user.tenantId} setMessage={setMessage} setError={setError} onOpenSupport={id=>{navigate('support');setSupportTicketId(id);}}/>}
   {view==='support'&&<SupportPage key={user.tenantId} setMessage={setMessage} setError={setError} initialTicketId={supportTicketId}/>}
   {view==='team'&&permitted('team')&&<TeamPage key={user.tenantId} isAdmin={user.role==='admin'} setMessage={setMessage} setError={setError} onSettingsSaved={refresh}/>}
  </>}
 </AppShell>{termsRequired?<TermsConsentDialog version={session.legal!.version} onAccepted={()=>void refresh()} onRead={readLegal} onLogout={()=>void logout()}/>:needsPlan?<PlanOnboardingDialog onDone={async(plan)=>{await refresh();navigate(plan&&plan!=='free'?'subscription':'overview');}} onLogout={()=>void logout()}/>:null}</>;
}

const publicBookingToken=/^\/agendar\/([a-f0-9]{48})\/?$/.exec(location.pathname)?.[1];
const publicDeliveryToken=/^\/loja\/([a-f0-9]{48})\/?$/.exec(location.pathname)?.[1];
const publicTrackingToken=/^\/acompanhar\/([a-f0-9]{48})\/?$/.exec(location.pathname)?.[1];
createRoot(document.getElementById('root')!).render(<React.StrictMode>{publicTrackingToken?<PublicTrackingPage token={publicTrackingToken}/>:publicBookingToken?<PublicBookingPage token={publicBookingToken}/>:publicDeliveryToken?<PublicDeliveryPage token={publicDeliveryToken}/>:<App/>}</React.StrictMode>);
