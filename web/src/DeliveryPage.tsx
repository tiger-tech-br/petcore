import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {ArrowLeft,Check,CheckCircle2,MapPin,Package,Plus,RefreshCw,Search,Truck,X} from 'lucide-react';
import {money,today} from './api';
import FormDialog from './FormDialog';
import {Empty,PageHeader} from './ui';
import {BusinessPagination,businessDate,integerValue,parseCents,reasonText,useBusinessCommand,useBusinessQuery,type PageResult} from './businessUi';
import './styles/_delivery.scss';

type DeliveryStatus='preparing'|'out_for_delivery'|'delivered'|'cancelled';
type Tutor={id:string;name:string;phone:string|null};
type Product={id:string;name:string;sku:string;unit:string;price_cents:number;stock_quantity:number};
type Options={tutors:Tutor[];products:Product[];timezone:string};
type DeliveryItem={id:string;product_id:string;description:string;quantity:number;unit_price_cents:number;total_cents:number};
type Delivery={
  id:string;code:string;sale_id:string;sale_code:string;tutor_id:string;tutor_name:string;phone?:string;tutor_phone?:string;
  address:string;reference:string;notes:string;status:DeliveryStatus;delivery_fee_cents:number;subtotal_cents:number;total_cents:number;
  paid_cents:number;balance_cents:number;sale_status:'open'|'paid'|'cancelled';due_date:string;created_at:string;updated_at:string;
  delivered_at:string|null;cancelled_at:string|null;cancellation_reason?:string;items:DeliveryItem[];timezone?:string;
};
type Line={key:string;product_id:string;quantity:string};
type Draft={tutor_id:string;phone:string;address:string;reference:string;notes:string;fee:string;due_date:string};
type Dialog='new'|'detail'|'dispatch'|'deliver'|'cancel'|null;
type Props={setMessage:(value:string)=>void;setError:(value:string)=>void;onOpenFinance?:(saleId:string)=>void;onSetup?:(target:'tutors'|'inventory')=>void;publicRequests?:ReactNode;publicSettings?:ReactNode};
const statusLabels:Record<DeliveryStatus,string>={preparing:'Preparando',out_for_delivery:'Saiu para entrega',delivered:'Entregue',cancelled:'Cancelado'};
const newLine=():Line=>({key:crypto.randomUUID(),product_id:'',quantity:'1'});
const newDraft=():Draft=>({tutor_id:'',phone:'',address:'',reference:'',notes:'',fee:'0,00',due_date:today()});
function DeliveryStatusTag({status}:{status:DeliveryStatus}){
  return <span className={`delivery-status delivery-status--${status}`}>{statusLabels[status]??status}</span>;
}

