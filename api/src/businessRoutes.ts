import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {auth,ensure,permit,pool,tenant} from './core.js';
import {recordAudit} from './audit.js';
import {requireSubscriptionWrite} from './commercialService.js';
import {appendLedger,cash,cashSelect,cents,csv,currentCash,dateQuery,expense,expenseColumns,financialSummary,idempotency,inPeriod,ledgerColumns,ledgerEntry,ledgerJoins,movement,movementColumns,movementJoins,moveStock,mutate,pageQuery,paymentMethod,product,productColumns,range,sale,saleSelect} from './businessService.js';

const router=Router();router.use(auth,requireSubscriptionWrite);
const page=(input:{page:number;page_size:number})=>({page:input.page,pageSize:input.page_size});
const listResult=(items:unknown[],total:number,input:{page:number;page_size:number})=>({items,total,...page(input)});
const productInput=z.object({name:z.string().trim().min(1).max(160),sku:z.string().trim().max(80).default(''),unit:z.string().trim().min(1).max(20).default('un.'),price_cents:cents,cost_cents:cents.default(0),min_stock:z.number().int().min(0).max(1000000).default(0)});
const productCreate=productInput.extend({initial_stock:z.number().int().min(0).max(1000000).default(0),idempotency_key:idempotency}).strict();

router.get('/products',permit('inventory'),async(req,res)=>{
 const company=tenant(req),input=z.object({...pageQuery,q:z.string().trim().max(100).default(''),low_stock:z.enum(['true','false']).default('false'),include_inactive:z.enum(['true','false']).default('false')}).strict().parse(req.query);
 const result=await pool.query(`WITH filtered AS (SELECT ${productColumns} FROM business_products p WHERE p.tenant_id=$1
  AND ($2::text='' OR strpos(lower(p.name),lower($2))>0 OR strpos(lower(p.sku),lower($2))>0)
  AND ($3::boolean OR p.active) AND (NOT $4::boolean OR (p.active AND p.stock_quantity<=p.min_stock)))
  SELECT COALESCE((SELECT json_agg(r) FROM (SELECT * FROM filtered ORDER BY lower(name),id LIMIT $5 OFFSET $6) r),'[]'::json) AS items,
  (SELECT count(*)::int FROM filtered) AS total,
  (SELECT json_build_object('products',count(*)::int,'lowStock',count(*) FILTER(WHERE active AND stock_quantity<=min_stock)::int,'units',COALESCE(sum(stock_quantity),0)::float8)
    FROM business_products WHERE tenant_id=$1) AS summary`,[company,input.q,input.include_inactive,input.low_stock,input.page_size,(input.page-1)*input.page_size]);
 res.json({...result.rows[0],...page(input)});
});
router.post('/products',permit('inventory'),async(req,res)=>{
 const input=productCreate.parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.product.create',input,async(db,company,user)=>{
  const row=await db.query('INSERT INTO business_products(tenant_id,name,sku,unit,price_cents,cost_cents,min_stock) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[company,input.name,input.sku,input.unit,input.price_cents,input.cost_cents,input.min_stock]);
  if(input.initial_stock)await moveStock(db,company,user,row.rows[0].id,input.initial_stock,'initial');
  return {id:row.rows[0].id as string};
 });res.status(201).json(await product(pool,tenant(req),ref.id!));
});
router.patch('/products/:id',permit('inventory'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({name:z.string().trim().min(1).max(160).optional(),sku:z.string().trim().max(80).optional(),unit:z.string().trim().min(1).max(20).optional(),price_cents:cents.optional(),cost_cents:cents.optional(),min_stock:z.number().int().min(0).max(1000000).optional(),active:z.boolean().optional()}).strict().parse(req.body);
 const fields=Object.keys(input);ensure(fields.length,422,'Nenhuma alteração informada.');
 const ref=await mutate(req,randomUUID(),'business.product.update',{id,...input},async(db,company)=>{
  await product(db,company,id);
  await db.query(`UPDATE business_products SET ${fields.map((field,index)=>`${field}=$${index+3}`).join(',')},updated_at=now() WHERE tenant_id=$1 AND id=$2`,[company,id,...fields.map(field=>input[field as keyof typeof input])]);
  return {id};
 });res.json(await product(pool,tenant(req),ref.id!));
});
router.get('/stock-movements',permit('inventory'),async(req,res)=>{
 const company=tenant(req),input=z.object({...pageQuery,product_id:z.uuid().optional()}).strict().parse(req.query);
 if(input.product_id)await product(pool,company,input.product_id);
 const result=await pool.query(`WITH filtered AS (SELECT ${movementColumns} ${movementJoins} WHERE m.tenant_id=$1 AND ($2::uuid IS NULL OR m.product_id=$2))
  SELECT COALESCE((SELECT json_agg(r) FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4) r),'[]'::json) AS items,(SELECT count(*)::int FROM filtered) AS total`,[company,input.product_id??null,input.page_size,(input.page-1)*input.page_size]);
 res.json({...result.rows[0],...page(input)});
});
router.post('/products/:id/movements',permit('inventory'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({quantity_delta:z.number().int().min(-1000000).max(1000000).refine(value=>value!==0),reason:z.enum(['purchase','usage','adjustment']),note:z.string().trim().min(1).max(2000),idempotency_key:idempotency}).strict().refine(value=>value.reason==='adjustment'||(value.reason==='purchase'?value.quantity_delta>0:value.quantity_delta<0),'O sinal da quantidade não corresponde ao motivo.').parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.stock.move',{id,...input},async(db,company,user)=>({id:await moveStock(db,company,user,id,input.quantity_delta,input.reason,input.note)}));
 res.status(201).json(await movement(pool,tenant(req),ref.id!));
});

