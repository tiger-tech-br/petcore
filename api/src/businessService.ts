import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {Request} from 'express';
import {z} from 'zod';
import {ensure,error,pool,tenant,tx,type Db} from './core.js';
import {recordAudit} from './audit.js';

export const cents=z.number().int().min(0).max(1000000000);
export const paymentMethod=z.enum(['pix','cash','credit_card','debit_card','other']);
export const pageQuery={page:z.coerce.number().int().min(1).max(1000000).default(1),page_size:z.coerce.number().int().min(1).max(100).default(20)};
export const idempotency=z.uuid();
export const dateQuery={from:z.iso.date().optional(),to:z.iso.date().optional()};
export type DateRange={from:string;to:string;timezone:string};
type Reference={id?:string;saleId?:string;paymentId?:string};

// Todos os comandos comerciais da mesma empresa usam a mesma ordem de locks.
// A chave repetida armazena somente IDs, jamais snapshots de dados pessoais.
export async function mutate<T extends Reference>(req:Request,key:string,kind:string,payload:unknown,run:(db:PoolClient,company:string,user:string)=>Promise<T>):Promise<T>{
 const company=tenant(req),user=req.access!.userId;
 const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 try{return await tx(async db=>{
  await db.query("SET LOCAL lock_timeout='8s'");
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[company]);
  const prior=await db.query('SELECT kind,payload_hash,response FROM business_operations WHERE tenant_id=$1 AND idempotency_key=$2',[company,key]);
  if(prior.rowCount){ensure(prior.rows[0].kind===kind&&prior.rows[0].payload_hash===hash,409,'Esta chave já foi usada em outra operação. Atualize a tela antes de tentar novamente.');return prior.rows[0].response as T;}
  const result=await run(db,company,user);
  await db.query('INSERT INTO business_operations(tenant_id,idempotency_key,kind,payload_hash,response,created_by) VALUES($1,$2,$3,$4,$5,$6)',[company,key,kind,hash,JSON.stringify(result),user]);
  await recordAudit(db,{tenantId:company,userId:user,action:kind,entityType:'business',entityId:result.id??result.saleId??null,metadata:{}});
  return result;
 });}catch(cause){if((cause as {code?:string}).code==='55P03')error(409,'Outra alteração está em andamento. Aguarde alguns segundos e tente novamente.');throw cause;}
}

export const productColumns='p.id,p.name,p.sku,p.unit,p.price_cents,p.cost_cents,p.min_stock,p.stock_quantity,p.active,p.public_catalog_visible,p.created_at,p.updated_at';
export async function product(db:Db,company:string,id:string){const row=await db.query(`SELECT ${productColumns} FROM business_products p WHERE p.tenant_id=$1 AND p.id=$2`,[company,id]);ensure(row.rowCount,404,'Produto não encontrado.');return row.rows[0];}

const saleColumns=`s.id,upper(left(s.id::text,8)) AS code,s.tutor_id,t.name AS tutor_name,s.appointment_id,s.status,
 s.subtotal_cents,s.discount_cents,s.delivery_fee_cents,s.total_cents,COALESCE(l.paid_cents,0)::float8 AS paid_cents,
 CASE WHEN s.status='cancelled' THEN 0 ELSE s.total_cents-COALESCE(l.paid_cents,0) END::float8 AS balance_cents,
 s.due_date::text,s.notes,s.created_at,s.cancelled_at,s.cancellation_reason`;
const saleJoins=`FROM business_sales s LEFT JOIN tutors t ON t.tenant_id=s.tenant_id AND t.id=s.tutor_id
 LEFT JOIN LATERAL (SELECT SUM(CASE WHEN kind='sale_payment' THEN amount_cents ELSE -amount_cents END) AS paid_cents
 FROM business_ledger WHERE tenant_id=s.tenant_id AND sale_id=s.id) l ON true`;