export default function DeliveryPage({setMessage,setError,onOpenFinance,onSetup,publicRequests,publicSettings}:Props){
  const [area,setArea]=useState<'deliveries'|'requests'>('deliveries');
  const [status,setStatus]=useState('active'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
  const [dialog,setDialog]=useState<Dialog>(null),[selected,setSelected]=useState<Delivery|null>(null),[draft,setDraft]=useState<Draft>(newDraft),[lines,setLines]=useState<Line[]>(()=>[newLine()]);
  const [busy,setBusy]=useState(false),[error,setLocalError]=useState(''),[reason,setReason]=useState('');
  const params=new URLSearchParams({status,q:query,page:String(page),page_size:'20'});
  const list=useBusinessQuery<PageResult<Delivery>>(`/deliveries?${params}`,setError);
  const options=useBusinessQuery<Options>('/deliveries/options',setError);
  const detail=useBusinessQuery<Delivery>(selected&&dialog!=='new'&&dialog?`/deliveries/${selected.id}`:null,setError);
  const command=useBusinessCommand();
  const live=detail.data?.id===selected?.id?detail.data:selected;
  const detailReady=Boolean(live&&detail.data?.id===selected?.id&&!detail.loading&&!detail.error);
  const timezone=live?.timezone||options.data?.timezone||'America/Sao_Paulo';
  const products=options.data?.products??[];
  const productFor=(line:Line)=>products.find(item=>item.id===line.product_id);
  const subtotal=lines.reduce((sum,line)=>sum+(productFor(line)?.price_cents??0)*(Number(line.quantity)||0),0);
  let fee:number|null=null;try{fee=parseCents(draft.fee);}catch{/* The field reports the invalid amount when submitted. */}

  useEffect(()=>{const timer=window.setTimeout(()=>{setQuery(search.trim());setPage(1);},300);return()=>window.clearTimeout(timer);},[search]);
  function clearFeedback(){setLocalError('');setError('');setMessage('');}
  function report(cause:unknown){const message=reasonText(cause);setLocalError(message);setError(message);}
  function close(){if(busy)return;setDialog(null);setSelected(null);setLocalError('');}
  function openNew(){clearFeedback();command.reset();setSelected(null);setDraft(newDraft());setLines([newLine()]);setReason('');setDialog('new');}
  function openDelivery(item:Delivery,mode:Dialog='detail'){clearFeedback();command.reset();setSelected(item);setReason('');setDialog(mode);}
  function step(mode:Dialog){if(!live||busy)return;clearFeedback();command.reset();setReason('');setSelected(live);setDialog(mode);}
  function refresh(){list.refresh();options.refresh();}
  function updateLine(key:string,patch:Partial<Line>){setLines(current=>current.map(line=>line.key===key?{...line,...patch}:line));setLocalError('');}
  async function create(event:FormEvent){
    event.preventDefault();if(busy)return;setBusy(true);clearFeedback();
    try{
      if(!draft.tutor_id)throw Error('Escolha o cliente que vai receber o pedido.');
      if(!draft.phone.trim())throw Error('Informe um telefone para contato sobre a entrega.');
      if(!draft.address.trim())throw Error('Informe o endereço completo da entrega.');
      const seen=new Set<string>();
      const items=lines.map(line=>{
        const product=productFor(line);if(!product)throw Error('Escolha um produto ativo em cada item do pedido.');
        if(seen.has(product.id))throw Error('Use uma única linha para cada produto e ajuste a quantidade.');seen.add(product.id);
        const quantity=integerValue(line.quantity,1);
        return {product_id:product.id,quantity};
      });
      if(!items.length)throw Error('Adicione pelo menos um produto ao pedido.');
      const saved=await command.send<Delivery>('/deliveries',{tutor_id:draft.tutor_id,phone:draft.phone.trim(),address:draft.address.trim(),reference:draft.reference.trim(),notes:draft.notes.trim(),items,delivery_fee_cents:parseCents(draft.fee),due_date:draft.due_date});
      command.reset();setSelected(saved);setDialog('detail');detail.refresh();refresh();setError('');setMessage('Pedido de entrega cadastrado. A comanda e a saída dos produtos foram registradas.');
    }catch(cause){report(cause);}finally{setBusy(false);}
  }
  async function changeStatus(event:FormEvent){
    event.preventDefault();if(busy||!live)return;setBusy(true);clearFeedback();
    try{
      const next=dialog==='dispatch'?'out_for_delivery':dialog==='deliver'?'delivered':dialog==='cancel'?'cancelled':null;
      if(!next)return;
      if(next==='cancelled'&&reason.trim().length<3)throw Error('Informe o motivo do cancelamento.');
      const saved=await command.send<Delivery>(`/deliveries/${live.id}/status`,{status:next,reason:next==='cancelled'?reason.trim():''});
      command.reset();setSelected(saved);setDialog('detail');detail.refresh();refresh();setError('');
      setMessage(next==='out_for_delivery'?'Saída para entrega registrada.':next==='delivered'?'Entrega concluída.':'Pedido e comanda cancelados. O estoque e os lançamentos foram atualizados.');
    }catch(cause){report(cause);}finally{setBusy(false);}
  }
  const titles={new:'Novo pedido de entrega',detail:live?`Pedido ${live.code}`:'Pedido de entrega',dispatch:'Registrar saída para entrega',deliver:'Confirmar entrega',cancel:'Cancelar pedido de entrega'};

  return <div className="delivery-page">
    <PageHeader eyebrow="ENTREGA DE PRODUTOS" title="Pedidos e entregas" subtitle="Cadastre os pedidos recebidos por telefone ou WhatsApp e acompanhe a entrega dos produtos." action={<button type="button" className="primary-btn" onClick={openNew}><Plus size={20}/>Novo pedido</button>}/>
    {publicSettings&&<div className="delivery-public-settings">{publicSettings}</div>}
    {publicRequests&&<div className="delivery-tabs" role="group" aria-label="Área de pedidos e entregas"><button type="button" className={area==='deliveries'?'selected':''} aria-pressed={area==='deliveries'} onClick={()=>setArea('deliveries')}>Minhas entregas</button><button type="button" className={area==='requests'?'selected':''} aria-pressed={area==='requests'} onClick={()=>setArea('requests')}>Pedidos recebidos</button></div>}
    {area==='requests'&&publicRequests?publicRequests:<section className="panel delivery-panel" aria-label="Pedidos de entrega">
      <div className="delivery-toolbar">
        <label className="delivery-search"><Search size={21}/><span className="delivery-sr">Buscar pedido ou cliente</span><input type="search" maxLength={100} placeholder="Buscar pedido ou cliente" value={search} onChange={event=>setSearch(event.target.value)}/></label>
        <label className="delivery-status-filter">Situação<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="active">Em andamento</option><option value="preparing">Preparando</option><option value="out_for_delivery">Saiu para entrega</option><option value="delivered">Entregues</option><option value="cancelled">Cancelados</option><option value="all">Todos os pedidos</option></select></label>
        <button type="button" className="ghost-btn delivery-refresh" onClick={()=>{clearFeedback();refresh();}} disabled={list.loading} aria-label="Atualizar pedidos" title="Atualizar pedidos"><RefreshCw size={21}/></button>
      </div>
      {list.loading?<Empty label="Carregando pedidos de entrega..."/>:list.error?<div className="delivery-empty-state"><p role="alert">{list.error}</p><button type="button" className="ghost-btn" onClick={list.refresh}>Tentar novamente</button></div>:list.data?.items.length?<>
        <div className="delivery-list">{list.data.items.map(item=><article className="delivery-order" key={item.id}>
          <div className="delivery-order-heading"><div><strong>{item.code}</strong><span>{businessDate(item.created_at,timezone,true)}</span></div><DeliveryStatusTag status={item.status}/></div>
          <div className="delivery-order-content"><div className="delivery-order-client"><h2>{item.tutor_name}</h2><p>{item.phone||item.tutor_phone}</p><p className="delivery-address"><MapPin size={19}/><span>{item.address}</span></p>{item.reference&&<p className="delivery-reference">Referência: {item.reference}</p>}</div><div className="delivery-order-value"><span>Total do pedido</span><strong>{money(item.total_cents)}</strong><small>Comanda {item.sale_code}</small></div></div>
          <div className="delivery-order-actions"><button type="button" className="ghost-btn" onClick={()=>openDelivery(item)}>Ver pedido</button>{item.status==='preparing'&&<button type="button" className="primary-btn" onClick={()=>openDelivery(item,'dispatch')}><Truck size={19}/>Registrar saída</button>}{item.status==='out_for_delivery'&&<button type="button" className="primary-btn" onClick={()=>openDelivery(item,'deliver')}><Check size={19}/>Marcar como entregue</button>}</div>
        </article>)}</div>
        <BusinessPagination page={page} pageSize={list.data.pageSize} total={list.data.total} busy={list.loading} onPage={setPage}/>
      </>:<Empty label={query?'Nenhum pedido encontrado para esta busca.':status==='active'?'Nenhum pedido em andamento. Use Novo pedido para cadastrar uma entrega.':'Nenhum pedido nesta situação.'}/>}
    </section>}

    {dialog&&<FormDialog title={titles[dialog]} description={dialog==='new'?'Cliente, produtos e endereço. Confira o pedido antes de salvar.':live?`${live.tutor_name} · Comanda ${live.sale_code}`:undefined} error={error||(dialog==='new'?options.error:detail.error)} busy={busy} onClose={close} wide={dialog==='new'||dialog==='detail'}>
      <div className="delivery-dialog">
        {dialog==='new'?options.loading?<Empty label="Carregando clientes e produtos..."/>:options.error?<button type="button" className="ghost-btn" onClick={options.refresh}>Tentar carregar opções novamente</button>:!options.data?.tutors.length||!products.length?<div className="delivery-empty-state"><Package size={35}/><p>{!options.data?.tutors.length?'Cadastre um cliente em Clientes e pets para registrar a entrega.':'Cadastre produtos ativos com preço e estoque em Produtos e estoque para registrar um pedido.'}</p>{onSetup&&<button type="button" className="primary-btn" onClick={()=>{const target=!options.data?.tutors.length?'tutors':'inventory';close();onSetup(target);}}>{!options.data?.tutors.length?'Ir para Clientes':'Ir para Produtos e estoque'}</button>}<button type="button" className="ghost-btn" onClick={options.refresh}><RefreshCw size={19}/>Atualizar cadastros</button></div>:<form className="delivery-form" onSubmit={create}>
          <fieldset><legend>1. Cliente e endereço</legend><div className="delivery-form-grid">
            <label>Cliente<select required value={draft.tutor_id} disabled={busy} onChange={event=>{const tutor=options.data?.tutors.find(item=>item.id===event.target.value);setDraft({...draft,tutor_id:event.target.value,phone:tutor?.phone||'',address:'',reference:''});setLocalError('');}}><option value="">Selecione o cliente</option>{options.data.tutors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Telefone para contato<input type="tel" inputMode="tel" required maxLength={40} autoComplete="off" placeholder="DDD e telefone" value={draft.phone} disabled={busy} onChange={event=>setDraft({...draft,phone:event.target.value})}/></label>
            <label className="delivery-full">Endereço completo da entrega<textarea required minLength={5} maxLength={1000} rows={3} placeholder="Rua, número, complemento, bairro e cidade" value={draft.address} disabled={busy} onChange={event=>setDraft({...draft,address:event.target.value})}/></label>
            <label className="delivery-full">Ponto de referência (opcional)<input maxLength={500} placeholder="Ex.: portão azul ou nome do condomínio" value={draft.reference} disabled={busy} onChange={event=>setDraft({...draft,reference:event.target.value})}/></label>
          </div></fieldset>
          <fieldset><legend>2. Produtos do pedido</legend><div className="delivery-product-lines">{lines.map((line,index)=>{
            const product=productFor(line);
            return <div className="delivery-product-line" key={line.key}>
              <label className="delivery-product-select">Produto<select required disabled={busy} value={line.product_id} onChange={event=>updateLine(line.key,{product_id:event.target.value})}><option value="">Selecione um produto</option>{products.map(item=><option key={item.id} value={item.id} disabled={lines.some(other=>other.key!==line.key&&other.product_id===item.id)}>{item.name} · {money(item.price_cents)}</option>)}</select>{product&&<small>Em estoque: {product.stock_quantity} {product.unit}{product.sku?` · ${product.sku}`:''}</small>}</label>
              <label>Quantidade<input type="number" inputMode="numeric" required min={1} max={1000000} step={1} value={line.quantity} disabled={busy} onChange={event=>updateLine(line.key,{quantity:event.target.value})}/></label>
              <div className="delivery-product-price"><span>Subtotal</span><strong>{money((product?.price_cents??0)*(Number(line.quantity)||0))}</strong></div>
              <button className="ghost-btn delivery-remove-product" type="button" disabled={busy||lines.length===1} onClick={()=>setLines(current=>current.filter(item=>item.key!==line.key))} aria-label={`Remover produto ${index+1}`} title="Remover produto"><X size={20}/></button>
            </div>;
          })}</div><button type="button" className="ghost-btn delivery-add-product" disabled={busy||lines.length>=50||lines.length>=products.length} onClick={()=>setLines(current=>[...current,newLine()])}><Plus size={19}/>Adicionar produto</button></fieldset>
          <fieldset><legend>3. Taxa e total</legend><label className="delivery-fee-field">Taxa de entrega (R$)<input inputMode="decimal" required placeholder="0,00" value={draft.fee} disabled={busy} onChange={event=>setDraft({...draft,fee:event.target.value})}/></label><div className="delivery-totals"><div><span>Produtos</span><strong>{money(subtotal)}</strong></div><div><span>Entrega</span><strong>{fee===null?'—':money(fee)}</strong></div><div className="delivery-grand-total"><span>Total do pedido</span><strong>{fee===null?'—':money(subtotal+fee)}</strong></div></div></fieldset>
          <details className="delivery-optional"><summary>Observações e vencimento (opcional)</summary><div className="delivery-form-grid"><label className="delivery-full">Observações do pedido<textarea maxLength={1000} rows={3} value={draft.notes} disabled={busy} onChange={event=>setDraft({...draft,notes:event.target.value})}/></label><label>Vencimento da comanda<input type="date" required value={draft.due_date} disabled={busy} onChange={event=>setDraft({...draft,due_date:event.target.value})}/></label></div></details>
          <p className="delivery-hint">Ao salvar, a comanda é criada e os produtos saem do estoque. Registre o pagamento no Financeiro quando ele acontecer.</p>
          <div className="delivery-form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="primary-btn" disabled={busy}>{busy?'Salvando pedido...':'Cadastrar pedido de entrega'}</button></div>
        </form>:!detailReady?<div className="delivery-empty-state">{detail.loading||!detail.error?<Empty label="Carregando pedido..."/>:<button type="button" className="ghost-btn" onClick={detail.refresh}>Tentar carregar pedido novamente</button>}</div>:live&&dialog==='detail'?<>
          <div className="delivery-detail-status"><DeliveryStatusTag status={live.status}/><span>{businessDate(live.created_at,timezone,true)}</span></div>
          <section className="delivery-detail-section"><h3><MapPin size={21}/>Endereço e contato</h3><strong>{live.tutor_name}</strong><p>{live.phone||live.tutor_phone}</p><p className="delivery-preserve">{live.address}</p>{live.reference&&<p>Referência: {live.reference}</p>}</section>
          <section className="delivery-detail-section"><h3><Package size={21}/>Produtos do pedido</h3><div className="delivery-detail-items">{live.items.map(item=><article key={item.id}><div><strong>{item.description}</strong><span>{item.quantity} × {money(item.unit_price_cents)}</span></div><strong>{money(item.total_cents)}</strong></article>)}</div></section>
          <div className="delivery-totals"><div><span>Produtos</span><strong>{money(live.subtotal_cents)}</strong></div><div><span>Taxa de entrega</span><strong>{money(live.delivery_fee_cents)}</strong></div><div className="delivery-grand-total"><span>Total do pedido</span><strong>{money(live.total_cents)}</strong></div></div>
          <section className="delivery-detail-section"><h3>Comanda {live.sale_code}</h3><div className="delivery-payment-summary"><span>{live.sale_status==='cancelled'?'Comanda cancelada':live.balance_cents===0?'Pagamento registrado':'Pagamento pendente'}</span><span>Recebido: <strong>{money(live.paid_cents)}</strong></span><span>A receber: <strong>{money(live.balance_cents)}</strong></span></div>{live.sale_status!=='cancelled'&&<p className="delivery-hint">Os recebimentos são registrados no Financeiro. Vencimento: {businessDate(live.due_date,timezone)}.</p>}{onOpenFinance&&<button type="button" className="ghost-btn delivery-open-finance" onClick={()=>{const saleId=live.sale_id;close();onOpenFinance(saleId);}}>Ver comanda no Financeiro</button>}</section>
          {live.notes&&<section className="delivery-detail-section"><h3>Observações</h3><p className="delivery-preserve">{live.notes}</p></section>}
          {live.delivered_at&&<p className="delivery-hint">Entrega concluída em {businessDate(live.delivered_at,timezone,true)}.</p>}
          {live.cancelled_at&&<p className="delivery-hint">Cancelado em {businessDate(live.cancelled_at,timezone,true)}.{live.cancellation_reason&&` Motivo: ${live.cancellation_reason}`}</p>}
          <div className="delivery-detail-actions">{live.status==='preparing'&&<button type="button" className="primary-btn" onClick={()=>step('dispatch')}><Truck size={20}/>Registrar saída</button>}{live.status==='out_for_delivery'&&<button type="button" className="primary-btn" onClick={()=>step('deliver')}><CheckCircle2 size={20}/>Marcar como entregue</button>}{['preparing','out_for_delivery'].includes(live.status)&&<button type="button" className="danger-btn" onClick={()=>step('cancel')}>Cancelar pedido</button>}</div>
          <div className="delivery-form-actions"><button type="button" className="ghost-btn" onClick={close}>Fechar pedido</button></div>
        </>:live&&<form className="delivery-form" onSubmit={changeStatus}>
          <button type="button" className="text-link delivery-back" disabled={busy} onClick={()=>step('detail')}><ArrowLeft size={18}/>Voltar ao pedido</button>
          <div className="delivery-action-summary"><strong>{live.code} · {live.tutor_name}</strong><p className="delivery-preserve">{live.address}</p><span>Total: {money(live.total_cents)}</span></div>
          {dialog==='dispatch'?<p className="delivery-action-message">Confirme que os produtos foram separados e saíram do pet shop para o endereço informado.</p>:dialog==='deliver'?<p className="delivery-action-message">Confirme que os produtos foram entregues ao cliente. O recebimento do pagamento continua sendo registrado no Financeiro.</p>:<><p className="delivery-warning">O pedido e a comanda serão cancelados, com os produtos devolvidos ao estoque.{live.paid_cents>0?' Os estornos serão registrados no histórico. A devolução dos valores recebidos deve ser feita pelo pet shop.':''}</p><label>Motivo do cancelamento<textarea required minLength={3} maxLength={1000} rows={3} disabled={busy} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Informe por que o pedido será cancelado"/></label></>}
          <div className="delivery-form-actions"><button type="button" className="ghost-btn" disabled={busy} onClick={()=>step('detail')}>Voltar</button><button type="submit" className={dialog==='cancel'?'danger-btn':'primary-btn'} disabled={busy}>{busy?'Registrando...':dialog==='dispatch'?'Confirmar saída':dialog==='deliver'?'Confirmar entrega':'Confirmar cancelamento'}</button></div>
        </form>}
      </div>
    </FormDialog>}
  </div>;
}
