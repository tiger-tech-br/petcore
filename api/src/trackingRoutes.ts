import {Router,type Request} from 'express';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {auth,ensure,pool,sha,tenant,tx,type Db} from './core.js';
import {requireSubscriptionWrite} from './commercialService.js';
import {recordAudit} from './audit.js';
import {changeTaxiTripStatus} from './taxiDogService.js';
import {changeDeliveryStatus} from './deliveryRoutes.js';
import {driverAccess,getTransportJob,jobWithTracking,ownTransportJob,startTracking,stopJobTracking,stopTrackingSession,trackingCompany,trackingView,transportAccess,validTrackingSession,type TransportKind} from './trackingService.js';

export const trackingRouter=Router();const r=trackingRouter;
const kind=z.enum(['taxi','delivery']);
const coords=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),accuracy:z.number().min(0).max(10000),captured_at:z.iso.datetime({offset:true}),sequence:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)}).strict();
const administrator=(req:Request)=>ensure(req.access?.role==='admin',403,'Somente o responsável pode configurar os motoristas e a localização.');
const text=(min:number,max:number)=>z.string().trim().min(min).max(max).refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),'Remova caracteres de controle.');
async function rate(key:string,limit:number,db:Db=pool){
 const result=await db.query(`INSERT INTO auth_rate_limits(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET
  attempts=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempts+1 END,
  window_started=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN now() ELSE auth_rate_limits.window_started END RETURNING attempts`,[sha(key)]);
 ensure(result.rows[0].attempts<=limit,429,'Muitas atualizações. Aguarde alguns instantes.');
}
async function accountValid(db:Db,company:string,user:string){
 const userRow=await db.query("SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.active=true AND (m.role='admin' OR 'transport_driver'=ANY(m.permissions))",[company,user]);
 ensure(userRow.rowCount,422,'Escolha uma conta ativa desta empresa com acesso de motorista.');
}
async function settings(db:Db,company:string){return(await db.query('SELECT tracking_enabled,shop_address,shop_latitude,shop_longitude FROM tenants WHERE id=$1',[company])).rows[0];}
async function authorizedJob(req:Request,db:Db,company:string,which:TransportKind,id:string){
 const job=await getTransportJob(db,company,which,id),a=req.access!;
 if(!(job.driver_user_id===a.userId&&(a.role==='admin'||a.permissions.includes('transport_driver'))))await transportAccess(req,which);
 return job;
}
async function bearer(req:Request,db:Db=pool,lock=false){
 const id=z.uuid().parse(req.params.id),header=req.header('Authorization')??'',match=/^Bearer ([a-f0-9]{64})$/.exec(header);
 ensure(match,401,'Autorização de localização ausente ou inválida.');
 const found=await db.query('SELECT id FROM transport_tracking_sessions WHERE id=$1 AND upload_token_hash=$2',[id,sha(match[1])]);
 ensure(found.rowCount,410,'O compartilhamento de localização terminou.');
 await rate(`tracking-grant:${id}`,300,db);return validTrackingSession(db,id,lock);
}

