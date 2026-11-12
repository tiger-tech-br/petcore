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
import TeamPage from './TeamPage';
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
 function readLegal(kind:'privacy'|'terms'){legalBack.current=location.pathname+location.search;history.pushState(null,'',`/${kind}`);setLegalView(kind);}
 function closeLegal(){history.replaceState(null,'',legalBack.current);setLegalView(null);}
 function navigate(target:MenuKey){setView(target);setDrawer(false);setSearchQuery('');setNewBooking(false);setSupportTicketId(null);setError('');setMessage('');}
 useEffect(()=>listenNativeBack(()=>{
  if(legalView){closeLegal();return true;}
  if(session&&session.user.role!=='platform'&&view!=='overview'){navigate('overview');return true;}
  return false;
 }),[legalView,session,view]);
 async function refresh(){try{
  let me=await api<Session>('/auth/me');
  const invite=new URLSearchParams(location.search).get('invite');
  if(invite&&!me.legal?.required){try{await api('/auth/invite/join','POST',{inviteToken:invite});history.replaceState(null,'','/');me=await api<Session>('/auth/me');}catch(cause){setError((cause as Error).message);}}
  setSession(me);
 }catch{setSession(null);}finally{setChecking(false);}}
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{const changed=()=>setLegalView(location.pathname==='/privacy'?'privacy':location.pathname==='/terms'?'terms':null);window.addEventListener('popstate',changed);return()=>window.removeEventListener('popstate',changed);},[]);
 async function company(id:string){try{await api('/auth/select-company','POST',{tenantId:id});await refresh();navigate('overview');}catch(e){setError((e as Error).message);}}
 async function logout(){try{await api('/auth/logout','POST');setSession(null);navigate('overview');}catch(e){setError((e as Error).message);}}
 if(legalView)return <LegalScreen kind={legalView} onBack={closeLegal}/>;
 if(checking)return <div className="full-center"><PawPrint/><p>Conectando ao PetCore...</p></div>;
 if(!session)return <AuthScreen onDone={refresh} onReadLegal={readLegal}/>;
 const {user}=session;
 const permitted=(permission?:string)=>!permission||user.role==='admin'||user.permissions.includes(permission);
 const termsRequired=session.legal?.required===true;
 const needsPlan=user.role==='admin'&&Boolean(user.tenantId)&&Boolean(session.subscription)&&!session.subscription?.onboarding_completed_at;
 return <><AppShell session={session} view={view} go={navigate} onSearch={(target,query)=>{navigate(target);setSearchQuery(query);}} company={company} logout={logout}>
  {error&&<div className="alert danger" role="alert"><AlertCircle size={17}/>{error}<button onClick={()=>setError('')} aria-label="Dispensar">×</button></div>}{message&&<div className="alert success" role="status"><CheckCircle2 size={17}/>{message}<button onClick={()=>setMessage('')} aria-label="Dispensar">×</button></div>}
  {user.role!=='platform'&&session.subscription?.onboarding_completed_at&&!session.subscription.writable&&<div className="commercial-readonly-banner" role="status"><AlertCircle size={21}/><div><strong>Seu acesso está disponível para consulta.</strong><p>{user.role==='admin'?'Regularize a assinatura para voltar a cadastrar e alterar informações. Seus dados, suporte e solicitações de privacidade continuam disponíveis.':'Peça ao responsável pelo pet shop para conferir a assinatura. Seus dados continuam disponíveis para consulta.'}</p></div>{view!=='subscription'&&<button type="button" className="text-link" onClick={()=>navigate('subscription')}>Ver assinatura</button>}</div>}
  {searchQuery&&<div className="search-context">Resultados para “{searchQuery}”<button className="text-link" onClick={()=>setSearchQuery('')}><X size={14}/>Limpar busca</button></div>}
  {user.role==='platform'?<PlatformPage setError={setError} setMessage={setMessage}/>:<>
   {view==='overview'&&<Overview key={user.tenantId} go={navigate} can={permitted} isAdmin={user.role==='admin'} onNew={()=>{navigate('calendar');setNewBooking(true);}}/>}
   {(view==='tutors'||view==='pets')&&<div className="resource-tabs" aria-label="Cadastros">{permitted('tutors')&&<button className={view==='tutors'?'selected':''} onClick={()=>navigate('tutors')}><UsersRound size={17}/>Clientes</button>}{permitted('pets')&&<button className={view==='pets'?'selected':''} onClick={()=>navigate('pets')}><PawPrint size={17}/>Pets</button>}</div>}
   {(['tutors','pets','professionals','services'] as MenuKey[]).includes(view)&&permitted(view)&&<DataPage key={view+'-'+user.tenantId+'-'+searchQuery} resource={view as Resource} initialSearch={searchQuery} setMessage={setMessage} setError={setError} canSetup={permitted} onSetup={navigate}/>}
   {view==='calendar'&&permitted('appointments')&&<CalendarPage key={user.tenantId} initialNew={newBooking} searchQuery={searchQuery} setMessage={setMessage} setError={setError} canSetup={permitted} canTaxiDog={permitted('taxi_dog')} onSetup={navigate} onSaved={()=>{setSearchQuery('');setNewBooking(false);}}/>}
   {view==='taxi-dog'&&permitted('taxi_dog')&&<TaxiDogPage key={user.tenantId} setMessage={setMessage} setError={setError} canSetup={permitted} onSetup={navigate}/>}
   {view==='waitlist'&&permitted('waitlist')&&<WaitlistPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='crm'&&permitted('crm')&&<CrmPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='inventory'&&permitted('inventory')&&<InventoryPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='finance'&&permitted('finance')&&<FinancePage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='reports'&&permitted('finance')&&<ReportsPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='privacy'&&user.role==='admin'&&<PrivacyPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='subscription'&&<SubscriptionPage key={user.tenantId} setMessage={setMessage} setError={setError} onOpenSupport={id=>{navigate('support');setSupportTicketId(id);}}/>}
   {view==='support'&&<SupportPage key={user.tenantId} setMessage={setMessage} setError={setError} initialTicketId={supportTicketId}/>}
   {view==='team'&&permitted('team')&&<TeamPage key={user.tenantId} setMessage={setMessage} setError={setError} onSettingsSaved={refresh}/>}
  </>}
 </AppShell>{termsRequired?<TermsConsentDialog version={session.legal!.version} onAccepted={()=>void refresh()} onRead={readLegal} onLogout={()=>void logout()}/>:needsPlan?<PlanOnboardingDialog onDone={async(plan)=>{await refresh();navigate(plan&&plan!=='free'?'subscription':'overview');}} onLogout={()=>void logout()}/>:null}</>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
