import {Router,type Request,type RequestHandler} from 'express';
import {createHmac,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {auth,ensure,lockTutor,normEmail,permit,pool,syncReminder,tenant,tx} from './core.js';
import {requireSubscriptionWrite,settings,subscription} from './commercialService.js';
import {recordAudit} from './audit.js';
import {assertFutureAppointmentStart} from './scheduling.js';
import {bookingServices,bookingSlots,chooseAvailableProfessional,PUBLIC_BOOKING_HORIZON_DAYS,PUBLIC_BOOKING_NOTICE} from './publicBookingService.js';

export const publicBookingRouter=Router();
const r=publicBookingRouter;
const publicToken=z.string().regex(/^[a-f0-9]{48}$/);
const datetime=z.iso.datetime({offset:true});
const serviceIds=z.array(z.uuid()).min(1).max(12).refine(values=>new Set(values).size===values.length,'Não repita serviços.');
const cleanText=(min:number,max:number)=>z.string().trim().min(min).max(max).refine(value=>!/[\u0000-\u001f\u007f]/.test(value),'Remova caracteres de controle.');
const phone=z.string().trim().max(40).transform(value=>value.replace(/[\s().-]/g,''))
 .refine(value=>/^\+?\d{10,15}$/.test(value),'Informe telefone com DDD.');
const requestInput=z.object({
 tutor:z.object({name:cleanText(2,160),phone,email:z.email().trim().max(255).optional()}).strict(),
 pet:z.object({name:cleanText(1,160),species:cleanText(2,80),size:z.enum(['pequeno','medio','grande']),breed:cleanText(0,160).optional()}).strict(),
 service_ids:serviceIds,starts_at:datetime,idempotency_key:z.uuid(),website:z.string().max(200).default('')
}).strict();
const keyedHash=(value:string)=>createHmac('sha256',process.env.SESSION_SECRET!).update(value).digest('hex');
const receiptResult=(receipt:string)=>({ok:true,receipt,status:'pending',message:PUBLIC_BOOKING_NOTICE});
const administrator:RequestHandler=(req,_res,next)=>{try{ensure(req.access?.role==='admin',403,'Somente o responsável pode configurar o agendamento público.');next();}catch(failure){next(failure);}};
const inboxPermission:RequestHandler=(req,_res,next)=>{try{const a=req.access!;ensure(a.role==='admin'||a.permissions.includes('agenda:all'),403,'A confirmação dos pedidos exige acesso à agenda da equipe.');next();}catch(failure){next(failure);}};

async function hitRate(key:string,limit:number){
 const row=await pool.query(`INSERT INTO auth_rate_limits(key) VALUES($1)
  ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempts+1 END,
  window_started=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN now() ELSE auth_rate_limits.window_started END
  RETURNING attempts`,[key]);
 ensure(row.rows[0].attempts<=limit,429,'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}
// Unknown links are throttled too, before a token lookup can touch tenant data.
r.use('/public/booking',async(req,_res,next)=>{
 try{await hitRate(keyedHash(`public-booking:ip:${req.ip??'unknown'}`),300);next();}catch(failure){next(failure);}
});
async function throttle(req:Request,company:string,write:boolean){
 const keys=[{key:keyedHash(`public-booking:${write?'write':'read'}:${req.ip??'unknown'}:${company}`),limit:write?8:120},
  {key:keyedHash(`public-booking:company:${write?'write':'read'}:${company}`),limit:write?100:1200}];
 for(const item of keys)await hitRate(item.key,item.limit);
}

async function publicCompany(raw:unknown,db:PoolClient|typeof pool=pool,lock=false){
 const parsed=publicToken.safeParse(raw);ensure(parsed.success,404,'Agendamento público indisponível.');
 const found=await db.query(`SELECT t.id,t.name,t.timezone,s.notice FROM public_booking_settings s
  JOIN tenants t ON t.id=s.tenant_id WHERE s.public_token=$1 AND s.enabled=true AND t.active=true
  ${lock?'FOR SHARE OF s,t':''}`,[parsed.data]);
 ensure(found.rowCount,404,'Agendamento público indisponível.');
 const legal=await settings(db);ensure(legal?.published===true,404,'Agendamento público indisponível.');
 const current=await subscription(found.rows[0].id,db);ensure(current?.writable===true,404,'Agendamento público indisponível.');
 return found.rows[0] as {id:string;name:string;timezone:string;notice:string};
}

async function assertBookingDate(db:PoolClient|typeof pool,start:Date,timezone:string){
 assertFutureAppointmentStart(start);
 ensure(start.getUTCSeconds()===0&&start.getUTCMilliseconds()===0&&start.getUTCMinutes()%15===0,422,'Escolha um horário da lista de disponibilidade.');
 const result=await db.query(`SELECT ($1::timestamptz AT TIME ZONE $2)::date
  BETWEEN (now() AT TIME ZONE $2)::date AND (now() AT TIME ZONE $2)::date+$3::int AS allowed`,[start,timezone,PUBLIC_BOOKING_HORIZON_DAYS]);
 ensure(result.rows[0].allowed,422,'Escolha uma data nos próximos 90 dias.');
}

async function settingsResult(company:string,db:PoolClient|typeof pool=pool){
 await db.query('INSERT INTO public_booking_settings(tenant_id) VALUES($1) ON CONFLICT(tenant_id) DO NOTHING',[company]);
 const row=await db.query('SELECT enabled,public_token,notice,updated_at FROM public_booking_settings WHERE tenant_id=$1',[company]);
 const config=row.rows[0],legal=await settings(db),current=await subscription(company,db);
 const path=`/agendar/${config.public_token}`;
 return {enabled:config.enabled,token:config.public_token,link:`${process.env.APP_ORIGIN??''}${path}`,path,
  notice:config.notice,confirmation_notice:PUBLIC_BOOKING_NOTICE,legal_ready:legal?.published===true,
  subscription_writable:current?.writable===true,updated_at:config.updated_at};
}

r.get('/public/booking/:token',async(req,res)=>{
 const company=await publicCompany(req.params.token);await throttle(req,company.id,false);
 const services=await pool.query(`SELECT s.id,s.name,s.duration_minutes,s.price_cents FROM services s
  WHERE s.tenant_id=$1 AND s.active=true AND s.service_type='appointment'
   AND EXISTS(SELECT 1 FROM professional_services ps JOIN professionals p ON p.tenant_id=ps.tenant_id AND p.id=ps.professional_id
    WHERE ps.tenant_id=s.tenant_id AND ps.service_id=s.id AND p.active=true)
  ORDER BY s.name,s.id LIMIT 200`,[company.id]);
 res.json({businessName:company.name,timezone:company.timezone,services:services.rows,notice:company.notice,
  confirmation_notice:PUBLIC_BOOKING_NOTICE,enabled:true,horizon_days:PUBLIC_BOOKING_HORIZON_DAYS});
});
r.get('/public/booking/:token/slots',async(req,res)=>{
 const company=await publicCompany(req.params.token);await throttle(req,company.id,false);
 const query=z.object({date:z.iso.date(),service_ids:z.string().max(450).transform(value=>value.split(',')).pipe(serviceIds)}).strict().parse(req.query);
 const selected=await bookingServices(pool,company.id,query.service_ids);
 const allowed=await pool.query(`SELECT $1::date BETWEEN (now() AT TIME ZONE $2)::date
  AND (now() AT TIME ZONE $2)::date+$3::int AS allowed`,[query.date,company.timezone,PUBLIC_BOOKING_HORIZON_DAYS]);
 ensure(allowed.rows[0].allowed,422,'Escolha uma data de hoje em diante, nos próximos 90 dias.');
 const slots=await bookingSlots(pool,company.id,query.date,company.timezone,query.service_ids,selected.reduce((n,item)=>n+item.duration_minutes,0));
 res.json({slots,confirmation_notice:PUBLIC_BOOKING_NOTICE});
});
r.post('/public/booking/:token/requests',async(req,res)=>{
 const company=await publicCompany(req.params.token);await throttle(req,company.id,true);
 const input=requestInput.parse(req.body);ensure(input.website==='',422,'Não foi possível enviar o pedido.');
 const normalized={tutor:{...input.tutor,email:input.tutor.email?normEmail(input.tutor.email):null},pet:input.pet,
  service_ids:input.service_ids,starts_at:new Date(input.starts_at).toISOString()};
 const fingerprint=keyedHash(JSON.stringify(normalized));
 const receipt=await tx(async db=>{
  await publicCompany(req.params.token,db,true);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`public-booking:${company.id}:${input.idempotency_key}`]);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`public-booking:pending-cap:${company.id}`]);
  const prior=await db.query('SELECT receipt,payload_hash FROM public_booking_requests WHERE tenant_id=$1 AND idempotency_key=$2',[company.id,input.idempotency_key]);
  if(prior.rowCount){ensure(prior.rows[0].payload_hash===fingerprint,409,'Este envio já foi usado com outros dados. Atualize o formulário.');return prior.rows[0].receipt as string;}
  const pending=await db.query("SELECT count(*)::int AS n FROM public_booking_requests WHERE tenant_id=$1 AND status='pending'",[company.id]);
  ensure(pending.rows[0].n<200,429,'O pet shop está recebendo muitos pedidos. Tente novamente mais tarde.');
  const start=new Date(input.starts_at);await assertBookingDate(db,start,company.timezone);
  const services=await bookingServices(db,company.id,input.service_ids,true);
  const end=new Date(start.getTime()+services.reduce((n,item)=>n+item.duration_minutes,0)*60000);
  ensure(await chooseAvailableProfessional(db,company.id,start,end,input.service_ids),409,'Este horário não está mais disponível. Escolha outro.');
  const created=await db.query(`INSERT INTO public_booking_requests(tenant_id,idempotency_key,payload_hash,tutor_name,tutor_phone,tutor_email,
   pet_name,pet_species,pet_size,pet_breed,starts_at,ends_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,receipt`,
   [company.id,input.idempotency_key,fingerprint,input.tutor.name,input.tutor.phone,normalized.tutor.email,input.pet.name,input.pet.species,input.pet.size,input.pet.breed??null,start,end]);
  for(const service of services)await db.query(`INSERT INTO public_booking_request_services(tenant_id,request_id,service_id,position,name,price_cents,duration_minutes)
   VALUES($1,$2,$3,$4,$5,$6,$7)`,[company.id,created.rows[0].id,service.id,service.position,service.name,service.price_cents,service.duration_minutes]);
  return created.rows[0].receipt as string;
 });
 res.status(201).json(receiptResult(receipt));
});

