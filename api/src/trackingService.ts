import {randomBytes} from 'node:crypto';
import type {Request} from 'express';
import type {PoolClient} from 'pg';
import {ensure,pool,sha,type Db} from './core.js';
import {subscription} from './commercialService.js';

export type TransportKind='taxi'|'delivery';
export type TransportJob={kind:TransportKind;id:string;label:string;status:string;driver_id:string|null;driver_name:string|null;driver_user_id:string|null;
 driver_active:boolean;address:string;reference:string;destination:{address:string;latitude:number|null;longitude:number|null};active:boolean;available:boolean;
 next_status:string|null;next_label:string|null;timezone:string;tracking?:unknown;can_start?:boolean};
const clearPosition="latitude=NULL,longitude=NULL,accuracy=NULL,captured_at=NULL,received_at=NULL,upload_token_hash=NULL,public_token_hash=NULL,public_expires_at=NULL";
export async function stopJobTracking(db:Db,company:string,kind:TransportKind,id:string,reason='job_ended'){
 return db.query(`UPDATE transport_tracking_sessions SET stopped_at=COALESCE(stopped_at,now()),stop_reason=COALESCE(stop_reason,$4),${clearPosition}
 WHERE tenant_id=$1 AND kind=$2 AND CASE WHEN kind='taxi' THEN taxi_trip_id ELSE delivery_id END=$3`,[company,kind,id,reason]);
}
export async function stopUserTracking(db:Db,user:string,company?:string|null){
 return db.query(`UPDATE transport_tracking_sessions SET stopped_at=COALESCE(stopped_at,now()),stop_reason='account_logout',${clearPosition}
  WHERE user_id=$1 AND ($2::uuid IS NULL OR tenant_id=$2)`,[user,company??null]);
}
export async function stopSessionTracking(db:Db,sid:string){
 return db.query(`UPDATE transport_tracking_sessions SET stopped_at=COALESCE(stopped_at,now()),stop_reason='login_session_ended',${clearPosition} WHERE auth_session_id=$1`,[sid]);
}
export async function stopTrackingSession(db:Db,id:string,reason='driver_stopped'){
 await db.query(`UPDATE transport_tracking_sessions SET stopped_at=COALESCE(stopped_at,now()),stop_reason=COALESCE(stop_reason,$2),${clearPosition} WHERE id=$1`,[id,reason]);
}
export async function transportAccess(req:Request,kind:TransportKind){
 const a=req.access!;ensure(a.role==='admin'||a.permissions.includes(kind==='taxi'?'taxi_dog':'finance'),403,'Sem permissão para organizar este transporte.');
}
export function driverAccess(req:Request){const a=req.access!;ensure(a.role==='admin'||a.permissions.includes('transport_driver'),403,'Sem acesso à área do motorista.');}
export async function getTransportJob(db:Db,company:string,kind:TransportKind,id:string):Promise<TransportJob>{
 if(kind==='taxi'){
  const result=await db.query(`SELECT t.id,t.status,t.leg,t.driver_id,d.name AS driver_name,d.user_id,d.active AS driver_active,
   b.address,b.reference,b.cancelled_at,b.mode,tnt.taxi_dog_enabled,tnt.timezone,tnt.shop_address,tnt.shop_latitude,tnt.shop_longitude,
   p.name AS pet_name FROM taxi_trips t JOIN taxi_bookings b ON b.tenant_id=t.tenant_id AND b.id=t.booking_id
   JOIN appointments a ON a.tenant_id=b.tenant_id AND a.id=b.appointment_id JOIN pets p ON p.tenant_id=a.tenant_id AND p.id=a.pet_id
   JOIN taxi_drivers d ON d.tenant_id=t.tenant_id AND d.id=t.driver_id JOIN tenants tnt ON tnt.id=t.tenant_id
   WHERE t.tenant_id=$1 AND t.id=$2`,[company,id]);
  ensure(result.rowCount,404,'Transporte não encontrado.');const row=result.rows[0];
  const toShop=row.leg==='pickup'&&row.status==='with_pet';
  const next=row.leg==='pickup'?{scheduled:['en_route','Iniciar busca'],en_route:['with_pet','Pet com o motorista'],with_pet:['completed','Concluir chegada']}:{scheduled:['with_pet','Iniciar entrega do pet'],with_pet:['completed','Concluir entrega']};
  const action=(next as Record<string,string[]>)[row.status];
  return {kind,id,label:`${row.leg==='pickup'?'Busca':'Entrega'} de ${row.pet_name}`,status:row.status,driver_id:row.driver_id,driver_name:row.driver_name,driver_user_id:row.user_id,
   driver_active:row.driver_active,address:row.address,reference:row.reference,timezone:row.timezone,
   destination:{address:toShop?row.shop_address:row.address,latitude:toShop?row.shop_latitude:null,longitude:toShop?row.shop_longitude:null},
   active:['en_route','with_pet'].includes(row.status),available:row.taxi_dog_enabled&&!row.cancelled_at&&(row.mode==='round_trip'||row.mode===row.leg),
   next_status:action?.[0]??null,next_label:action?.[1]??null};
 }
 const found=await db.query(`SELECT d.id,d.status,d.driver_id,dr.name AS driver_name,dr.user_id,dr.active AS driver_active,d.address,d.reference,
  t.delivery_enabled,t.operation_mode,t.timezone,s.status AS sale_status FROM business_delivery_orders d
  JOIN tenants t ON t.id=d.tenant_id JOIN business_sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id
  LEFT JOIN taxi_drivers dr ON dr.tenant_id=d.tenant_id AND dr.id=d.driver_id WHERE d.tenant_id=$1 AND d.id=$2`,[company,id]);
 ensure(found.rowCount,404,'Entrega não encontrada.');const row=found.rows[0];
 return {kind,id,label:`Entrega ${id.slice(0,8).toUpperCase()}`,status:row.status,driver_id:row.driver_id,driver_name:row.driver_name,driver_user_id:row.user_id,
  driver_active:row.driver_active===true,address:row.address,reference:row.reference,timezone:row.timezone,destination:{address:row.address,latitude:null,longitude:null},
  active:row.status==='out_for_delivery',available:row.delivery_enabled&&row.operation_mode==='complete'&&row.sale_status!=='cancelled',
  next_status:row.status==='preparing'?'out_for_delivery':row.status==='out_for_delivery'?'delivered':null,
  next_label:row.status==='preparing'?'Registrar saída':row.status==='out_for_delivery'?'Confirmar entrega':null};
}
export async function trackingCompany(db:Db,company:string){
 const row=(await db.query('SELECT tracking_enabled,active FROM tenants WHERE id=$1',[company])).rows[0];
 ensure(row?.active&&row.tracking_enabled,404,'Localização indisponível para este pet shop.');
 const current=await subscription(company,db);ensure(current?.writable===true,402,'Regularize a assinatura para usar o acompanhamento.');
}
export async function ownTransportJob(req:Request,db:Db,company:string,kind:TransportKind,id:string){
 driverAccess(req);const job=await getTransportJob(db,company,kind,id);
 ensure(job.available&&job.driver_active&&job.driver_user_id===req.access!.userId,404,'Transporte não atribuído a esta conta.');return job;
}
export function trackingView(row:any){
 if(!row||row.stopped_at||new Date(row.expires_at).getTime()<=Date.now())return {active:false,status:'ended',position:null};
 const position=row.latitude===null?null:{latitude:row.latitude,longitude:row.longitude,accuracy:row.accuracy,captured_at:new Date(row.captured_at).toISOString(),received_at:new Date(row.received_at).toISOString()};
 const stale=position&&Math.max(Date.now()-new Date(row.received_at).getTime(),Date.now()-new Date(row.captured_at).getTime())>90000;
 return {active:true,session_id:row.id,expires_at:new Date(row.expires_at).toISOString(),status:!position?'waiting':stale?'stale':'live',position};
}
// The grant never replaces account, company, assignment or source-state checks.
export async function validTrackingSession(db:Db,id:string,lock=false){
 const result=await db.query(`SELECT s.*,u.session_version AS current_version,m.active AS member_active,m.role,m.permissions,
  t.active AS company_active,t.tracking_enabled,d.active AS driver_active,d.user_id AS assigned_user,
  origin.expire>now() AND origin.sess->>'userId'=s.user_id::text AND origin.sess->>'tenantId'=s.tenant_id::text
   AND origin.sess->>'sessionVersion'=s.session_version::text AS origin_session_active
  FROM transport_tracking_sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.tenant_id=s.tenant_id AND m.user_id=s.user_id
  JOIN tenants t ON t.id=s.tenant_id JOIN taxi_drivers d ON d.tenant_id=s.tenant_id AND d.id=s.driver_id
  LEFT JOIN "session" origin ON origin.sid=s.auth_session_id WHERE s.id=$1 ${lock?'FOR UPDATE OF s':''}`,[id]);
 if(!result.rowCount)return null;const s=result.rows[0];
 if(s.stopped_at)return null;
 let valid=s.origin_session_active===true&&new Date(s.expires_at).getTime()>Date.now()&&s.current_version===s.session_version&&s.member_active&&s.company_active&&s.tracking_enabled&&s.driver_active&&s.assigned_user===s.user_id&&(s.role==='admin'||s.permissions.includes('transport_driver'));
 if(valid){const job=await getTransportJob(db,s.tenant_id,s.kind,s.kind==='taxi'?s.taxi_trip_id:s.delivery_id);valid=job.available&&job.active&&job.driver_id===s.driver_id&&job.driver_user_id===s.user_id;}
 if(valid){const sub=await subscription(s.tenant_id,db);valid=sub?.writable===true;}
 if(!valid){await stopTrackingSession(db,id,'authorization_ended');return null;}return s;
}
export async function jobWithTracking(db:Db,company:string,job:TransportJob,user?:string){
 const result=await db.query(`SELECT id FROM transport_tracking_sessions WHERE tenant_id=$1 AND kind=$2 AND CASE WHEN kind='taxi' THEN taxi_trip_id ELSE delivery_id END=$3 AND stopped_at IS NULL`,[company,job.kind,job.id]);
 const row=result.rowCount?await validTrackingSession(db,result.rows[0].id):null;
 const {driver_user_id,driver_active,active,available,...publicJob}=job;
 return {...publicJob,tracking:trackingView(row),can_start:Boolean(user&&driver_user_id===user&&driver_active&&active&&available)};
}
export async function startTracking(db:PoolClient,req:Request,company:string,kind:TransportKind,id:string){
 await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[company]);
 const originSession=await db.query(`SELECT 1 FROM "session" s JOIN users u ON u.id=$2 WHERE s.sid=$1 AND s.expire>now()
  AND s.sess->>'userId'=$2::text AND s.sess->>'tenantId'=$3::text AND s.sess->>'sessionVersion'=u.session_version::text`,[req.sessionID,req.access!.userId,company]);
 ensure(originSession.rowCount,401,'A sessão de acesso foi encerrada ou mudou de empresa. Faça login novamente.');
 await trackingCompany(db,company);const job=await ownTransportJob(req,db,company,kind,id);ensure(job.active,409,'Inicie a etapa de deslocamento antes de compartilhar a localização.');
 await db.query('SELECT id FROM taxi_drivers WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,job.driver_id]);
 const checked=await ownTransportJob(req,db,company,kind,id);ensure(checked.active,409,'Este transporte não está mais em deslocamento.');
 await db.query(`UPDATE transport_tracking_sessions SET stopped_at=now(),stop_reason='expired',${clearPosition} WHERE tenant_id=$1 AND driver_id=$2 AND stopped_at IS NULL AND expires_at<=now()`,[company,job.driver_id]);
 const other=await db.query(`SELECT id,kind,taxi_trip_id,delivery_id FROM transport_tracking_sessions WHERE tenant_id=$1 AND driver_id=$2 AND stopped_at IS NULL`,[company,job.driver_id]);
 for(const old of other.rows){const valid=await validTrackingSession(db,old.id);if(valid)ensure(old.kind===kind&&(old.kind==='taxi'?old.taxi_trip_id:old.delivery_id)===id,409,'Encerre o compartilhamento da outra viagem antes de iniciar esta.');}
 // A repeated explicit start rotates the grant and invalidates the former link.
 await stopJobTracking(db,company,kind,id,'driver_restarted');
 const upload=randomBytes(32).toString('hex'),version=(await db.query('SELECT session_version FROM users WHERE id=$1',[req.access!.userId])).rows[0].session_version;
 const row=(await db.query(`INSERT INTO transport_tracking_sessions(tenant_id,kind,taxi_trip_id,delivery_id,driver_id,user_id,session_version,upload_token_hash,auth_session_id,expires_at)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '12 hours') RETURNING id,expires_at`,[company,kind,kind==='taxi'?id:null,kind==='delivery'?id:null,job.driver_id,req.access!.userId,version,sha(upload),req.sessionID])).rows[0];
 const origin=process.env.APP_ORIGIN??'';return {session_id:row.id,upload_token:upload,upload_url:`${origin}/api/transport/tracking/${row.id}/positions`,stop_url:`${origin}/api/transport/tracking/${row.id}/stop`,expires_at:new Date(row.expires_at).toISOString()};
}
