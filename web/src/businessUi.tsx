import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowDownLeft,ArrowUpRight,ChevronLeft,ChevronRight,RefreshCw,Wallet} from 'lucide-react';
import {api,money,today} from './api';
import {Empty} from './ui';
import {saveTextFile} from './nativeAndroid';

export type BusinessPageProps={setMessage:(value:string)=>void;setError:(value:string)=>void};
export type PageResult<T>={items:T[];total:number;page:number;pageSize:number};
export type Period={from:string;to:string};
export const reasonText=(cause:unknown)=>cause instanceof Error?cause.message:'Não foi possível concluir a operação.';
export const requestKey=()=>crypto.randomUUID();
export function useBusinessCommand(){
  const intent=useRef<{fingerprint:string;key:string}|null>(null);
  const reset=()=>{intent.current=null;};
  async function send<T=any>(path:string,body:Record<string,unknown>,method='POST'):Promise<T>{
    const fingerprint=path+JSON.stringify(body);
    if(!intent.current||intent.current.fingerprint!==fingerprint)intent.current={fingerprint,key:requestKey()};
    return api<T>(path,method,{...body,idempotency_key:intent.current.key});
  }
  return {send,reset};
}
export function currentPeriod():Period {const to=today();return {from:to.slice(0,7)+'-01',to};}
export function parseCents(raw:string):number {
  let value=raw.trim().replace(/^R\$\s*/,'').replace(/\s/g,'');
  if(value.includes(','))value=value.replace(/\./g,'').replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw Error('Informe um valor válido, com até duas casas decimais.');
  const [whole,fraction='']=value.split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(cents)||cents>999999999)throw Error('O valor informado ultrapassa o limite permitido.');
  return cents;
}
export function centsInput(value:number){return `${Math.trunc(value/100)},${String(Math.abs(value%100)).padStart(2,'0')}`;}
export function integerValue(raw:string,minimum=0,maximum=1000000) {
  if(!/^\d+$/.test(raw.trim()))throw Error('Informe uma quantidade inteira.');
  const value=Number(raw);if(!Number.isSafeInteger(value)||value<minimum||value>maximum)throw Error(`A quantidade deve ficar entre ${minimum} e ${maximum}.`);return value;
}
export function businessDate(value:string|null|undefined,zone='America/Sao_Paulo',withTime=false){
  if(!value)return 'Não informado';
  const date=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00Z'):new Date(value);
  return new Intl.DateTimeFormat('pt-BR',{timeZone:zone,dateStyle:'short',...(withTime?{timeStyle:'short' as const}:{})}).format(date);
}
export function useBusinessQuery<T>(path:string|null,onError:(value:string)=>void) {
  const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(Boolean(path)),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{if(!path)return;let active=true;setLoading(true);setError('');
    api<T>(path).then(response=>{if(active)setData(response);}).catch(cause=>{if(active){const text=reasonText(cause);setError(text);onError(text);}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[path,revision,onError]);
  return {data,loading,error,refresh};
}
export function BusinessState({loading,error,empty,retry,children}:{loading:boolean;error:string;empty?:string;retry:()=>void;children:ReactNode}) {
  if(loading)return <Empty label="Carregando informações..."/>;
  if(error)return <div className="business-retry"><p>{error}</p><button className="ghost-btn" onClick={retry}><RefreshCw size={16}/>Tentar novamente</button></div>;
  if(empty)return <Empty label={empty}/>;
  return <>{children}</>;
}
export function BusinessPagination({page,pageSize,total,busy=false,onPage}:{page:number;pageSize:number;total:number;busy?:boolean;onPage:(value:number)=>void}) {
  const pages=Math.max(1,Math.ceil(total/pageSize));
  return <div className="business-pagination"><span>{total?`${(page-1)*pageSize+1}–${Math.min(page*pageSize,total)} de ${total}`:'Nenhum registro'}</span><div><button className="ghost-btn" disabled={busy||page<=1} aria-label="Página anterior" onClick={()=>onPage(page-1)}><ChevronLeft size={17}/></button><span>Página {page} de {pages}</span><button className="ghost-btn" disabled={busy||page>=pages} aria-label="Próxima página" onClick={()=>onPage(page+1)}><ChevronRight size={17}/></button></div></div>;
}
export function PeriodFilter({period,onApply}:{period:Period;onApply:(period:Period)=>void}) {
  const [from,setFrom]=useState(period.from),[to,setTo]=useState(period.to),[error,setError]=useState('');
  return <form className="business-period" onSubmit={event=>{event.preventDefault();const days=(Date.parse(to)-Date.parse(from))/86400000;if(!Number.isFinite(days)||days<0||days>365){setError('Selecione um período de até 366 dias, com o início antes do fim.');return;}setError('');onApply({from,to});}}><label>De<input type="date" required value={from} onChange={event=>setFrom(event.target.value)}/></label><label>Até<input type="date" required value={to} onChange={event=>setTo(event.target.value)}/></label><button type="submit" className="ghost-btn">Aplicar período</button>{error&&<p role="alert">{error}</p>}</form>;
}
export function BusinessMetric({label,value,help,tone='teal',kind='money'}:{label:string;value:number|undefined;help?:string;tone?:'teal'|'red'|'amber'|'blue';kind?:'money'|'count'}) {
  const Icon=tone==='red'?ArrowUpRight:tone==='teal'?ArrowDownLeft:Wallet;
  return <article className={`business-metric business-metric--${tone}`}><span className="business-metric-icon"><Icon size={22}/></span><div><span>{label}</span><strong>{value===undefined?'—':kind==='money'?money(value):value}</strong>{help&&<small>{help}</small>}</div></article>;
}
export type DailyValue={date:string;received_cents:number;expenses_cents:number;refunded_cents?:number};
export function CashflowChart({daily}:{daily:DailyValue[]}) {
  const [expanded,setExpanded]=useState(false);
  if(!daily.length)return <Empty label="Nenhuma movimentação no período selecionado."/>;
  const max=Math.max(1,...daily.flatMap(day=>[day.received_cents,day.expenses_cents+(day.refunded_cents??0)]));
  const plotWidth=620,plotHeight=150,step=plotWidth/daily.length,bar=Math.min(24,Math.max(2,step*.29));
  return <div className="business-chart"><div className="business-chart-legend"><span><i/>Entradas registradas</span><span><i/>Saídas e estornos</span></div><svg className="business-chart-svg" viewBox="0 0 720 216" role="img" aria-label="Comparação diária de entradas com saídas e estornos. Consulte também a tabela de valores abaixo."><line x1="62" y1="170" x2="694" y2="170" stroke="#dce9ef"/>{[0,.5,1].map(ratio=><g key={ratio}><line x1="62" y1={170-ratio*plotHeight} x2="694" y2={170-ratio*plotHeight} stroke="#edf2f6"/><text x="54" y={174-ratio*plotHeight} textAnchor="end" fill="#7e8da6" fontSize="10">{money(Math.round(max*ratio))}</text></g>)}{daily.map((day,index)=>{const x=68+index*step+step/2;const incoming=day.received_cents/max*plotHeight;const outgoing=(day.expenses_cents+(day.refunded_cents??0))/max*plotHeight;return <g key={day.date}><rect x={x-bar-1} y={170-incoming} width={bar} height={incoming} rx="2" fill="#009ca1"><title>{businessDate(day.date)}: entradas {money(day.received_cents)}</title></rect><rect x={x+1} y={170-outgoing} width={bar} height={outgoing} rx="2" fill="#eab366"><title>{businessDate(day.date)}: saídas e estornos {money(day.expenses_cents+(day.refunded_cents??0))}</title></rect>{(daily.length<=12||index===0||index===daily.length-1||index%Math.ceil(daily.length/8)===0)&&<text x={x} y="191" textAnchor="middle" fill="#8090a8" fontSize="10">{day.date.slice(8)}/{day.date.slice(5,7)}</text>}</g>;})}</svg><button className="text-link" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Ocultar':'Ver'} valores por dia</button>{expanded&&<div className="business-table-scroll"><table><thead><tr><th>Dia</th><th>Entradas</th><th>Despesas pagas</th><th>Estornos de vendas</th></tr></thead><tbody>{daily.map(day=><tr key={day.date}><td>{businessDate(day.date)}</td><td>{money(day.received_cents)}</td><td>{money(day.expenses_cents)}</td><td>{money(day.refunded_cents??0)}</td></tr>)}</tbody></table></div>}</div>;
}
export function PaymentMethod({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  return <label>Forma de pagamento<select value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="other">Outro</option></select></label>;
}
export const paymentLabel=(value:string)=>({pix:'Pix',cash:'Dinheiro',credit_card:'Cartão de crédito',debit_card:'Cartão de débito',other:'Outro'}[value]??value);
export async function downloadBusinessCsv(path:string,filename:string) {
  const response=await fetch('/api'+path,{credentials:'include',headers:{'X-PetCore-Request':'1'}});
  if(!response.ok){let message='Não foi possível exportar o relatório.';try{const body=await response.json();message=body.error||message;}catch{}throw Error(message);}
  return saveTextFile(filename,'text/csv',await response.text());
}
