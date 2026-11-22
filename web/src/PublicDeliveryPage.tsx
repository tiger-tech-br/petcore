import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,CheckCircle2,ChevronLeft,ChevronRight,Minus,Package,Plus,Search,ShoppingBag,Trash2,Truck} from 'lucide-react';
import {Brand} from './Brand';
import {money} from './api';
import './styles/_public-delivery.scss';

type Product={id:string;name:string;unit:string;price_cents:number;available:boolean};
type Catalog={businessName:string;coverage_note:string;notice:string;delivery_fee_cents:number|null;confirmation_notice:string;products:Product[];total:number;page:number;page_size:number};
type Line={product:Product;quantity:number};
type Receipt={receipt:string;message:string};
const blank={customer_name:'',phone:'',address:'',reference:'',notes:''};
async function publicApi<T>(url:string,options:RequestInit={}):Promise<T>{
 const response=await fetch(url,{...options,credentials:'omit',headers:{'Content-Type':'application/json','X-PetCore-Request':'1',...options.headers}});
 const result=await response.json().catch(()=>{throw Error('Não foi possível conferir a resposta. Tente novamente.');});
 if(!response.ok)throw Object.assign(Error(result.error||'Não foi possível concluir agora.'),{status:response.status});
 return result;
}
export default function PublicDeliveryPage({token}:{token:string}){
 const [catalog,setCatalog]=useState<Catalog|null>(null),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[revision,setRevision]=useState(0);
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[cart,setCart]=useState<Line[]>([]),[step,setStep]=useState<'products'|'checkout'>('products');
 const [draft,setDraft]=useState(blank),[website,setWebsite]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false),[receipt,setReceipt]=useState<Receipt|null>(null);
 const attempt=useRef<unknown>(null),requestLock=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 const base=`/api/public/delivery/${encodeURIComponent(token)}`;
 useEffect(()=>{setCatalog(null);setCart([]);setReceipt(null);setDraft(blank);setStep('products');setError('');setUncertain(false);attempt.current=null;},[base]);
 useEffect(()=>{const timer=window.setTimeout(()=>{setQuery(search.trim());setPage(1);},350);return()=>window.clearTimeout(timer);},[search]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setLoadError('');
  publicApi<Catalog>(`${base}?${new URLSearchParams({q:query,page:String(page)})}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])})
   .then(result=>{if(!controller.signal.aborted)setCatalog(result);})
   .catch(cause=>{if(!controller.signal.aborted)setLoadError(cause.status===404?'Este catálogo não está disponível. Entre em contato com o pet shop.':cause.message);})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[base,query,page,revision]);
 useEffect(()=>{if(!loading)heading.current?.focus({preventScroll:true});},[step,receipt]);
 const count=cart.reduce((sum,line)=>sum+line.quantity,0),subtotal=cart.reduce((sum,line)=>sum+line.quantity*line.product.price_cents,0),locked=busy||uncertain;
 const fee=catalog?.delivery_fee_cents??null;
 function quantity(product:Product,value:number){
  if(locked)return;setError('');attempt.current=null;
  setCart(current=>value<1?current.filter(line=>line.product.id!==product.id):current.some(line=>line.product.id===product.id)?current.map(line=>line.product.id===product.id?{product,quantity:Math.min(1000,value)}:line):current.length<20?[...current,{product,quantity:Math.min(1000,value)}]:current);
 }
 function checkout(){if(!cart.length||locked)return;setError('');setStep('checkout');window.scrollTo({top:0,behavior:'smooth'});}
 async function submit(event:FormEvent){
  event.preventDefault();if(requestLock.current||!cart.length)return;requestLock.current=true;setBusy(true);setError('');
  try{
   if(!attempt.current)attempt.current={...Object.fromEntries(Object.entries(draft).map(([key,value])=>[key,value.trim()])),items:cart.map(line=>({product_id:line.product.id,quantity:line.quantity})),idempotency_key:crypto.randomUUID(),website};
   const result=await publicApi<Receipt>(`${base}/requests`,{method:'POST',body:JSON.stringify(attempt.current),signal:AbortSignal.timeout(25000)});
   if(!result.receipt)throw Error('Resposta sem confirmação.');
   setReceipt(result);setUncertain(false);setDraft(blank);setCart([]);attempt.current=null;
  }catch(cause){
   const failure=cause as Error&{status?:number};
   if(failure.status){attempt.current=null;setUncertain(false);setError(failure.message);}
   else{setUncertain(true);setError('Não conseguimos conferir se o pedido chegou. Tente confirmar o mesmo envio abaixo; seus itens serão preservados para evitar um pedido duplicado.');}
  }finally{setBusy(false);requestLock.current=false;}
 }
 const change=(field:keyof typeof blank,value:string)=>{if(locked)return;setDraft(current=>({...current,[field]:value}));attempt.current=null;};
 return <div className="public-delivery-page"><header className="public-delivery-header"><Brand/><span><Truck size={20}/>Entrega de produtos</span></header><main className="public-delivery-main">
  <div className="public-delivery-intro"><p className="public-delivery-eyebrow">CATÁLOGO DO PET SHOP</p><h1 ref={heading} tabIndex={-1}>{receipt?'Pedido enviado':catalog?.businessName||'Produtos para seu pet'}</h1><p>{receipt?'O pet shop vai conferir os produtos e combinar a entrega com você.':'Escolha os produtos e envie seu pedido ao pet shop.'}</p></div>
  {receipt?<section className="public-delivery-success" aria-live="polite"><CheckCircle2 size={52}/><h2>Recebemos seu pedido</h2><p>{receipt.message}</p><p>O envio não realiza pagamento. Aguarde o contato do pet shop antes de pagar.</p><div className="public-delivery-protocol"><span>Protocolo do pedido</span><strong>{receipt.receipt}</strong></div><button className="primary-btn" type="button" onClick={()=>{setReceipt(null);setStep('products');setRevision(value=>value+1);}}>Voltar ao catálogo</button></section>:<>
   {loadError?<section className="public-delivery-empty" role="alert"><Package size={36}/><p>{loadError}</p><button className="ghost-btn" type="button" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button></section>:!catalog&&loading?<p className="public-delivery-empty" role="status">Carregando catálogo...</p>:catalog&&<>
    {(catalog.coverage_note||catalog.notice)&&<aside className="public-delivery-shop-note">{catalog.coverage_note&&<p><strong>Onde entregamos</strong>{catalog.coverage_note}</p>}{catalog.notice&&<p><strong>Recado do pet shop</strong>{catalog.notice}</p>}</aside>}
    {step==='products'?<div className="public-delivery-layout"><section className="public-delivery-products" aria-label="Produtos disponíveis"><label className="public-delivery-search"><Search size={21}/><span className="sr-only">Buscar produto</span><input type="search" placeholder="Buscar ração, acessórios..." maxLength={100} value={search} disabled={locked} onChange={event=>setSearch(event.target.value)}/></label>
     {loading?<p role="status">Atualizando produtos...</p>:!catalog.products.length?<div className="public-delivery-empty"><Package size={38}/><h2>{query?'Nenhum produto encontrado':'O catálogo está sendo preparado'}</h2><p>{query?'Tente buscar por outro nome.':'O pet shop ainda não disponibilizou produtos por aqui.'}</p></div>:<div className="public-delivery-grid">{catalog.products.map(product=>{
      const selected=cart.find(line=>line.product.id===product.id),value=selected?.quantity??0;
      return <article className="public-delivery-product" key={product.id}><span className="public-delivery-product-icon" aria-hidden="true"><Package size={32}/></span><h2>{product.name}</h2><p>{product.unit}</p><strong className="public-delivery-price">{money(product.price_cents)}</strong>{!product.available?<span className="public-delivery-unavailable">Indisponível no momento</span>:value?<div className="public-delivery-quantity"><button type="button" disabled={locked} aria-label={`Diminuir quantidade de ${product.name}`} onClick={()=>quantity(product,value-1)}><Minus size={19}/></button><span aria-live="polite">{value}</span><button type="button" disabled={locked||value>=1000} aria-label={`Aumentar quantidade de ${product.name}`} onClick={()=>quantity(product,value+1)}><Plus size={19}/></button></div>:<button type="button" className="ghost-btn" disabled={locked||cart.length>=20} onClick={()=>quantity(product,1)}><Plus size={18}/>Adicionar</button>}</article>;
     })}</div>}
     {catalog.total>catalog.page_size&&<nav className="public-delivery-pagination" aria-label="Páginas do catálogo"><button className="ghost-btn" disabled={loading||page<=1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={19}/>Anterior</button><span>Página {page} de {Math.ceil(catalog.total/catalog.page_size)}</span><button className="ghost-btn" disabled={loading||page*catalog.page_size>=catalog.total} onClick={()=>setPage(value=>value+1)}>Próxima<ChevronRight size={19}/></button></nav>}
    </section><aside className="public-delivery-cart"><h2><ShoppingBag size={24}/>Seu pedido {count>0&&<span>{count}</span>}</h2>{!cart.length?<p>Adicione os produtos que seu pet precisa.</p>:<><ul>{cart.map(line=><li key={line.product.id}><div><strong>{line.product.name}</strong><span>{line.quantity} × {money(line.product.price_cents)}</span></div><button type="button" className="icon-button" aria-label={`Remover ${line.product.name}`} onClick={()=>quantity(line.product,0)}><Trash2 size={19}/></button></li>)}</ul><div className="public-delivery-summary"><p><span>Produtos</span><strong>{money(subtotal)}</strong></p><p><span>Entrega</span><strong>{fee===null?'A combinar':money(fee)}</strong></p><p className="public-delivery-total"><span>{fee===null?'Subtotal':'Total'}</span><strong>{money(subtotal+(fee??0))}</strong></p></div><button type="button" className="primary-btn" onClick={checkout}>Continuar pedido<ArrowRight size={19}/></button></>}<p className="public-delivery-hint">A disponibilidade e a entrega serão confirmadas pelo pet shop.</p></aside></div>:<section className="public-delivery-checkout"><button className="text-link" disabled={locked} onClick={()=>setStep('products')}><ArrowLeft size={18}/>Voltar aos produtos</button><h2>Seus dados e a entrega</h2><p>Informe um telefone para o pet shop confirmar seu pedido.</p><form className="public-delivery-form" onSubmit={submit}>
     <label>Seu nome<input required minLength={2} maxLength={160} autoComplete="name" disabled={locked} value={draft.customer_name} onChange={event=>change('customer_name',event.target.value)}/></label><label>Telefone com DDD<input required type="tel" maxLength={40} autoComplete="tel" disabled={locked} placeholder="(11) 99999-9999" value={draft.phone} onChange={event=>change('phone',event.target.value)}/></label>
     <label className="full-span">Endereço completo<textarea required minLength={8} maxLength={600} rows={3} autoComplete="street-address" disabled={locked} placeholder="Rua, número, bairro, cidade e complemento" value={draft.address} onChange={event=>change('address',event.target.value)}/></label><label className="full-span">Ponto de referência <span>(opcional)</span><input maxLength={300} disabled={locked} value={draft.reference} onChange={event=>change('reference',event.target.value)}/></label><label className="full-span">Observações do pedido <span>(opcional)</span><textarea maxLength={1000} rows={3} disabled={locked} value={draft.notes} onChange={event=>change('notes',event.target.value)}/></label>
     <div className="public-delivery-honeypot" aria-hidden="true"><label>Seu site<input tabIndex={-1} autoComplete="off" value={website} onChange={event=>setWebsite(event.target.value)}/></label></div>
     <div className="public-delivery-review full-span"><h3>Confira seus produtos</h3><ul>{cart.map(line=><li key={line.product.id}><span>{line.quantity} × {line.product.name}</span><strong>{money(line.quantity*line.product.price_cents)}</strong></li>)}</ul><p><span>Entrega</span><strong>{fee===null?'Taxa a confirmar pelo pet shop':money(fee)}</strong></p><p className="public-delivery-total"><span>{fee===null?'Subtotal dos produtos':'Total do pedido'}</span><strong>{money(subtotal+(fee??0))}</strong></p></div><p className="public-delivery-hint full-span">{catalog.confirmation_notice} O envio não realiza pagamento.</p>{error&&<p className="public-delivery-error full-span" role="alert">{error}</p>}<div className="public-delivery-submit full-span"><button className="primary-btn" type="submit" disabled={busy||!cart.length}>{busy?'Enviando pedido...':uncertain?'Confirmar o mesmo envio':'Enviar pedido ao pet shop'}<ArrowRight size={19}/></button></div>
    </form></section>}
   </>}
  </>}
 </main><div className="public-delivery-footer">Pedidos com PetCore · Entrega confirmada pelo pet shop.</div></div>;
}
