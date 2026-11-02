import {useEffect, useState, type ReactNode} from 'react';
import {BarChart3, Bell, Building2, CalendarClock, CalendarDays, ChevronDown, Home, LogOut, Menu, MoreHorizontal, Package, PawPrint, Scissors, Settings2, Star, Store, UserRound, UsersRound, Wallet, X} from 'lucide-react';
import {Brand} from './Brand';
import GlobalSearch from './GlobalSearch';
import type {Session} from './api';

export type MenuKey = 'overview'|'calendar'|'tutors'|'pets'|'professionals'|'services'|'waitlist'|'team'|'platform';
type Props = {session:Session;view:MenuKey;go:(view:MenuKey)=>void;onSearch:(view:MenuKey,query:string)=>void;company:(id:string)=>void;logout:()=>void;children:ReactNode};

export default function AppShell({session,view,go,onSearch,company,logout,children}:Props) {
  const [drawer,setDrawer] = useState(false);
  const {user,companies} = session;
  const can=(p?:string)=>!p||user.role==='admin'||user.permissions.includes(p);
  const role=user.role==='platform'?'Plataforma':user.role==='admin'?'Administrador':'Funcionário';
  const nav = [
    {key:'overview',label:'Visão geral',icon:Home,show:true},
    {key:'calendar',label:'Agenda',icon:CalendarDays,show:can('appointments')},
    {key:can('tutors')?'tutors':'pets',label:'Clientes e pets',icon:PawPrint,show:can('tutors')||can('pets')},
    {key:'professionals',label:'Profissionais',icon:UsersRound,show:can('professionals')},
    {key:'services',label:'Serviços',icon:Scissors,show:can('services')},
    {key:'waitlist',label:'Lista de espera',icon:CalendarClock,show:can('waitlist')}
  ];
  useEffect(()=>{if(!drawer)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setDrawer(false);};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[drawer]);
  function navigate(key:MenuKey){go(key);setDrawer(false);}
  function pending(){navigate('overview');setTimeout(()=>document.getElementById('pending-panel')?.scrollIntoView({behavior:'smooth',block:'center'}),100);}
  return <div className="app-shell">
    {drawer&&<button className="shade" onClick={()=>setDrawer(false)} aria-label="Fechar menu"/>}
    <aside className={`sidebar ${drawer?'open':''}`} aria-label="Navegação PetCore">
      <div className="sidebar-brand"><Brand inverse/><button className="close-menu" onClick={()=>setDrawer(false)} aria-label="Fechar menu"><X/></button></div>
      <nav aria-label="Menu principal">{user.role==='platform'?<button className="nav-item active" onClick={()=>navigate('platform')}><Building2 size={23}/>Empresas assinantes</button>:nav.filter(n=>n.show).map(n=><button key={n.key} className={`nav-item ${view===n.key||(n.label==='Clientes e pets'&&['tutors','pets'].includes(view))?'active':''}`} aria-current={view===n.key?'page':undefined} onClick={()=>navigate(n.key as MenuKey)}><n.icon size={23}/>{n.label}</button>)}</nav>
      {user.role!=='platform'&&<div className="sidebar-coming" aria-label="Módulos planejados"><span><Package size={23}/>Produtos e estoque<small>Em breve</small></span><span><Wallet size={23}/>Vendas e caixa<small>Em breve</small></span><span><BarChart3 size={23}/>Relatórios<small>Em breve</small></span></div>}
      <div className="sidebar-footer">{user.role!=='platform'&&can('team')&&<button className={`nav-item ${view==='team'?'active':''}`} onClick={()=>navigate('team')}><Settings2 size={23}/>Configurações</button>}{user.role!=='platform'&&<span className="nav-item planned"><Star size={23}/>Plano e assinatura<small>Em breve</small></span>}<button className="nav-item" onClick={logout}><LogOut size={23}/>Sair</button></div>
    </aside>
    <main className="main-content">
      <header className="topbar">
        <div className="mobile-brand"><Brand/></div>
        <div className="company-picker"><Store size={23}/>{companies.length>1?<select aria-label="Trocar de empresa" value={user.tenantId||''} onChange={e=>company(e.target.value)}><option value="" disabled>Escolha uma empresa</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>:<span>{user.companyName||(user.role==='platform'?'Administração':'Minha empresa')}</span>}<ChevronDown size={17}/></div>
        {user.role!=='platform'&&<GlobalSearch key={user.tenantId} can={can} onNavigate={(target,query)=>{setDrawer(false);onSearch(target,query);}}/>}
        <div className="top-actions">{user.role!=='platform'&&<button className="icon-button notification-button" aria-label="Ver pendências do dia" title="Ver pendências do dia" onClick={pending}><Bell size={23}/></button>}<details className="profile-menu"><summary><span className="avatar-small"><UserRound size={23}/></span><span className="profile-name"><strong>{user.name}</strong><small>{role}</small></span><ChevronDown size={15}/></summary><div className="profile-dropdown"><strong>{user.name}</strong><small>{role}</small><button onClick={logout}><LogOut size={16}/>Sair da conta</button></div></details><button className="icon-button mobile-menu-button" aria-label="Abrir menu" aria-expanded={drawer} onClick={()=>setDrawer(true)}><Menu size={24}/></button></div>
      </header>
      <div className="content-wrap">{children}</div>
    </main>
    {user.role!=='platform'&&<nav className="mobile-bottom-nav" aria-label="Navegação no celular"><button className={view==='overview'?'active':''} onClick={()=>navigate('overview')}><Home size={23}/><span>Hoje</span></button>{can('appointments')&&<button className={view==='calendar'?'active':''} onClick={()=>navigate('calendar')}><CalendarDays size={23}/><span>Agenda</span></button>}{(can('tutors')||can('pets'))&&<button className={view==='tutors'||view==='pets'?'active':''} onClick={()=>navigate(can('tutors')?'tutors':'pets')}><PawPrint size={23}/><span>Clientes</span></button>}<button onClick={()=>setDrawer(true)} aria-expanded={drawer}><MoreHorizontal size={25}/><span>Mais</span></button></nav>}
  </div>;
}
