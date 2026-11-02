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

export const productColumns='p.id,p.name,p.sku,p.unit,p.price_cents,p.cost_cents,p.min_stock,p.stock_quantity,p.active,p.created_at,p.updated_at';
export async function product(db:Db,company:string,id:string){const row=await db.query(`SELECT ${productColumns} FROM business_products p WHERE p.tenant_id=$1 AND p.id=$2`,[company,id]);ensure(row.rowCount,404,'Produto não encontrado.');return row.rows[0];}

const saleColumns=`s.id,upper(left(s.id::text,8)) AS code,s.tutor_id,t.name AS tutor_name,s.appointment_id,s.status,
 s.subtotal_cents,s.discount_cents,s.total_cents,COALESCE(l.paid_cents,0)::float8 AS paid_cents,
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
