import {Router,type Request,type RequestHandler} from 'express';
import {createHmac,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {auth,ensure,permit,pool,tenant,tx,type Db} from './core.js';
import {subscription,requireSubscriptionWrite} from './commercialService.js';
import {cents,mutate} from './businessService.js';
import {recordAudit} from './audit.js';
import {createDelivery,deliveryResult} from './deliveryRoutes.js';

export const publicDeliveryRouter=Router();
const r=publicDeliveryRouter;
const token=z.string().regex(/^[a-f0-9]{48}$/);
const text=(min:number,max:number,multiline=false)=>z.string().trim().min(min).max(max).refine(value=>!(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(value),'Remova caracteres de controle.');
const phone=z.string().trim().max(40).transform(value=>value.replace(/[\s().-]/g,''))
 .refine(value=>/^\+?\d{10,15}$/.test(value),'Informe telefone com DDD.');
const items=z.array(z.object({product_id:z.uuid(),quantity:z.number().int().min(1).max(1000)}).strict()).min(1).max(20)
 .refine(rows=>new Set(rows.map(row=>row.product_id)).size===rows.length,'Não repita produtos.');
const fingerprint=(value:string)=>createHmac('sha256',process.env.SESSION_SECRET!).update(value).digest('hex');
const administrator:RequestHandler=(req,_res,next)=>{try{ensure(req.access?.role==='admin',403,'Somente o responsável pode configurar o catálogo.');next();}catch(error){next(error);}};
const notice='Seu pedido será conferido pelo pet shop. A entrega, a disponibilidade e o pagamento serão confirmados no contato informado.';
async function rate(key:string,limit:number){
 const found=await pool.query(`INSERT INTO auth_rate_limits(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET
  attempts=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempts+1 END,
  window_started=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN now() ELSE auth_rate_limits.window_started END RETURNING attempts`,[fingerprint(key)]);
 ensure(found.rows[0].attempts<=limit,429,'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}
r.use('/public/delivery',async(req,_res,next)=>{try{await rate(`public-delivery:ip:${req.ip??'unknown'}`,300);next();}catch(error){next(error);}});
async function throttle(req:Request,company:string,write:boolean){
 await rate(`public-delivery:${write?'write':'read'}:${req.ip??'unknown'}:${company}`,write?8:120);
 await rate(`public-delivery:company:${write?'write':'read'}:${company}`,write?100:1200);
}
async function publicShop(raw:unknown,db:Db=pool,lock=false){
 const parsed=token.safeParse(raw);ensure(parsed.success,404,'Catálogo indisponível.');
 const sql=`SELECT t.id,t.name,t.timezone,s.coverage_note,s.notice,s.delivery_fee_cents FROM public_delivery_settings s
  JOIN tenants t ON t.id=s.tenant_id WHERE s.public_token=$1 AND s.enabled=true AND t.active=true
   AND t.delivery_enabled=true AND t.operation_mode='complete'`;
 let found=await db.query(sql,[parsed.data]);
 ensure(found.rowCount,404,'Catálogo indisponível.');
 if(lock){
  // Settings and commercial commands lock the tenant first as well.
  await deliveryAvailable(found.rows[0].id,db,true);
  found=await db.query(sql+' FOR SHARE OF s',[parsed.data]);
 }
 ensure(found.rowCount,404,'Catálogo indisponível.');const current=await subscription(found.rows[0].id,db);
 ensure(current?.writable===true,404,'Catálogo indisponível.');return found.rows[0];
}
async function configuration(company:string,db:Db=pool){
 await db.query('INSERT INTO public_delivery_settings(tenant_id) VALUES($1) ON CONFLICT DO NOTHING',[company]);
 const result=await db.query(`SELECT s.enabled,s.public_token AS token,s.coverage_note,s.notice,s.delivery_fee_cents,s.updated_at,
  t.delivery_enabled,t.operation_mode FROM public_delivery_settings s JOIN tenants t ON t.id=s.tenant_id WHERE s.tenant_id=$1`,[company]);
 const row=result.rows[0],current=await subscription(company,db),path=`/loja/${row.token}`;
 return {...row,link:`${process.env.APP_ORIGIN??''}${path}`,subscription_writable:current?.writable===true,confirmation_notice:notice};
}
async function deliveryAvailable(company:string,db:Db=pool,lock=false){
 const result=await db.query(`SELECT active,delivery_enabled,operation_mode FROM tenants WHERE id=$1 ${lock?'FOR SHARE':''}`,[company]);
 const shop=result.rows[0];ensure(shop?.active===true&&shop.delivery_enabled===true&&shop.operation_mode==='complete',404,'Entregas indisponíveis para este pet shop.');
}
const deliveryAccess:RequestHandler=async(req,_res,next)=>{try{await deliveryAvailable(tenant(req));next();}catch(error){next(error);}};
r.get('/public/delivery/:token',async(req,res)=>{
 const shop=await publicShop(req.params.token);await throttle(req,shop.id,false);
 const query=z.object({q:z.string().trim().max(100).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().parse(req.query);
 const products=await pool.query(`SELECT id,name,unit,price_cents,stock_quantity>0 AS available,count(*) OVER()::int AS total
  FROM business_products WHERE tenant_id=$1 AND active=true AND public_catalog_visible=true AND ($2::text='' OR strpos(lower(name),lower($2))>0)
  ORDER BY lower(name),id LIMIT 24 OFFSET $3`,[shop.id,query.q,(query.page-1)*24]);
 const total=products.rowCount?products.rows[0].total:(await pool.query("SELECT count(*)::int AS n FROM business_products WHERE tenant_id=$1 AND active=true AND public_catalog_visible=true AND ($2::text='' OR strpos(lower(name),lower($2))>0)",[shop.id,query.q])).rows[0].n;
 res.json({businessName:shop.name,coverage_note:shop.coverage_note,notice:shop.notice,delivery_fee_cents:shop.delivery_fee_cents,
  confirmation_notice:notice,products:products.rows.map(({total:_,...product})=>product),total,page:query.page,page_size:24});
});
r.post('/public/delivery/:token/requests',async(req,res)=>{
 const shop=await publicShop(req.params.token);await throttle(req,shop.id,true);
 const input=z.object({customer_name:text(2,160),phone,address:text(8,600,true),reference:text(0,300,true).default(''),notes:text(0,1000,true).default(''),items,
  idempotency_key:z.uuid(),website:z.string().max(200).default('')}).strict().parse(req.body);
 ensure(!input.website,422,'Não foi possível enviar o pedido.');
 const hash=fingerprint(JSON.stringify({...input,idempotency_key:undefined,website:undefined}));
 const receipt=await tx(async db=>{
  const currentShop=await publicShop(req.params.token,db,true);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`public-delivery:${shop.id}:${input.idempotency_key}`]);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`public-delivery:pending-cap:${shop.id}`]);
  const prior=await db.query('SELECT receipt,payload_hash FROM public_delivery_requests WHERE tenant_id=$1 AND idempotency_key=$2',[shop.id,input.idempotency_key]);
  if(prior.rowCount){ensure(prior.rows[0].payload_hash===hash,409,'Este envio já foi usado com outros dados. Atualize o formulário.');return prior.rows[0].receipt;}
  const pending=await db.query("SELECT count(*)::int AS n FROM public_delivery_requests WHERE tenant_id=$1 AND status='pending'",[shop.id]);
  ensure(pending.rows[0].n<200,429,'O pet shop está recebendo muitos pedidos. Tente novamente mais tarde.');
  const selected=await db.query('SELECT id,name,unit,price_cents,stock_quantity FROM business_products WHERE tenant_id=$1 AND active=true AND public_catalog_visible=true AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE',[shop.id,input.items.map(item=>item.product_id)]);
  ensure(selected.rowCount===input.items.length,422,'Um produto não está mais disponível. Atualize o catálogo.');
  const lines=input.items.map((item,index)=>{const product=selected.rows.find(row=>row.id===item.product_id)!;ensure(product.stock_quantity>=item.quantity,409,`Confira a quantidade disponível de ${product.name}.`);return {...product,quantity:item.quantity,position:index+1};});
  const subtotal=lines.reduce((sum,item)=>sum+item.quantity*item.price_cents,0);cents.parse(subtotal);cents.parse(subtotal+(currentShop.delivery_fee_cents??0));
  const row=await db.query(`INSERT INTO public_delivery_requests(tenant_id,idempotency_key,payload_hash,customer_name,phone,address,reference,notes,subtotal_cents,quoted_delivery_fee_cents)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,receipt`,[shop.id,input.idempotency_key,hash,input.customer_name,input.phone,input.address,input.reference,input.notes,subtotal,currentShop.delivery_fee_cents]);
  for(const line of lines)await db.query(`INSERT INTO public_delivery_request_items(tenant_id,request_id,product_id,position,name,unit,quantity,unit_price_cents)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[shop.id,row.rows[0].id,line.id,line.position,line.name,line.unit,line.quantity,line.price_cents]);
  return row.rows[0].receipt;
 });res.status(201).json({ok:true,receipt,status:'pending',message:notice});
});
r.get('/public-delivery/settings',auth,administrator,async(req,res)=>res.json(await configuration(tenant(req))));
r.put('/public-delivery/settings',auth,administrator,requireSubscriptionWrite,async(req,res)=>{
 const company=tenant(req),input=z.object({enabled:z.boolean(),coverage_note:text(0,600,true).default(''),notice:text(0,600,true).default(''),delivery_fee_cents:cents.nullable().default(null),rotate_token:z.boolean().default(false)}).strict().parse(req.body);
 const result=await tx(async db=>{
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR SHARE',[company]);
  const current=await configuration(company,db);if(input.enabled)ensure(current.delivery_enabled&&current.operation_mode==='complete',409,'Ative as entregas nas Configurações do pet shop.');
  await db.query(`UPDATE public_delivery_settings SET enabled=$2,coverage_note=$3,notice=$4,delivery_fee_cents=$5,
   public_token=CASE WHEN $6 THEN $7 ELSE public_token END,updated_by=$8,updated_at=now() WHERE tenant_id=$1`,[company,input.enabled,input.coverage_note,input.notice,input.delivery_fee_cents,input.rotate_token,randomBytes(24).toString('hex'),req.access!.userId]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'public_delivery.settings.update',entityType:'public_delivery',metadata:{enabled:input.enabled,linkRotated:input.rotate_token}});
  return configuration(company,db);
 });res.json(result);
});
const operator=[auth,permit('finance'),deliveryAccess];
r.get('/deliveries/public-requests',...operator,async(req,res)=>{
 const company=tenant(req),query=z.object({status:z.enum(['pending','all']).default('pending')}).strict().parse(req.query);
 const rows=await pool.query(`SELECT r.id,r.receipt,r.status,r.customer_name,r.phone,r.address,r.reference,r.notes,r.subtotal_cents,r.quoted_delivery_fee_cents,
  r.delivery_order_id,r.rejection_reason,r.created_at,r.reviewed_at,
  COALESCE((SELECT json_agg(json_build_object('product_id',i.product_id,'name',i.name,'unit',i.unit,'quantity',i.quantity,'unit_price_cents',i.unit_price_cents) ORDER BY i.position)
   FROM public_delivery_request_items i WHERE i.tenant_id=r.tenant_id AND i.request_id=r.id),'[]'::json) AS items
  FROM public_delivery_requests r WHERE r.tenant_id=$1 AND ($2::text='all' OR r.status=$2) ORDER BY r.created_at DESC,r.id LIMIT 100`,[company,query.status]);
 res.json({items:rows.rows});
});
r.post('/deliveries/public-requests/:id/confirm',...operator,requireSubscriptionWrite,async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({idempotency_key:z.uuid(),tutor_id:z.uuid().optional(),delivery_fee_cents:cents.optional(),due_date:z.iso.date().optional()}).strict().parse(req.body);
 const ref=await mutate(req,input.idempotency_key,'delivery.public.confirm',{id,...input},async(db,company,user)=>{
  await deliveryAvailable(company,db);
  ensure((await subscription(company,db))?.writable===true,402,'Regularize o acesso para confirmar pedidos de entrega.');
  const request=(await db.query("SELECT * FROM public_delivery_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[company,id])).rows[0];
  ensure(request,404,'Pedido não encontrado.');ensure(request.status==='pending',409,'Este pedido já foi conferido.');
  const lines=(await db.query('SELECT * FROM public_delivery_request_items WHERE tenant_id=$1 AND request_id=$2 ORDER BY position',[company,id])).rows;
  const products=await db.query('SELECT id,price_cents,active,public_catalog_visible FROM business_products WHERE tenant_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',[company,lines.map(line=>line.product_id)]);
  ensure(products.rowCount===lines.length&&lines.every(line=>products.rows.some(product=>product.id===line.product_id&&product.active&&product.public_catalog_visible&&product.price_cents===line.unit_price_cents)),409,'Os produtos ou preços mudaram. Combine a atualização com o cliente e registre um novo pedido.');
  const fee=input.delivery_fee_cents??request.quoted_delivery_fee_cents;ensure(fee!==null,422,'Combine e informe a taxa de entrega, inclusive zero quando gratuita.');
  if(request.quoted_delivery_fee_cents!==null)ensure(fee===request.quoted_delivery_fee_cents,409,'A taxa deve ser a informada ao cliente no pedido.');
  let tutorId=input.tutor_id;
  if(!tutorId)tutorId=(await db.query('INSERT INTO tutors(tenant_id,name,phone) VALUES($1,$2,$3) RETURNING id',[company,request.customer_name,request.phone])).rows[0].id;
  const day=(await db.query("SELECT to_char(now() AT TIME ZONE timezone,'YYYY-MM-DD') AS day FROM tenants WHERE id=$1",[company])).rows[0].day;
  const created=await createDelivery(db,company,user,{tutor_id:tutorId!,address:request.address,phone:request.phone,reference:request.reference,notes:request.notes,
   items:lines.map(line=>({product_id:line.product_id,quantity:line.quantity})),delivery_fee_cents:fee,due_date:input.due_date??day});
  await db.query("UPDATE public_delivery_requests SET status='confirmed',delivery_order_id=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",[company,id,created.id,user]);return created;
 });res.status(201).json(await deliveryResult(pool,tenant(req),ref.id!));
});
r.post('/deliveries/public-requests/:id/reject',...operator,requireSubscriptionWrite,async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id),input=z.object({reason:text(2,300,true)}).strict().parse(req.body);
 await tx(async db=>{
  await deliveryAvailable(company,db,true);
  ensure((await subscription(company,db))?.writable===true,402,'Regularize o acesso para conferir pedidos de entrega.');
  const current=await db.query('SELECT status FROM public_delivery_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);
  ensure(current.rowCount,404,'Pedido não encontrado.');ensure(current.rows[0].status==='pending',409,'O pedido não está mais pendente.');
  await db.query("UPDATE public_delivery_requests SET status='rejected',rejection_reason=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2",[company,id,input.reason,req.access!.userId]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'delivery.public.reject',entityType:'public_delivery_request',entityId:id});
 });
 res.json({ok:true});
});
r.delete('/deliveries/public-requests/:id',auth,administrator,async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id);
 await tx(async db=>{const row=await db.query('DELETE FROM public_delivery_requests WHERE tenant_id=$1 AND id=$2 RETURNING id',[company,id]);ensure(row.rowCount,404,'Pedido não encontrado.');await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'delivery.public.delete',entityType:'public_delivery_request',entityId:id});});res.json({ok:true});
});