router.get('/options',permit('finance'),async(req,res)=>{
 const company=tenant(req);
 const [tutors,services,products,appointments,settings]=await Promise.all([
  pool.query('SELECT id,name FROM tutors WHERE tenant_id=$1 AND anonymized_at IS NULL ORDER BY name,id LIMIT 1000',[company]),
  pool.query('SELECT id,name,price_cents FROM services WHERE tenant_id=$1 AND active ORDER BY name,id LIMIT 1000',[company]),
  pool.query('SELECT id,name,sku,price_cents,stock_quantity FROM business_products WHERE tenant_id=$1 AND active ORDER BY name,id LIMIT 1000',[company]),
  pool.query(`SELECT a.id,a.starts_at,p.name AS pet_name,t.name AS tutor_name FROM appointments a
   JOIN tutors t ON t.tenant_id=a.tenant_id AND t.id=a.tutor_id JOIN pets p ON p.tenant_id=a.tenant_id AND p.id=a.pet_id
   WHERE a.tenant_id=$1 AND a.status='done' AND a.starts_at<=now() AND a.starts_at>=now()-interval '366 days' AND t.anonymized_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM business_sales s WHERE s.tenant_id=a.tenant_id AND s.appointment_id=a.id)
   ORDER BY a.starts_at DESC,a.id LIMIT 1000`,[company]),
  pool.query('SELECT timezone FROM tenants WHERE id=$1',[company])
 ]);
 res.json({tutors:tutors.rows,services:services.rows,products:products.rows,appointments:appointments.rows,timezone:settings.rows[0].timezone});
});

