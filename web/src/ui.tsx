import type {ReactNode} from 'react';
import {PawPrint} from 'lucide-react';

const statusLabels:Record<string,string>={pending:'Aguardando confirmação',confirmed:'Confirmado',in_progress:'Em atendimento',done:'Concluído',cancelled:'Cancelado',no_show:'Cliente faltou'};

export function PageHeader({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:ReactNode}) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

export function Empty({label}:{label:string}) {
  return <div className="empty"><PawPrint size={31}/><p>{label}</p></div>;
}

export function Status({status}:{status:string}) {
  return <span className={`status ${status}`}>{statusLabels[status]||status}</span>;
}