// Device grants carry no cookies and authorize only this session's upload/stop.
r.post('/transport/tracking/:id/positions',async(req,res)=>{
 const input=coords.parse(req.body),captured=new Date(input.captured_at).getTime();
 ensure(captured>=Date.now()-120000&&captured<=Date.now()+30000,422,'A posição está antiga ou tem um horário inválido.');
 const result=await tx(async db=>{
  const session=await bearer(req,db,true);if(!session)return null;
  const previous=Number(session.sequence);
  if(input.sequence===previous){ensure(session.latitude===input.latitude&&session.longitude===input.longitude&&session.accuracy===input.accuracy&&new Date(session.captured_at).getTime()===captured,409,'Este número de atualização já foi utilizado.');return{ok:true,duplicate:true};}
  ensure(input.sequence>previous&&(!session.captured_at||captured>new Date(session.captured_at).getTime()),409,'A atualização chegou fora de ordem.');
  ensure(!session.received_at||Date.now()-new Date(session.received_at).getTime()>=5000,429,'Aguarde alguns segundos antes de atualizar novamente.');
  await db.query('UPDATE transport_tracking_sessions SET latitude=$2,longitude=$3,accuracy=$4,captured_at=$5,received_at=now(),sequence=$6 WHERE id=$1',[session.id,input.latitude,input.longitude,input.accuracy,input.captured_at,input.sequence]);
  return{ok:true};
 });ensure(result,410,'O compartilhamento de localização terminou.');res.json(result);
});
r.post('/transport/tracking/:id/heartbeat',async(req,res)=>{
 z.object({}).strict().parse(req.body??{});const session=await bearer(req);ensure(session,410,'O compartilhamento de localização terminou.');res.json({active:true,expires_at:new Date(session.expires_at).toISOString()});
});
r.post('/transport/tracking/:id/stop',async(req,res,next)=>{
 if(!req.header('Authorization'))return next();
 z.object({}).strict().parse(req.body??{});const session=await bearer(req);ensure(session,410,'O compartilhamento de localização terminou.');await stopTrackingSession(pool,session.id);res.json({ok:true});
});
r.get('/public/tracking/:token',async(req,res)=>{
 await rate(`tracking-public-ip:${req.ip??'unknown'}`,900);
 const token=z.string().regex(/^[a-f0-9]{48}$/).safeParse(req.params.token);ensure(token.success,404,'Acompanhamento indisponível.');
 const row=await pool.query('SELECT id,public_expires_at FROM transport_tracking_sessions WHERE public_token_hash=$1',[sha(token.data)]);
 ensure(row.rowCount,404,'Acompanhamento indisponível.');
 const session=await validTrackingSession(pool,row.rows[0].id);
 ensure(session&&row.rows[0].public_expires_at&&new Date(row.rows[0].public_expires_at).getTime()>Date.now(),410,'Este acompanhamento terminou.');
 const view=trackingView(session);res.json({status:view.status,position:view.position,updated_at:session.received_at?new Date(session.received_at).toISOString():null,expires_at:new Date(row.rows[0].public_expires_at).toISOString()});
});