router.get('/sales',permit('finance'),async(req,res)=>{
 const company=tenant(req),input=z.object({...pageQuery,...dateQuery,status:z.enum(['all','open','paid','cancelled']).default('all'),q:z.string().trim().max(100).default('')}).strict().parse(req.query);
 const period=await range(pool,company,input);
 const result=await pool.query(`WITH filtered AS (${saleSelect} WHERE s.tenant_id=$1 AND ${inPeriod('s.created_at')}
  AND ($5::text='all' OR s.status=$5) AND ($6::text='' OR strpos(lower(COALESCE(t.name,'')),lower($6))>0 OR strpos(lower(s.id::text),lower($6))>0))
  SELECT COALESCE((SELECT json_agg(r) FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT $7 OFFSET $8) r),'[]'::json) AS items,(SELECT count(*)::int FROM filtered) AS total`,[company,period.from,period.to,period.timezone,input.status,input.q,input.page_size,(input.page-1)*input.page_size]);
 res.json({...result.rows[0],...page(input)});
});
router.get('/sales/:id',permit('finance'),async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id),record=await sale(pool,company,id);
 const [items,payments,settings]=await Promise.all([
  pool.query('SELECT id,kind,product_id,service_id,description,quantity,unit_price_cents,total_cents FROM business_sale_items WHERE tenant_id=$1 AND sale_id=$2 ORDER BY id',[company,id]),
  pool.query(`SELECT ${ledgerColumns} ${ledgerJoins} WHERE l.tenant_id=$1 AND l.sale_id=$2 ORDER BY l.created_at,l.id`,[company,id]),
  pool.query('SELECT timezone FROM tenants WHERE id=$1',[company])
 ]);res.json({sale:record,items:items.rows,payments:payments.rows,timezone:settings.rows[0].timezone});
});
const itemInput=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('product'),product_id:z.uuid(),quantity:z.number().int().min(1).max(1000000)}).strict(),
 z.object({kind:z.literal('service'),service_id:z.uuid(),quantity:z.number().int().min(1).max(1000000)}).strict()
]);
router.post('/sales',permit('finance'),async(req,res)=>{
 const input=z.object({tutor_id:z.uuid().nullable().default(null),appointment_id:z.uuid().nullable().default(null),items:z.array(itemInput).max(100).default([]),discount_cents:cents.default(0),due_date:z.iso.date(),notes:z.string().trim().max(3000).default(''),idempotency_key:idempotency}).strict().parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.sale.create',input,async(db,company,user)=>{
  type Line={kind:'product'|'service';product_id:string|null;service_id:string|null;description:string;quantity:number;unit_price_cents:number;total_cents:number};
  const lines:Line[]=[];let tutorId=input.tutor_id;
  if(input.appointment_id){
   // Descobre o tutor antes de travar: a privacidade tambem trava tutor antes
   // de limpar textos de atendimentos. A ordem evita deadlock na anonimizacao.
   const appointment=await db.query("SELECT a.tutor_id,a.status,a.starts_at FROM appointments a WHERE a.tenant_id=$1 AND a.id=$2",[company,input.appointment_id]);
   ensure(appointment.rowCount,404,'Atendimento não encontrado.');
   ensure(appointment.rows[0].status==='done'&&new Date(appointment.rows[0].starts_at)<=new Date(),422,'Somente atendimentos já concluídos podem originar uma comanda.');
   ensure(tutorId===null||tutorId===appointment.rows[0].tutor_id,422,'O tutor precisa corresponder ao atendimento.');
   tutorId=appointment.rows[0].tutor_id as string;
   ensure(input.items.every(item=>item.kind==='product'),422,'Os serviços do atendimento já foram importados; acrescente apenas produtos.');
  }
  if(tutorId){const tutor=await db.query('SELECT id,anonymized_at FROM tutors WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,tutorId]);ensure(tutor.rowCount,404,'Tutor não encontrado.');ensure(!tutor.rows[0].anonymized_at,409,'O cadastro deste tutor foi anonimizado e não pode receber novas vendas.');}
  if(input.appointment_id){
   const locked=await db.query('SELECT tutor_id,status,starts_at FROM appointments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,input.appointment_id]);
   ensure(locked.rowCount&&locked.rows[0].tutor_id===tutorId,409,'O atendimento foi alterado. Atualize a tela.');
   ensure(locked.rows[0].status==='done'&&new Date(locked.rows[0].starts_at)<=new Date(),422,'Somente atendimentos já concluídos podem originar uma comanda.');
   const previous=await db.query('SELECT id FROM business_sales WHERE tenant_id=$1 AND appointment_id=$2',[company,input.appointment_id]);ensure(!previous.rowCount,409,'Este atendimento já possui uma comanda.');
   const services=await db.query('SELECT s.id,s.name,a.price_cents FROM appointment_services a JOIN services s ON s.tenant_id=a.tenant_id AND s.id=a.service_id WHERE a.tenant_id=$1 AND a.appointment_id=$2 ORDER BY a.position',[company,input.appointment_id]);
   ensure(services.rowCount,422,'O atendimento não possui serviços.');
   for(const row of services.rows)lines.push({kind:'service',product_id:null,service_id:row.id,description:row.name,quantity:1,unit_price_cents:row.price_cents,total_cents:row.price_cents});
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
  ensure(input.discount_cents<=subtotal,422,'O desconto não pode ultrapassar o subtotal.');const total=subtotal-input.discount_cents;
  const row=await db.query('INSERT INTO business_sales(tenant_id,tutor_id,appointment_id,subtotal_cents,discount_cents,total_cents,status,due_date,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[company,tutorId,input.appointment_id,subtotal,input.discount_cents,total,total===0?'paid':'open',input.due_date,input.notes,user]);
  const id=row.rows[0].id as string;
  for(const item of lines){
   await db.query('INSERT INTO business_sale_items(tenant_id,sale_id,kind,product_id,service_id,description,quantity,unit_price_cents,total_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[company,id,item.kind,item.product_id,item.service_id,item.description,item.quantity,item.unit_price_cents,item.total_cents]);
   if(item.kind==='product')await moveStock(db,company,user,item.product_id!,-item.quantity,'sale','',id);
  }
  return {id};
 });res.status(201).json(await sale(pool,tenant(req),ref.id!));
});
router.post('/sales/:id/payments',permit('finance'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({amount_cents:cents.refine(value=>value>0),payment_method:paymentMethod,idempotency_key:idempotency}).strict().parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.sale.payment',{id,...input},async(db,company,user)=>{
  const locked=await db.query('SELECT id FROM business_sales WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(locked.rowCount,404,'Comanda não encontrada.');
  const record=await sale(db,company,id);ensure(record.status==='open',409,'Esta comanda não aceita novos recebimentos.');ensure(input.amount_cents<=record.balance_cents,422,'O pagamento não pode ultrapassar o saldo da comanda.');
  const paymentId=await appendLedger(db,company,user,{saleId:id,kind:'sale_payment',amount:input.amount_cents,method:input.payment_method});
  await db.query('UPDATE business_sales SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2',[company,id,input.amount_cents===record.balance_cents?'paid':'open']);
  return {saleId:id,paymentId};
 });res.status(201).json({sale:await sale(pool,tenant(req),ref.saleId!),payment:await ledgerEntry(pool,tenant(req),ref.paymentId!)});
});
router.post('/sales/:id/cancel',permit('finance'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({reason:z.string().trim().min(3).max(1000),idempotency_key:idempotency}).strict().parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.sale.cancel',{id,...input},async(db,company,user)=>{
  const locked=await db.query('SELECT id FROM business_sales WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(locked.rowCount,404,'Comanda não encontrada.');
  const record=await sale(db,company,id);if(record.status==='cancelled')return {id};
  const payments=await db.query("SELECT payment_method,SUM(CASE WHEN kind='sale_payment' THEN amount_cents ELSE -amount_cents END)::float8 AS amount FROM business_ledger WHERE tenant_id=$1 AND sale_id=$2 GROUP BY payment_method ORDER BY payment_method",[company,id]);
  for(const payment of payments.rows)if(payment.amount>0)await appendLedger(db,company,user,{saleId:id,kind:'sale_refund',amount:payment.amount,method:payment.payment_method});
  const products=await db.query("SELECT product_id,SUM(quantity)::int AS quantity FROM business_sale_items WHERE tenant_id=$1 AND sale_id=$2 AND kind='product' GROUP BY product_id ORDER BY product_id",[company,id]);
  for(const item of products.rows)await moveStock(db,company,user,item.product_id,item.quantity,'sale_cancel','',id);
  await db.query("UPDATE business_sales SET status='cancelled',cancelled_at=now(),cancellation_reason=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2",[company,id,input.reason]);
  return {id};
 });res.json(await sale(pool,tenant(req),ref.id!));
});

router.get('/expenses',permit('finance'),async(req,res)=>{
 const company=tenant(req),input=z.object({...pageQuery,...dateQuery,status:z.enum(['all','open','paid','cancelled']).default('all')}).strict().parse(req.query),period=await range(pool,company,input);
 const result=await pool.query(`WITH filtered AS (SELECT ${expenseColumns} FROM business_expenses e WHERE e.tenant_id=$1 AND e.due_date BETWEEN $2::date AND $3::date AND ($4::text='all' OR e.status=$4))
  SELECT COALESCE((SELECT json_agg(r) FROM (SELECT * FROM filtered ORDER BY due_date,id LIMIT $5 OFFSET $6) r),'[]'::json) AS items,(SELECT count(*)::int FROM filtered) AS total`,[company,period.from,period.to,input.status,input.page_size,(input.page-1)*input.page_size]);
 res.json({...result.rows[0],...page(input)});
});
router.post('/expenses',permit('finance'),async(req,res)=>{
 const input=z.object({title:z.string().trim().min(1).max(160),category:z.enum(['supplies','rent','payroll','utilities','other']),amount_cents:cents.refine(value=>value>0),due_date:z.iso.date(),notes:z.string().trim().max(3000).default(''),idempotency_key:idempotency}).strict().parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.expense.create',input,async(db,company,user)=>{
  const row=await db.query('INSERT INTO business_expenses(tenant_id,title,category,amount_cents,due_date,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[company,input.title,input.category,input.amount_cents,input.due_date,input.notes,user]);return {id:row.rows[0].id as string};
 });res.status(201).json(await expense(pool,tenant(req),ref.id!));
});
router.post('/expenses/:id/pay',permit('finance'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({payment_method:paymentMethod,idempotency_key:idempotency}).strict().parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.expense.pay',{id,...input},async(db,company,user)=>{
  const row=await db.query('SELECT status,amount_cents FROM business_expenses WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(row.rowCount,404,'Despesa não encontrada.');ensure(row.rows[0].status==='open',409,'Esta despesa não está pendente.');
  await appendLedger(db,company,user,{expenseId:id,kind:'expense_payment',amount:row.rows[0].amount_cents,method:input.payment_method});
  await db.query("UPDATE business_expenses SET status='paid',paid_at=now(),payment_method=$3 WHERE tenant_id=$1 AND id=$2",[company,id,input.payment_method]);return {id};
 });res.json(await expense(pool,tenant(req),ref.id!));
});
router.post('/expenses/:id/cancel',permit('finance'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({reason:z.string().trim().min(3).max(1000),idempotency_key:idempotency}).strict().parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.expense.cancel',{id,...input},async(db,company,user)=>{
  const row=await db.query('SELECT status,amount_cents,payment_method FROM business_expenses WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(row.rowCount,404,'Despesa não encontrada.');
  if(row.rows[0].status==='cancelled')return {id};
  if(row.rows[0].status==='paid')await appendLedger(db,company,user,{expenseId:id,kind:'expense_refund',amount:row.rows[0].amount_cents,method:row.rows[0].payment_method});
  await db.query("UPDATE business_expenses SET status='cancelled',cancelled_at=now(),cancellation_reason=$3 WHERE tenant_id=$1 AND id=$2",[company,id,input.reason]);return {id};
 });res.json(await expense(pool,tenant(req),ref.id!));
});

