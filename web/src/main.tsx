import React, {useEffect,useState} from 'react';
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
import PlatformPage from './PlatformPage';
import './styles/main.scss';

function App(){
 const[session,setSession]=useState<Session|null>(null),[checking,setChecking]=useState(true),[view,setView]=useState<MenuKey>('overview'),[drawer,setDrawer]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[searchQuery,setSearchQuery]=useState(''),[newBooking,setNewBooking]=useState(false);
 function navigate(target:MenuKey){setView(target);setDrawer(false);setSearchQuery('');setNewBooking(false);setError('');setMessage('');}
 async function refresh(){try{
  let me=await api<Session>('/auth/me');
  const invite=new URLSearchParams(location.search).get('invite');
  if(invite){await api('/auth/invite/join','POST',{inviteToken:invite});history.replaceState(null,'','/');me=await api<Session>('/auth/me');}
  setSession(me);
 }catch{setSession(null);}finally{setChecking(false);}}
 useEffect(()=>{void refresh();},[]);
 async function company(id:string){try{await api('/auth/select-company','POST',{tenantId:id});await refresh();navigate('overview');}catch(e){setError((e as Error).message);}}
 async function logout(){try{await api('/auth/logout','POST');setSession(null);navigate('overview');}catch(e){setError((e as Error).message);}}
 if(checking)return <div className="full-center"><PawPrint/><p>Conectando ao PetCore...</p></div>;
 if(!session)return <AuthScreen onDone={refresh}/>;
 const {user}=session;
 const permitted=(permission?:string)=>!permission||user.role==='admin'||user.permissions.includes(permission);
 return <AppShell session={session} view={view} go={navigate} onSearch={(target,query)=>{navigate(target);setSearchQuery(query);}} company={company} logout={logout}>
  {error&&<div className="alert danger" role="alert"><AlertCircle size={17}/>{error}<button onClick={()=>setError('')} aria-label="Dispensar">×</button></div>}{message&&<div className="alert success" role="status"><CheckCircle2 size={17}/>{message}<button onClick={()=>setMessage('')} aria-label="Dispensar">×</button></div>}
  {searchQuery&&<div className="search-context">Resultados para “{searchQuery}”<button className="text-link" onClick={()=>setSearchQuery('')}><X size={14}/>Limpar busca</button></div>}
  {user.role==='platform'?<PlatformPage setError={setError} setMessage={setMessage}/>:<>
   {view==='overview'&&<Overview key={user.tenantId} go={navigate} can={permitted} onNew={()=>{navigate('calendar');setNewBooking(true);}}/>}
   {(view==='tutors'||view==='pets')&&<div className="resource-tabs" aria-label="Cadastros">{permitted('tutors')&&<button className={view==='tutors'?'selected':''} onClick={()=>navigate('tutors')}><UsersRound size={17}/>Clientes</button>}{permitted('pets')&&<button className={view==='pets'?'selected':''} onClick={()=>navigate('pets')}><PawPrint size={17}/>Pets</button>}</div>}
   {(['tutors','pets','professionals','services'] as MenuKey[]).includes(view)&&<DataPage key={view+'-'+user.tenantId+'-'+searchQuery} resource={view as Resource} initialSearch={searchQuery} setMessage={setMessage} setError={setError}/>}
   {view==='calendar'&&<CalendarPage key={user.tenantId+'-'+searchQuery} initialNew={newBooking} searchQuery={searchQuery} setMessage={setMessage} setError={setError}/>}
   {view==='waitlist'&&<WaitlistPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
   {view==='team'&&<TeamPage key={user.tenantId} setMessage={setMessage} setError={setError}/>}
  </>}
 </AppShell>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