r.get('/transport/settings',auth,async(req,res)=>{administrator(req);res.json(await settings(pool,tenant(req)));});
r.put('/transport/settings',auth,requireSubscriptionWrite,async(req,res)=>{
 administrator(req);const input=z.object({tracking_enabled:z.boolean(),shop_address:text(0,600),shop_latitude:z.number().min(-90).max(90).nullable(),shop_longitude:z.number().min(-180).max(180).nullable()}).strict()
  .refine(value=>(value.shop_latitude===null)===(value.shop_longitude===null),'Informe latitude e longitude juntas.').parse(req.body);
 const company=tenant(req),saved=await tx(async db=>{
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[company]);
  await db.query('UPDATE tenants SET tracking_enabled=$2,shop_address=$3,shop_latitude=$4,shop_longitude=$5 WHERE id=$1',[company,input.tracking_enabled,input.shop_address,input.shop_latitude,input.shop_longitude]);
  if(!input.tracking_enabled){const sessions=await db.query('SELECT id FROM transport_tracking_sessions WHERE tenant_id=$1 AND stopped_at IS NULL',[company]);for(const s of sessions.rows)await stopTrackingSession(db,s.id,'feature_disabled');}
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'tracking.settings.update',entityType:'tenant',entityId:company,metadata:{enabled:input.tracking_enabled}});return settings(db,company);
 });res.json(saved);
});
r.get('/transport/options',auth,async(req,res)=>{
 const company=tenant(req);administrator(req);
 const [drivers,users,config]=await Promise.all([pool.query('SELECT id,name,phone,active,user_id FROM taxi_drivers WHERE tenant_id=$1 ORDER BY active DESC,name,id',[company]),
  pool.query("SELECT u.id,u.name,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=$1 AND m.active=true AND(m.role='admin' OR 'transport_driver'=ANY(m.permissions)) ORDER BY u.name,u.id",[company]),settings(pool,company)]);
 res.json({drivers:drivers.rows,users:users.rows,settings:config});
});
r.get('/transport/drivers',auth,async(req,res)=>{
 const a=req.access!,company=tenant(req);ensure(a.role==='admin'||a.permissions.includes('taxi_dog')||a.permissions.includes('finance'),403,'Sem permissão para organizar motoristas.');
 const rows=await pool.query('SELECT id,name,phone,active,user_id FROM taxi_drivers WHERE tenant_id=$1 ORDER BY active DESC,name,id',[company]);res.json({items:rows.rows});
});
r.post('/transport/drivers',auth,requireSubscriptionWrite,async(req,res)=>{
 administrator(req);const company=tenant(req),input=z.object({name:text(2,160),phone:text(0,40).default(''),active:z.boolean().default(true),user_id:z.uuid().nullable().default(null)}).strict().parse(req.body);
 const row=await tx(async db=>{
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[company]);if(input.user_id)await accountValid(db,company,input.user_id);
  if(input.user_id)ensure(!(await db.query('SELECT 1 FROM taxi_drivers WHERE tenant_id=$1 AND user_id=$2',[company,input.user_id])).rowCount,409,'Esta conta já está vinculada a outro motorista.');
  const result=await db.query('INSERT INTO taxi_drivers(tenant_id,name,phone,active,user_id) VALUES($1,$2,$3,$4,$5) RETURNING id,name,phone,active,user_id',[company,input.name,input.phone,input.active,input.user_id]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'tracking.driver.create',entityType:'taxi_driver',entityId:result.rows[0].id});return result.rows[0];
 });res.status(201).json(row);
});
r.patch(['/transport/drivers/:id','/transport/drivers/:id/account'],auth,requireSubscriptionWrite,async(req,res)=>{
 administrator(req);const company=tenant(req),id=z.uuid().parse(req.params.id),input=z.object({name:text(2,160).optional(),phone:text(0,40).optional(),active:z.boolean().optional(),user_id:z.uuid().nullable().optional()}).strict().refine(value=>Object.keys(value).length>0).parse(req.body);
 const row=await tx(async db=>{
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[company]);
  const prior=await db.query('SELECT id,name,phone,active,user_id FROM taxi_drivers WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(prior.rowCount,404,'Motorista não encontrado.');const merged={...prior.rows[0],...input};
  if(merged.user_id)await accountValid(db,company,merged.user_id);
  if(merged.user_id)ensure(!(await db.query('SELECT 1 FROM taxi_drivers WHERE tenant_id=$1 AND user_id=$2 AND id<>$3',[company,merged.user_id,id])).rowCount,409,'Esta conta já está vinculada a outro motorista.');
  if(merged.active===false){const pending=await db.query("SELECT 1 FROM taxi_trips WHERE tenant_id=$1 AND driver_id=$2 AND status IN ('scheduled','en_route','with_pet') UNION ALL SELECT 1 FROM business_delivery_orders WHERE tenant_id=$1 AND driver_id=$2 AND status IN ('preparing','out_for_delivery') LIMIT 1",[company,id]);ensure(!pending.rowCount,409,'Reatribua ou conclua os transportes antes de desativar o motorista.');}
  if(merged.user_id!==prior.rows[0].user_id||merged.active===false){const active=await db.query('SELECT id FROM transport_tracking_sessions WHERE tenant_id=$1 AND driver_id=$2 AND stopped_at IS NULL',[company,id]);for(const s of active.rows)await stopTrackingSession(db,s.id,'driver_account_changed');}
  const result=await db.query('UPDATE taxi_drivers SET name=$3,phone=$4,active=$5,user_id=$6,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,name,phone,active,user_id',[company,id,merged.name,merged.phone,merged.active,merged.user_id]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'tracking.driver.update',entityType:'taxi_driver',entityId:id});return result.rows[0];
 });res.json(row);
});
r.patch('/transport/deliveries/:id/driver',auth,requireSubscriptionWrite,async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id),input=z.object({driver_id:z.uuid().nullable()}).strict().parse(req.body);await transportAccess(req,'delivery');
 await tx(async db=>{
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[company]);
  const row=await db.query('SELECT driver_id,status FROM business_delivery_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(row.rowCount,404,'Entrega não encontrada.');ensure(['preparing','out_for_delivery'].includes(row.rows[0].status),409,'Esta entrega já foi encerrada.');
  if(input.driver_id){const driver=await db.query('SELECT id FROM taxi_drivers WHERE tenant_id=$1 AND id=$2 AND active=true FOR UPDATE',[company,input.driver_id]);ensure(driver.rowCount,422,'Escolha um motorista ativo desta empresa.');}
  if(row.rows[0].driver_id!==input.driver_id)await stopJobTracking(db,company,'delivery',id,'driver_reassigned');
  await db.query('UPDATE business_delivery_orders SET driver_id=$3,updated_by=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2',[company,id,input.driver_id,req.access!.userId]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'tracking.delivery.assign',entityType:'delivery',entityId:id});
 });res.json(await jobWithTracking(pool,company,await getTransportJob(pool,company,'delivery',id),req.access!.userId));
});
r.get('/transport/my-jobs',auth,async(req,res)=>{
 const company=tenant(req);driverAccess(req);await trackingCompany(pool,company);
 const driver=await pool.query('SELECT id FROM taxi_drivers WHERE tenant_id=$1 AND user_id=$2 AND active=true',[company,req.access!.userId]);
 const timezone=(await pool.query('SELECT timezone FROM tenants WHERE id=$1',[company])).rows[0].timezone;
 if(!driver.rowCount)return res.json({items:[],timezone});
 const ids=await pool.query(`SELECT 'taxi' AS kind,t.id,t.starts_at AS at FROM taxi_trips t WHERE t.tenant_id=$1 AND t.driver_id=$2 AND t.status NOT IN ('completed','cancelled')
  UNION ALL SELECT 'delivery',d.id,d.created_at FROM business_delivery_orders d WHERE d.tenant_id=$1 AND d.driver_id=$2 AND d.status IN ('preparing','out_for_delivery') ORDER BY at,id LIMIT 100`,[company,driver.rows[0].id]);
 const items=[];for(const row of ids.rows){const job=await getTransportJob(pool,company,row.kind,row.id);if(job.available)items.push(await jobWithTracking(pool,company,job,req.access!.userId));}
 res.json({items,timezone});
});
r.get('/transport/jobs/:kind/:id',auth,async(req,res)=>{
 const company=tenant(req),which=kind.parse(req.params.kind),id=z.uuid().parse(req.params.id);await trackingCompany(pool,company);
 res.json(await jobWithTracking(pool,company,await authorizedJob(req,pool,company,which,id),req.access!.userId));
});
r.post('/transport/jobs/:kind/:id/start',auth,requireSubscriptionWrite,async(req,res)=>{
 z.object({consent:z.literal(true)}).strict().parse(req.body);const company=tenant(req),which=kind.parse(req.params.kind),id=z.uuid().parse(req.params.id);
 await rate(`tracking-start:${company}:${req.access!.userId}`,60);
 const result=await tx(db=>startTracking(db,req,company,which,id));res.status(201).json(result);
});
r.post('/transport/jobs/:kind/:id/status',auth,requireSubscriptionWrite,async(req,res)=>{
 const company=tenant(req),which=kind.parse(req.params.kind),id=z.uuid().parse(req.params.id),input=z.object({status:z.string().max(30),expected_status:z.string().max(30)}).strict().parse(req.body);
 await tx(async db=>{
  await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[company]);
  await trackingCompany(db,company);const job=await ownTransportJob(req,db,company,which,id);
  ensure(job.status===input.expected_status&&job.next_status===input.status,409,'Escolha a próxima etapa disponível deste transporte.');
  if(which==='taxi')await changeTaxiTripStatus(db,company,id,input,req.access!.userId,req.access!.userId);
  else{await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[company]);await changeDeliveryStatus(db,company,id,{...input,reason:''},req.access!.userId);}
 });res.json(await jobWithTracking(pool,company,await getTransportJob(pool,company,which,id),req.access!.userId));
});
r.post('/transport/tracking/:id/stop',auth,async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id),found=await pool.query('SELECT kind,taxi_trip_id,delivery_id,user_id FROM transport_tracking_sessions WHERE tenant_id=$1 AND id=$2',[company,id]);
 ensure(found.rowCount,404,'Compartilhamento não encontrado.');const s=found.rows[0];
 if(s.user_id!==req.access!.userId)await transportAccess(req,s.kind);
 await stopTrackingSession(pool,id);res.json({ok:true});
});
r.post('/transport/tracking/:id/share',auth,requireSubscriptionWrite,async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id);
 await rate(`tracking-share:${company}:${req.access!.userId}`,120);
 const result=await tx(async db=>{
  const found=await db.query('SELECT kind FROM transport_tracking_sessions WHERE tenant_id=$1 AND id=$2',[company,id]);ensure(found.rowCount,404,'Compartilhamento não encontrado.');await transportAccess(req,found.rows[0].kind);
  const session=await validTrackingSession(db,id,true);if(!session)return null;
  const token=randomBytes(24).toString('hex');await db.query('UPDATE transport_tracking_sessions SET public_token_hash=$2,public_expires_at=expires_at WHERE id=$1',[id,sha(token)]);
  const path=`/acompanhar/${token}`;await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'tracking.share.rotate',entityType:'tracking_session',entityId:id});
  return{token,path,link:`${process.env.APP_ORIGIN??''}${path}`,expires_at:new Date(session.expires_at).toISOString()};
 });ensure(result,410,'Este compartilhamento terminou.');res.json(result);
});
export default r;
