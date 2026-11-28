import {stopJobTracking} from './trackingService.js';
import {Router} from 'express';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {auth,ensure,permit,pool,tenant,type Db} from './core.js';
import {requireSubscriptionWrite} from './commercialService.js';
import {cancelSale,cents,createSale,idempotency,mutate,pageQuery} from './businessService.js';

const r=Router();r.use(auth,async(req,_res,next)=>{
 try{
  const company=await pool.query('SELECT delivery_enabled,operation_mode FROM tenants WHERE id=$1',[tenant(req)]);
  ensure(company.rows[0]?.delivery_enabled===true&&company.rows[0]?.operation_mode==='complete',404,'Entregas indisponíveis para este pet shop.');next();
 }catch(failure){next(failure);}
},requireSubscriptionWrite);
const cleanText=(min:number,max:number,multiline=false)=>z.string().trim().min(min).max(max).refine(value=>!(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(value),'Remova caracteres de controle.');
const phone=z.string().trim().max(40).transform(value=>value.replace(/[\s().-]/g,''))
 .refine(value=>/^\+?\d{10,15}$/.test(value),'Informe telefone com DDD.');
const draft=z.object({tutor_id:z.uuid(),address:cleanText(1,600,true),phone,reference:cleanText(0,300,true).default(''),notes:cleanText(0,2000,true).default(''),
 items:z.array(z.object({product_id:z.uuid(),quantity:z.number().int().min(1).max(1000000)}).strict()).min(1).max(100)
  .refine(items=>new Set(items.map(item=>item.product_id)).size===items.length,'Não repita o mesmo produto.'),
 delivery_fee_cents:cents.default(0),due_date:z.iso.date()}).strict();
export type DeliveryCreateInput={tutor_id:string;address:string;phone:string;reference?:string;notes?:string;items:{product_id:string;quantity:number}[];delivery_fee_cents?:number;due_date:string};

/** Creates the sale, stock movement and delivery in the caller's transaction. */
export async function createDelivery(db:PoolClient,company:string,user:string,raw:DeliveryCreateInput):Promise<{id:string}>{
 const input=draft.parse(raw);
 const created=await createSale(db,company,user,{tutor_id:input.tutor_id,appointment_id:null,
  items:input.items.map(item=>({kind:'product' as const,...item})),discount_cents:0,due_date:input.due_date,notes:'',delivery_fee_cents:input.delivery_fee_cents});
 const row=await db.query(`INSERT INTO business_delivery_orders(tenant_id,sale_id,address,phone,reference,notes,created_by,updated_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,[company,created.id,input.address,input.phone,input.reference,input.notes,user]);
 const id=row.rows[0].id as string;
 await db.query("INSERT INTO business_delivery_events(tenant_id,delivery_id,new_status,actor_user_id) VALUES($1,$2,'preparing',$3)",[company,id,user]);
 return{id};
}

const select=`SELECT d.id,upper(left(d.id::text,8)) AS code,d.sale_id,upper(left(s.id::text,8)) AS sale_code,
 s.tutor_id,t.name AS tutor_name,d.phone AS tutor_phone,d.phone,d.address,d.reference,d.notes,d.status,s.status AS sale_status,
 s.delivery_fee_cents,s.subtotal_cents,s.discount_cents,s.total_cents,COALESCE(p.paid_cents,0)::float8 AS paid_cents,
 CASE WHEN s.status='cancelled' THEN 0 ELSE s.total_cents-COALESCE(p.paid_cents,0) END::float8 AS balance_cents,
 s.due_date::text,d.created_at,d.updated_at,d.out_for_delivery_at,d.delivered_at,d.cancelled_at,d.cancellation_reason,
 COALESCE(i.items,'[]'::json) AS items,company.timezone
 FROM business_delivery_orders d JOIN business_sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id
 JOIN tenants company ON company.id=d.tenant_id LEFT JOIN tutors t ON t.tenant_id=s.tenant_id AND t.id=s.tutor_id
 LEFT JOIN LATERAL (SELECT SUM(CASE WHEN kind='sale_payment' THEN amount_cents ELSE -amount_cents END) AS paid_cents
  FROM business_ledger WHERE tenant_id=s.tenant_id AND sale_id=s.id) p ON true
 LEFT JOIN LATERAL (SELECT json_agg(json_build_object('id',id,'product_id',product_id,'description',description,'quantity',quantity,
  'unit_price_cents',unit_price_cents,'total_cents',total_cents) ORDER BY id) AS items FROM business_sale_items
  WHERE tenant_id=s.tenant_id AND sale_id=s.id AND kind='product') i ON true`;
export async function deliveryResult(db:Db,company:string,id:string){
 const row=await db.query(`${select} WHERE d.tenant_id=$1 AND d.id=$2`,[company,id]);ensure(row.rowCount,404,'Entrega não encontrada.');return row.rows[0];
}

r.get('/options',permit('finance'),async(req,res)=>{
 const company=tenant(req),[tutors,products,settings]=await Promise.all([
  pool.query('SELECT id,name,phone FROM tutors WHERE tenant_id=$1 AND anonymized_at IS NULL ORDER BY name,id LIMIT 1000',[company]),
  pool.query('SELECT id,name,sku,unit,price_cents,stock_quantity FROM business_products WHERE tenant_id=$1 AND active=true ORDER BY name,id LIMIT 1000',[company]),
  pool.query('SELECT timezone FROM tenants WHERE id=$1',[company])
 ]);res.json({tutors:tutors.rows,products:products.rows,timezone:settings.rows[0].timezone});
});
r.get('/',permit('finance'),async(req,res)=>{
 const company=tenant(req),input=z.object({...pageQuery,status:z.enum(['active','all','preparing','out_for_delivery','delivered','cancelled']).default('active'),q:cleanText(0,100).default('')}).strict().parse(req.query);
 const result=await pool.query(`WITH filtered AS (${select} WHERE d.tenant_id=$1
  AND ($2='all' OR ($2='active' AND d.status IN ('preparing','out_for_delivery')) OR d.status=$2)
  AND ($3='' OR strpos(lower(COALESCE(t.name,'')),lower($3))>0 OR strpos(lower(d.id::text),lower($3))>0
   OR strpos(lower(s.id::text),lower($3))>0 OR strpos(d.phone,$3)>0))
  SELECT COALESCE((SELECT json_agg(r) FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT $4 OFFSET $5) r),'[]'::json) AS items,
  (SELECT count(*)::int FROM filtered) AS total`,[company,input.status,input.q,input.page_size,(input.page-1)*input.page_size]);
 res.json({...result.rows[0],page:input.page,pageSize:input.page_size});
});
r.get('/:id',permit('finance'),async(req,res)=>res.json(await deliveryResult(pool,tenant(req),z.uuid().parse(req.params.id))));
r.post('/',permit('finance'),async(req,res)=>{
 const input=draft.extend({idempotency_key:idempotency}).parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.delivery.create',input,async(db,company,user)=>{
  const {idempotency_key:_,...data}=input;return createDelivery(db,company,user,data);
 });res.status(201).json(await deliveryResult(pool,tenant(req),ref.id!));
});
r.post('/:id/status',permit('finance'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({status:z.enum(['out_for_delivery','delivered','cancelled']),reason:cleanText(0,1000,true).default(''),idempotency_key:idempotency}).strict()
  .refine(value=>value.status!=='cancelled'||value.reason.length>=3,'Informe o motivo do cancelamento.').parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'business.delivery.status',{id,...input},async(db,company,user)=>{
  return changeDeliveryStatus(db,company,id,input,user);
 });res.json(await deliveryResult(pool,tenant(req),ref.id!));
});

export default r;

export async function changeDeliveryStatus(db:PoolClient,company:string,id:string,input:{status:string;reason:string;expected_status?:string},user:string){
  const row=await db.query('SELECT id,sale_id,status,driver_id FROM business_delivery_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(row.rowCount,404,'Entrega não encontrada.');
  const order=row.rows[0];if(input.expected_status)ensure(order.status===input.expected_status,409,'A situação desta entrega mudou. Atualize a tela antes de continuar.');if(order.status===input.status)return{id};
  ensure(!['delivered','cancelled'].includes(order.status),409,'Esta entrega já foi encerrada.');
  if(input.status==='cancelled'){
   await cancelSale(db,company,user,order.sale_id,input.reason);return{id};
  }
  if(input.status==='out_for_delivery'&&order.driver_id){
   await db.query('SELECT id FROM taxi_drivers WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,order.driver_id]);
   const busy=await db.query("SELECT 1 FROM taxi_trips WHERE tenant_id=$1 AND driver_id=$2 AND status IN ('en_route','with_pet') UNION ALL SELECT 1 FROM business_delivery_orders WHERE tenant_id=$1 AND driver_id=$2 AND id<>$3 AND status='out_for_delivery' LIMIT 1",[company,order.driver_id,id]);ensure(!busy.rowCount,409,'Este motorista ainda está em outro transporte. Finalize a viagem anterior antes de iniciar outra.');
  }
  const expected=input.status==='out_for_delivery'?'preparing':'out_for_delivery';ensure(order.status===expected,409,'Confirme a saída antes de registrar a entrega.');
  const sale=await db.query('SELECT status FROM business_sales WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,order.sale_id]);ensure(sale.rows[0]?.status!=='cancelled',409,'Esta comanda foi cancelada.');
  await db.query(`UPDATE business_delivery_orders SET status=$3,updated_by=$4,updated_at=now(),
   out_for_delivery_at=CASE WHEN $3='out_for_delivery' THEN now() ELSE out_for_delivery_at END,
   delivered_at=CASE WHEN $3='delivered' THEN now() ELSE delivered_at END WHERE tenant_id=$1 AND id=$2`,[company,id,input.status,user]);
  await db.query('INSERT INTO business_delivery_events(tenant_id,delivery_id,old_status,new_status,reason,actor_user_id) VALUES($1,$2,$3,$4,$5,$6)',[company,id,order.status,input.status,input.reason,user]);
  if(input.status==='delivered')await stopJobTracking(db,company,'delivery',id);
  return{id};

}