router.get('/cash',permit('finance'),async(req,res)=>{
 const company=tenant(req),[current,recent,settings]=await Promise.all([currentCash(pool,company),pool.query(`${cashSelect} WHERE c.tenant_id=$1 ORDER BY c.opened_at DESC,c.id DESC LIMIT 20`,[company]),pool.query('SELECT timezone FROM tenants WHERE id=$1',[company])]);res.json({current,recent:recent.rows,timezone:settings.rows[0].timezone});
});
router.post('/cash/open',permit('finance'),async(req,res)=>{
 const input=z.object({opening_cents:cents,notes:z.string().trim().max(2000).default(''),idempotency_key:idempotency}).strict().parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.cash.open',input,async(db,company,user)=>{
  const open=await currentCash(db,company);ensure(!open,409,'Esta empresa já possui um caixa aberto.');
  const row=await db.query('INSERT INTO business_cash_sessions(tenant_id,opening_cents,notes,opened_by) VALUES($1,$2,$3,$4) RETURNING id',[company,input.opening_cents,input.notes,user]);return {id:row.rows[0].id as string};
 });res.status(201).json(await cash(pool,tenant(req),ref.id!));
});
router.post('/cash/:id/close',permit('finance'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({counted_cents:cents,notes:z.string().trim().max(2000).default(''),idempotency_key:idempotency}).strict().parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.cash.close',{id,...input},async(db,company,user)=>{
  const locked=await db.query('SELECT closed_at FROM business_cash_sessions WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(locked.rowCount,404,'Caixa não encontrado.');ensure(!locked.rows[0].closed_at,409,'Este caixa já foi fechado.');
  const current=await cash(db,company,id);
  await db.query('UPDATE business_cash_sessions SET closed_at=now(),closed_by=$3,counted_cents=$4,expected_cents=$5,difference_cents=$6,closing_notes=$7 WHERE tenant_id=$1 AND id=$2',[company,id,user,input.counted_cents,current.expected_cents,input.counted_cents-current.expected_cents,input.notes]);return {id};
 });res.json(await cash(pool,tenant(req),ref.id!));
});