export const saleSelect=`SELECT ${saleColumns} ${saleJoins}`;
export async function sale(db:Db,company:string,id:string){const row=await db.query(`${saleSelect} WHERE s.tenant_id=$1 AND s.id=$2`,[company,id]);ensure(row.rowCount,404,'Comanda não encontrada.');return row.rows[0];}

export const expenseColumns='e.id,e.title,e.category,e.amount_cents,e.due_date::text,e.status,e.notes,e.created_at,e.paid_at,e.payment_method,e.cancelled_at,e.cancellation_reason';
export async function expense(db:Db,company:string,id:string){const row=await db.query(`SELECT ${expenseColumns} FROM business_expenses e WHERE e.tenant_id=$1 AND e.id=$2`,[company,id]);ensure(row.rowCount,404,'Despesa não encontrada.');return row.rows[0];}

export const ledgerColumns='l.id,l.sale_id,l.expense_id,l.kind,l.amount_cents,l.payment_method,l.cash_session_id,l.created_at,u.name AS created_by_name';
export const ledgerJoins='FROM business_ledger l JOIN users u ON u.id=l.created_by';
export async function ledgerEntry(db:Db,company:string,id:string){const row=await db.query(`SELECT ${ledgerColumns} ${ledgerJoins} WHERE l.tenant_id=$1 AND l.id=$2`,[company,id]);ensure(row.rowCount,404,'Lançamento não encontrado.');return row.rows[0];}
export const movementColumns='m.id,m.product_id,p.name AS product_name,m.quantity_delta,m.balance_after,m.reason,m.note,m.created_at,u.name AS created_by_name';
export const movementJoins='FROM business_stock_movements m JOIN business_products p ON p.tenant_id=m.tenant_id AND p.id=m.product_id JOIN users u ON u.id=m.created_by';
export async function movement(db:Db,company:string,id:string){const row=await db.query(`SELECT ${movementColumns} ${movementJoins} WHERE m.tenant_id=$1 AND m.id=$2`,[company,id]);ensure(row.rowCount,404,'Movimentação não encontrada.');return row.rows[0];}

export const cashSelect=`SELECT c.id,c.opened_at,c.closed_at,c.opening_cents,c.counted_cents,
 CASE WHEN c.closed_at IS NULL THEN c.opening_cents+COALESCE(l.balance,0) ELSE c.expected_cents END::float8 AS expected_cents,
 c.difference_cents::float8,c.notes,c.closing_notes,u.name AS opened_by_name,cu.name AS closed_by_name
 FROM business_cash_sessions c JOIN users u ON u.id=c.opened_by LEFT JOIN users cu ON cu.id=c.closed_by
 LEFT JOIN LATERAL (SELECT SUM(CASE WHEN kind IN ('sale_payment','expense_refund') THEN amount_cents ELSE -amount_cents END) AS balance
 FROM business_ledger WHERE tenant_id=c.tenant_id AND cash_session_id=c.id) l ON true`;
export async function cash(db:Db,company:string,id:string){const row=await db.query(`${cashSelect} WHERE c.tenant_id=$1 AND c.id=$2`,[company,id]);ensure(row.rowCount,404,'Caixa não encontrado.');return row.rows[0];}
export async function currentCash(db:Db,company:string){const row=await db.query(`${cashSelect} WHERE c.tenant_id=$1 AND c.closed_at IS NULL`,[company]);return row.rows[0]??null;}
export async function cashFor(db:PoolClient,company:string,method:string,outgoingCents=0):Promise<string|null>{
 if(method!=='cash')return null;
 const row=await db.query('SELECT id FROM business_cash_sessions WHERE tenant_id=$1 AND closed_at IS NULL FOR UPDATE',[company]);
 ensure(row.rowCount,409,'Abra o caixa antes de registrar um movimento em dinheiro.');
 if(outgoingCents){const state=await cash(db,company,row.rows[0].id);ensure(state.expected_cents>=outgoingCents,409,'O caixa não tem saldo registrado suficiente para esta saída em dinheiro.');}
 return row.rows[0].id;
}