r.get('/public-booking/settings',auth,administrator,async(req,res)=>res.json(await settingsResult(tenant(req))));
r.put('/public-booking/settings',auth,administrator,async(req,res)=>{
 const company=tenant(req),input=z.object({enabled:z.boolean(),notice:cleanText(0,600).default(''),rotate_token:z.boolean().default(false)}).strict().parse(req.body);
 const result=await tx(async db=>{
  if(input.enabled){const legal=await settings(db);ensure(legal?.published===true,409,'Publique os documentos de privacidade e uso antes de ativar o link público.');
   const current=await subscription(company,db);ensure(current?.writable===true,402,'Regularize o acesso para ativar pedidos públicos.');}
  await settingsResult(company,db);
  await db.query(`UPDATE public_booking_settings SET enabled=$2,notice=$3,
   public_token=CASE WHEN $4 THEN $5 ELSE public_token END,updated_by=$6,updated_at=now() WHERE tenant_id=$1`,
   [company,input.enabled,input.notice,input.rotate_token,randomBytes(24).toString('hex'),req.access!.userId]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'public_booking.settings.update',entityType:'public_booking',metadata:{enabled:input.enabled,linkRotated:input.rotate_token}});
  return settingsResult(company,db);
 });res.json(result);
});
r.get('/public-booking/requests',auth,permit('appointments'),inboxPermission,async(req,res)=>{
 const company=tenant(req),query=z.object({status:z.enum(['pending','confirmed','rejected','all']).default('pending')}).strict().parse(req.query);
 const rows=await pool.query(`SELECT r.id,r.receipt,r.status,r.starts_at,r.ends_at,r.created_at,r.updated_at,r.appointment_id,
  r.reviewed_at,r.rejection_reason,
  json_build_object('name',r.tutor_name,'phone',r.tutor_phone,'email',r.tutor_email) AS tutor,
  json_build_object('name',r.pet_name,'species',r.pet_species,'size',r.pet_size,'breed',r.pet_breed) AS pet,
  (SELECT json_agg(json_build_object('id',s.service_id,'name',s.name,'price_cents',s.price_cents,'duration_minutes',s.duration_minutes) ORDER BY s.position)
   FROM public_booking_request_services s WHERE s.tenant_id=r.tenant_id AND s.request_id=r.id) AS services
  FROM public_booking_requests r WHERE r.tenant_id=$1 AND ($2::text='all' OR r.status=$2)
  ORDER BY r.created_at DESC,r.id LIMIT 100`,[company,query.status]);
 res.json({items:rows.rows});
});
r.post('/public-booking/requests/:id/reject',auth,requireSubscriptionWrite,permit('appointments'),inboxPermission,async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id),input=z.object({reason:cleanText(0,300).default('')}).strict().parse(req.body??{});
 const saved=await tx(async db=>{
  const existing=await db.query('SELECT status FROM public_booking_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);
  ensure(existing.rowCount,404,'Pedido não encontrado.');ensure(existing.rows[0].status!=='confirmed',409,'Este pedido já virou agendamento. Abra o atendimento para alterá-lo.');
  if(existing.rows[0].status==='rejected')return {id,status:'rejected'};
  await db.query(`UPDATE public_booking_requests SET status='rejected',reviewed_by=$3,reviewed_at=now(),rejection_reason=$4,updated_at=now()
   WHERE tenant_id=$1 AND id=$2`,[company,id,req.access!.userId,input.reason]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'public_booking.request.reject',entityType:'public_booking_request',entityId:id});
  return {id,status:'rejected'};
 });res.json(saved);
});
r.delete('/public-booking/requests/:id',auth,administrator,async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id);
 z.object({}).strict().parse(req.body??{});
 await tx(async db=>{
  const removed=await db.query('DELETE FROM public_booking_requests WHERE tenant_id=$1 AND id=$2 RETURNING id',[company,id]);
  ensure(removed.rowCount,404,'Pedido não encontrado.');
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'public_booking.request.delete',entityType:'public_booking_request',entityId:id});
 });res.json({ok:true});
});
r.post('/public-booking/requests/:id/confirm',auth,requireSubscriptionWrite,permit('appointments'),inboxPermission,async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id);
 const input=z.object({tutor_id:z.uuid().optional(),pet_id:z.uuid().optional()}).strict().refine(value=>!value.pet_id||Boolean(value.tutor_id),'Escolha o tutor do pet.').parse(req.body??{});
 const saved=await tx(async db=>{
  const found=await db.query('SELECT * FROM public_booking_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);
  ensure(found.rowCount,404,'Pedido não encontrado.');const request=found.rows[0];
  if(request.status==='confirmed')return {id,status:'confirmed',appointment_id:request.appointment_id};
  ensure(request.status==='pending',409,'Este pedido já foi encerrado.');
  const start=new Date(request.starts_at);assertFutureAppointmentStart(start);
  const selected=await db.query('SELECT service_id FROM public_booking_request_services WHERE tenant_id=$1 AND request_id=$2 ORDER BY position',[company,id]);
  const ids=selected.rows.map(item=>item.service_id as string),services=await bookingServices(db,company,ids,true);
  const end=new Date(start.getTime()+services.reduce((n,item)=>n+item.duration_minutes,0)*60000);
  // Match the calendar/privacy lock order when reusing a known tutor. New
  // tutor ids are private to this transaction and cannot be concurrently edited.
  let tutorId=input.tutor_id,petId=input.pet_id;
  if(tutorId)await lockTutor(db,company,tutorId,422);
  const professional=await chooseAvailableProfessional(db,company,start,end,ids);
  ensure(professional,409,'O horário foi ocupado. Rejeite este pedido e combine outro horário com o tutor.');
  // Names/phones from a public form never identify an existing customer. An
  // operator must select explicit scoped ids; otherwise new records are created.
  if(!tutorId)tutorId=(await db.query(`INSERT INTO tutors(tenant_id,name,phone,email,email_reminders_opt_in)
   VALUES($1,$2,$3,$4,false) RETURNING id`,[company,request.tutor_name,request.tutor_phone,request.tutor_email])).rows[0].id;
  if(petId){const animal=await db.query('SELECT id FROM pets WHERE tenant_id=$1 AND id=$2 AND tutor_id=$3 FOR SHARE',[company,petId,tutorId]);ensure(animal.rowCount,422,'Escolha um pet deste tutor e desta empresa.');}
  else petId=(await db.query('INSERT INTO pets(tenant_id,tutor_id,name,species,size,breed) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
   [company,tutorId,request.pet_name,request.pet_species,request.pet_size,request.pet_breed])).rows[0].id;
  assertFutureAppointmentStart(start);
  const appointment=await db.query(`INSERT INTO appointments(tenant_id,tutor_id,pet_id,professional_id,starts_at,ends_at,status,created_by)
   VALUES($1,$2,$3,$4,$5,$6,'confirmed',$7) RETURNING id`,[company,tutorId,petId,professional,start,end,req.access!.userId]);
  const appointmentId=appointment.rows[0].id;
  for(const service of services)await db.query(`INSERT INTO appointment_services(tenant_id,appointment_id,service_id,position,price_cents,duration_minutes)
   VALUES($1,$2,$3,$4,$5,$6)`,[company,appointmentId,service.id,service.position,service.price_cents,service.duration_minutes]);
  const event=await db.query(`INSERT INTO appointment_events(tenant_id,appointment_id,actor_user_id,kind,new_start,new_end,new_professional_id)
   VALUES($1,$2,$3,'created',$4,$5,$6) RETURNING id`,[company,appointmentId,req.access!.userId,start,end,professional]);
  await db.query(`INSERT INTO notifications(tenant_id,recipient_user_id,event_id)
   SELECT m.tenant_id,m.user_id,$2::uuid FROM memberships m
   LEFT JOIN professionals p ON p.tenant_id=m.tenant_id AND p.user_id=m.user_id AND p.id=$3::uuid
   WHERE m.tenant_id=$1 AND m.active=true AND (m.role='admin' OR
    ('appointments'=ANY(m.permissions) AND ('agenda:all'=ANY(m.permissions) OR p.id IS NOT NULL)))
   ON CONFLICT(tenant_id,recipient_user_id,event_id) DO NOTHING`,[company,event.rows[0].id,professional]);
  await syncReminder(db,company,appointmentId,'confirmed',start.toISOString());
  await db.query(`UPDATE public_booking_requests SET status='confirmed',appointment_id=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now()
   WHERE tenant_id=$1 AND id=$2`,[company,id,appointmentId,req.access!.userId]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'public_booking.request.confirm',entityType:'public_booking_request',entityId:id,metadata:{appointmentId}});
  return {id,status:'confirmed',appointment_id:appointmentId};
 });res.json(saved);
});

export default publicBookingRouter;