router.get('/summary',permit('finance'),async(req,res)=>{const company=tenant(req),input=z.object(dateQuery).strict().parse(req.query);res.json(await financialSummary(company,await range(pool,company,input)));});
router.get('/reports',permit('finance'),async(req,res)=>{
 const company=tenant(req),input=z.object(dateQuery).strict().parse(req.query),period=await range(pool,company,input),parameters=[company,period.from,period.to,period.timezone];
 const [summary,sales,services,products,professionals,appointments,lowStock]=await Promise.all([
  financialSummary(company,period),
  pool.query(`SELECT count(*)::int AS count,COALESCE(sum(total_cents),0)::float8 AS total_cents,COALESCE(sum(discount_cents),0)::float8 AS discount_cents FROM business_sales WHERE tenant_id=$1 AND status<>'cancelled' AND ${inPeriod('created_at')}`,parameters),
  pool.query(`SELECT i.description AS name,SUM(i.quantity)::float8 AS quantity,SUM(i.total_cents)::float8 AS total_cents FROM business_sale_items i JOIN business_sales s ON s.tenant_id=i.tenant_id AND s.id=i.sale_id WHERE i.tenant_id=$1 AND s.status<>'cancelled' AND i.kind='service' AND ${inPeriod('s.created_at')} GROUP BY i.description ORDER BY quantity DESC,name LIMIT 100`,parameters),
  pool.query(`SELECT i.description AS name,SUM(i.quantity)::float8 AS quantity,SUM(i.total_cents)::float8 AS total_cents FROM business_sale_items i JOIN business_sales s ON s.tenant_id=i.tenant_id AND s.id=i.sale_id WHERE i.tenant_id=$1 AND s.status<>'cancelled' AND i.kind='product' AND ${inPeriod('s.created_at')} GROUP BY i.description ORDER BY quantity DESC,name LIMIT 100`,parameters),
  pool.query(`SELECT p.id,p.name,count(*) FILTER(WHERE a.status='done' AND a.starts_at<=now())::int AS completed,count(*) FILTER(WHERE a.status='cancelled')::int AS cancelled,count(*) FILTER(WHERE a.status='no_show')::int AS no_show,
   COALESCE(sum(v.value) FILTER(WHERE a.status='done' AND a.starts_at<=now()),0)::float8 AS service_value_cents
   FROM professionals p JOIN appointments a ON a.tenant_id=p.tenant_id AND a.professional_id=p.id
   LEFT JOIN LATERAL (SELECT SUM(price_cents) AS value FROM appointment_services WHERE tenant_id=a.tenant_id AND appointment_id=a.id) v ON true
   WHERE p.tenant_id=$1 AND ${inPeriod('a.starts_at')} GROUP BY p.id,p.name ORDER BY completed DESC,p.name LIMIT 100`,parameters),
  pool.query(`SELECT status,count(*)::int AS count FROM appointments WHERE tenant_id=$1 AND ${inPeriod('starts_at')} GROUP BY status ORDER BY status`,parameters),
  pool.query(`SELECT ${productColumns} FROM business_products p WHERE p.tenant_id=$1 AND p.active AND p.stock_quantity<=p.min_stock ORDER BY p.stock_quantity,p.name,p.id LIMIT 100`,[company])
 ]);res.json({...period,sales:sales.rows[0],services:services.rows,products:products.rows,professionals:professionals.rows,appointments:appointments.rows,lowStock:lowStock.rows,financial:summary.totals});
});
router.get('/reports/export',permit('finance'),async(req,res)=>{
 const company=tenant(req),input=z.object({...dateQuery,kind:z.enum(['ledger','sales','stock'])}).strict().parse(req.query),period=await range(pool,company,input),parameters=[company,period.from,period.to,period.timezone];
 let rows:Record<string,unknown>[],columns:{key:string;title:string}[];
 if(input.kind==='ledger'){
  const result=await pool.query(`SELECT l.id,l.kind,l.amount_cents,l.payment_method,to_char(l.created_at AT TIME ZONE $4,'YYYY-MM-DD HH24:MI:SS') AS created_at,l.sale_id,l.expense_id,t.name AS tutor_name FROM business_ledger l LEFT JOIN business_sales s ON s.tenant_id=l.tenant_id AND s.id=l.sale_id LEFT JOIN tutors t ON t.tenant_id=s.tenant_id AND t.id=s.tutor_id WHERE l.tenant_id=$1 AND ${inPeriod('l.created_at')} ORDER BY l.created_at,l.id LIMIT 10001`,parameters);rows=result.rows;
  columns=[{key:'id',title:'ID'},{key:'created_at',title:'Data local'},{key:'kind',title:'Tipo'},{key:'amount_cents',title:'Valor em centavos'},{key:'payment_method',title:'Forma'},{key:'sale_id',title:'Comanda'},{key:'expense_id',title:'Despesa'},{key:'tutor_name',title:'Cliente'}];
 }else if(input.kind==='sales'){
  const result=await pool.query(`${saleSelect} WHERE s.tenant_id=$1 AND ${inPeriod('s.created_at')} ORDER BY s.created_at,s.id LIMIT 10001`,parameters);rows=result.rows;
  columns=[{key:'code',title:'Comanda'},{key:'created_at',title:'Data'},{key:'status',title:'Situação'},{key:'tutor_name',title:'Cliente'},{key:'total_cents',title:'Total em centavos'},{key:'paid_cents',title:'Recebido líquido em centavos'},{key:'balance_cents',title:'A receber em centavos'}];
 }else{
  const result=await pool.query(`SELECT ${movementColumns} ${movementJoins} WHERE m.tenant_id=$1 AND ${inPeriod('m.created_at')} ORDER BY m.created_at,m.id LIMIT 10001`,parameters);rows=result.rows;
  columns=[{key:'id',title:'ID'},{key:'created_at',title:'Data'},{key:'product_name',title:'Produto'},{key:'quantity_delta',title:'Quantidade'},{key:'balance_after',title:'Saldo'},{key:'reason',title:'Motivo'},{key:'note',title:'Observação'}];
 }
 ensure(rows.length<=10000,422,'O período excede 10.000 registros. Escolha um intervalo menor para exportar.');
 await recordAudit(pool,{tenantId:company,userId:req.access!.userId,action:'business.export',entityType:'report',metadata:{kind:input.kind,from:period.from,to:period.to,count:rows.length}});
 res.type('text/csv; charset=utf-8').setHeader('Content-Disposition',`attachment; filename="petcore-${input.kind}-${period.from}-${period.to}.csv"`);res.send(csv(rows,columns));
});

export default router;