export async function moveStock(db:PoolClient,company:string,user:string,id:string,delta:number,reason:string,note='',saleId:string|null=null){
 const row=await db.query('SELECT stock_quantity FROM business_products WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);
 ensure(row.rowCount,404,'Produto não encontrado.');const balance=Number(row.rows[0].stock_quantity)+delta;
 ensure(Number.isInteger(balance)&&balance>=0&&balance<=1000000,409,'Estoque insuficiente ou quantidade acima do limite.');
 await db.query('UPDATE business_products SET stock_quantity=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[company,id,balance]);
 const inserted=await db.query('INSERT INTO business_stock_movements(tenant_id,product_id,sale_id,quantity_delta,balance_after,reason,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[company,id,saleId,delta,balance,reason,note,user]);
 return inserted.rows[0].id as string;
}

export async function appendLedger(db:PoolClient,company:string,user:string,data:{saleId?:string;expenseId?:string;kind:string;amount:number;method:string}){
 const outgoing=['sale_refund','expense_payment'].includes(data.kind);
 const cashId=await cashFor(db,company,data.method,outgoing?data.amount:0);
 const result=await db.query('INSERT INTO business_ledger(tenant_id,sale_id,expense_id,kind,amount_cents,payment_method,cash_session_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[company,data.saleId??null,data.expenseId??null,data.kind,data.amount,data.method,cashId,user]);
 return result.rows[0].id as string;
}

function plusDays(day:string,count:number){const value=new Date(day+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+count);return value.toISOString().slice(0,10);}
export async function range(db:Db,company:string,input:{from?:string;to?:string}):Promise<DateRange>{
 const settings=await db.query("SELECT timezone,to_char(now() AT TIME ZONE timezone,'YYYY-MM-DD') AS today FROM tenants WHERE id=$1",[company]);
 ensure(settings.rowCount,404,'Empresa não encontrada.');const timezone=settings.rows[0].timezone as string;
 const to=input.to??settings.rows[0].today as string,from=input.from??plusDays(to,-29);
 const days=(Date.parse(to)-Date.parse(from))/86400000+1;ensure(days>=1&&days<=366,422,'Selecione um período de até 366 dias, com início anterior ao fim.');
 return {from,to,timezone};
}
export const inPeriod=(field:string,from='$2',to='$3',zone='$4')=>`${field}>=(${from}::date::timestamp AT TIME ZONE ${zone}) AND ${field}<((${to}::date+1)::timestamp AT TIME ZONE ${zone})`;

export async function financialSummary(company:string,period:DateRange){
 const {from,to,timezone}=period;const parameters=[company,from,to,timezone];
 const [flow,debt,methods,open]=await Promise.all([
  pool.query(`WITH days AS (SELECT generate_series($2::date,$3::date,interval '1 day')::date AS date),flows AS (
   SELECT (created_at AT TIME ZONE $4)::date AS date,
    COALESCE(SUM(amount_cents) FILTER(WHERE kind='sale_payment'),0)::float8 AS receipts_cents,
    COALESCE(SUM(amount_cents) FILTER(WHERE kind='sale_refund'),0)::float8 AS refunds_cents,
    COALESCE(SUM(amount_cents) FILTER(WHERE kind='expense_payment'),0)::float8 AS expenses_cents,
    COALESCE(SUM(amount_cents) FILTER(WHERE kind='expense_refund'),0)::float8 AS expense_refunds_cents
   FROM business_ledger WHERE tenant_id=$1 AND ${inPeriod('created_at')} GROUP BY 1)
   SELECT days.date::text,COALESCE(f.receipts_cents,0) AS receipts_cents,COALESCE(f.refunds_cents,0) AS refunds_cents,
   COALESCE(f.expenses_cents,0) AS expenses_cents,COALESCE(f.expense_refunds_cents,0) AS expense_refunds_cents,
   COALESCE(f.receipts_cents-f.refunds_cents-f.expenses_cents+f.expense_refunds_cents,0) AS net_cents
   FROM days LEFT JOIN flows f USING(date) ORDER BY days.date`,parameters),
  pool.query(`SELECT COALESCE((SELECT SUM(s.total_cents-COALESCE(p.paid,0)) FROM business_sales s LEFT JOIN LATERAL (
   SELECT SUM(CASE WHEN kind='sale_payment' THEN amount_cents ELSE -amount_cents END) AS paid FROM business_ledger WHERE tenant_id=s.tenant_id AND sale_id=s.id
  ) p ON true WHERE s.tenant_id=$1 AND s.status='open'),0)::float8 AS receivables_cents,
  COALESCE((SELECT SUM(amount_cents) FROM business_expenses WHERE tenant_id=$1 AND status='open'),0)::float8 AS payables_cents`,[company]),
  pool.query(`SELECT payment_method,COALESCE(SUM(amount_cents) FILTER(WHERE kind='sale_payment'),0)::float8 AS receipts_cents,
   COALESCE(SUM(amount_cents) FILTER(WHERE kind='sale_refund'),0)::float8 AS refunds_cents FROM business_ledger
   WHERE tenant_id=$1 AND kind IN ('sale_payment','sale_refund') AND ${inPeriod('created_at')} GROUP BY payment_method ORDER BY payment_method`,parameters),
  currentCash(pool,company)
 ]);
 const totals={receipts_cents:0,refunds_cents:0,expenses_cents:0,expense_refunds_cents:0,net_cents:0,receivables_cents:Number(debt.rows[0].receivables_cents),payables_cents:Number(debt.rows[0].payables_cents)};
 for(const day of flow.rows)for(const field of ['receipts_cents','refunds_cents','expenses_cents','expense_refunds_cents','net_cents'] as const)totals[field]+=Number(day[field]);
 return {...period,totals,daily:flow.rows,paymentMethods:methods.rows,cash:open};
}

export function csv(rows:Record<string,unknown>[],columns:{key:string;title:string}[]){
 const cell=(value:unknown)=>{let text=value===null||value===undefined?'':value instanceof Date?value.toISOString():String(value);if(typeof value==='string'&&/^[\s\u0000-\u001f]*[=+@-]/u.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 return '\ufeff'+[columns.map(column=>cell(column.title)).join(';'),...rows.map(row=>columns.map(column=>cell(row[column.key])).join(';'))].join('\r\n');
}

export type SaleCreationInput={tutor_id:string|null;appointment_id:string|null;items:({kind:'product';product_id:string;quantity:number}|{kind:'service';service_id:string;quantity:number})[];discount_cents:number;due_date:string;notes:string;delivery_fee_cents?:number};

const completedTaxi=`EXISTS(SELECT 1 FROM taxi_bookings tb JOIN taxi_trips tt ON tt.tenant_id=tb.tenant_id AND tt.booking_id=tb.id
 WHERE tb.tenant_id=a.tenant_id AND tb.appointment_id=a.id AND tb.cancelled_at IS NULL AND tt.status='completed')`;
const importableAppointment=(row:{status:string;starts_at:string|Date;completed_transport:boolean})=>
 (row.status==='done'&&new Date(row.starts_at)<=new Date())||(row.status==='cancelled'&&row.completed_transport);

/** Caller owns the commercial transaction and its idempotency key. */
export async function createSale(db:PoolClient,company:string,user:string,input:SaleCreationInput){
  type Line={kind:'product'|'service';product_id:string|null;service_id:string|null;description:string;quantity:number;unit_price_cents:number;total_cents:number};
  const lines:Line[]=[];let tutorId=input.tutor_id;
  if(input.appointment_id){
   // Descobre o tutor antes de travar: a privacidade tambem trava tutor antes
   // de limpar textos de atendimentos. A ordem evita deadlock na anonimizacao.
   const appointment=await db.query(`SELECT a.tutor_id,a.status,a.starts_at,${completedTaxi} AS completed_transport FROM appointments a WHERE a.tenant_id=$1 AND a.id=$2`,[company,input.appointment_id]);
   ensure(appointment.rowCount,404,'Atendimento não encontrado.');
   ensure(importableAppointment(appointment.rows[0]),422,'Importe um atendimento concluído ou o transporte realizado de um atendimento cancelado.');
   ensure(tutorId===null||tutorId===appointment.rows[0].tutor_id,422,'O tutor precisa corresponder ao atendimento.');
   tutorId=appointment.rows[0].tutor_id as string;
   ensure(input.items.every(item=>item.kind==='product'),422,'Os serviços do atendimento já foram importados; acrescente apenas produtos.');
  }
  if(tutorId){const tutor=await db.query('SELECT id,anonymized_at FROM tutors WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,tutorId]);ensure(tutor.rowCount,404,'Tutor não encontrado.');ensure(!tutor.rows[0].anonymized_at,409,'O cadastro deste tutor foi anonimizado e não pode receber novas vendas.');}
  if(input.appointment_id){
   const locked=await db.query(`SELECT a.tutor_id,a.status,a.starts_at,${completedTaxi} AS completed_transport FROM appointments a WHERE a.tenant_id=$1 AND a.id=$2 FOR UPDATE OF a`,[company,input.appointment_id]);
   ensure(locked.rowCount&&locked.rows[0].tutor_id===tutorId,409,'O atendimento foi alterado. Atualize a tela.');
   ensure(importableAppointment(locked.rows[0]),422,'Importe um atendimento concluído ou o transporte realizado de um atendimento cancelado.');
   const previous=await db.query('SELECT id FROM business_sales WHERE tenant_id=$1 AND appointment_id=$2',[company,input.appointment_id]);ensure(!previous.rowCount,409,'Este atendimento já possui uma comanda.');
   if(locked.rows[0].status==='done'){
    const services=await db.query('SELECT s.id,s.name,a.price_cents FROM appointment_services a JOIN services s ON s.tenant_id=a.tenant_id AND s.id=a.service_id WHERE a.tenant_id=$1 AND a.appointment_id=$2 ORDER BY a.position',[company,input.appointment_id]);
    ensure(services.rowCount,422,'O atendimento não possui serviços.');
    for(const row of services.rows)lines.push({kind:'service',product_id:null,service_id:row.id,description:row.name,quantity:1,unit_price_cents:row.price_cents,total_cents:row.price_cents});
   }
   // Transporte tem preço combinado próprio e não ocupa a agenda do banhista.
   // A trava da reserva serializa importação, alteração e cancelamento da taxa.
   const transport=await db.query('SELECT id,service_id,service_name,price_cents FROM taxi_bookings WHERE tenant_id=$1 AND appointment_id=$2 AND cancelled_at IS NULL FOR UPDATE',[company,input.appointment_id]);
   for(const row of transport.rows)lines.push({kind:'service',product_id:null,service_id:row.service_id,description:row.service_name,quantity:1,unit_price_cents:row.price_cents,total_cents:row.price_cents});
  }
  const duplicates=new Set<string>();
  for(const item of [...input.items].sort((a,b)=>(a.kind==='product'?a.product_id:a.service_id).localeCompare(b.kind==='product'?b.product_id:b.service_id))){
   const id=item.kind==='product'?item.product_id:item.service_id,key=item.kind+id;
   ensure(!duplicates.has(key),422,'Não repita o mesmo produto ou serviço em linhas diferentes.');duplicates.add(key);
   const row=await db.query(item.kind==='product'?'SELECT id,name,price_cents,active,stock_quantity FROM business_products WHERE tenant_id=$1 AND id=$2 FOR UPDATE':'SELECT id,name,price_cents,active FROM services WHERE tenant_id=$1 AND id=$2 FOR SHARE',[company,id]);
   ensure(row.rowCount,404,'Produto ou serviço não encontrado.');ensure(row.rows[0].active,422,'Produto ou serviço inativo.');
   if(item.kind==='product')ensure(row.rows[0].stock_quantity>=item.quantity,409,'Estoque insuficiente para esta venda.');
   const total=item.quantity*Number(row.rows[0].price_cents);ensure(Number.isSafeInteger(total)&&total<=1000000000,422,'Valor da linha acima do limite.');
   lines.push({kind:item.kind,product_id:item.kind==='product'?id:null,service_id:item.kind==='service'?id:null,description:row.rows[0].name,quantity:item.quantity,unit_price_cents:row.rows[0].price_cents,total_cents:total});
  }
  ensure(lines.length,422,'Inclua pelo menos um produto ou serviço.');
  const subtotal=lines.reduce((sum,item)=>sum+item.total_cents,0);ensure(Number.isSafeInteger(subtotal)&&subtotal<=1000000000,422,'Valor da comanda acima do limite.');
  ensure(input.discount_cents<=subtotal,422,'O desconto não pode ultrapassar o subtotal.');
  const fee=input.delivery_fee_cents??0;ensure(Number.isInteger(fee)&&fee>=0&&fee<=1000000000,422,'Informe uma taxa de entrega válida.');
  const total=subtotal-input.discount_cents+fee;ensure(Number.isSafeInteger(total)&&total<=1000000000,422,'Valor da comanda acima do limite.');
  const row=await db.query('INSERT INTO business_sales(tenant_id,tutor_id,appointment_id,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,status,due_date,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',[company,tutorId,input.appointment_id,subtotal,input.discount_cents,fee,total,total===0?'paid':'open',input.due_date,input.notes,user]);
  const id=row.rows[0].id as string;
  for(const item of lines){
   await db.query('INSERT INTO business_sale_items(tenant_id,sale_id,kind,product_id,service_id,description,quantity,unit_price_cents,total_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[company,id,item.kind,item.product_id,item.service_id,item.description,item.quantity,item.unit_price_cents,item.total_cents]);
   if(item.kind==='product')await moveStock(db,company,user,item.product_id!,-item.quantity,'sale','',id);
  }
  return {id};
}

/** A refund is recorded through the existing ledger and stock routines. */
export async function cancelSale(db:PoolClient,company:string,user:string,id:string,reason:string){
  const locked=await db.query('SELECT id FROM business_sales WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(locked.rowCount,404,'Comanda não encontrada.');
  const record=await sale(db,company,id);if(record.status==='cancelled')return {id};
  const payments=await db.query("SELECT payment_method,SUM(CASE WHEN kind='sale_payment' THEN amount_cents ELSE -amount_cents END)::float8 AS amount FROM business_ledger WHERE tenant_id=$1 AND sale_id=$2 GROUP BY payment_method ORDER BY payment_method",[company,id]);
  for(const payment of payments.rows)if(payment.amount>0)await appendLedger(db,company,user,{saleId:id,kind:'sale_refund',amount:payment.amount,method:payment.payment_method});
  const products=await db.query("SELECT product_id,SUM(quantity)::int AS quantity FROM business_sale_items WHERE tenant_id=$1 AND sale_id=$2 AND kind='product' GROUP BY product_id ORDER BY product_id",[company,id]);
  for(const item of products.rows)await moveStock(db,company,user,item.product_id,item.quantity,'sale_cancel','',id);
  await db.query("UPDATE business_sales SET status='cancelled',cancelled_at=now(),cancellation_reason=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",[company,id,reason]);
  // Only unfinished deliveries are cancelled. Delivered history stays delivered.
  const delivery=await db.query("SELECT id,status FROM business_delivery_orders WHERE tenant_id=$1 AND sale_id=$2 AND status IN ('preparing','out_for_delivery') FOR UPDATE",[company,id]);
  if(delivery.rowCount){
   const order=delivery.rows[0];
   await db.query("UPDATE business_delivery_orders SET status='cancelled',cancelled_at=now(),cancellation_reason=$3,updated_by=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2",[company,order.id,reason,user]);
   await db.query("INSERT INTO business_delivery_events(tenant_id,delivery_id,old_status,new_status,reason,actor_user_id) VALUES($1,$2,$3,'cancelled',$4,$5)",[company,order.id,order.status,reason,user]);
  }
  return {id};
}
