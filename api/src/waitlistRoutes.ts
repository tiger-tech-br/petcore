import {Router,type Request} from 'express';
import {z} from 'zod';
import {auth,pool,tx,permit,tenant,ensure,lockTutor,allowProfessional,type Db} from './core.js';
import {requireSubscriptionWrite} from './commercialService.js';
import {putAppointment} from './calendarRoutes.js';
import {findWaitlistOpportunities,validateWaitlistWindow} from './waitlistService.js';
import {assertFutureAppointmentStart} from './scheduling.js';
import {recordAudit} from './audit.js';

const r=Router();r.use(auth,requireSubscriptionWrite);
const datetime=z.iso.datetime({offset:true});
const period=z.object({earliest_at:datetime,latest_at:datetime}).strict();
const visibility=`($3::uuid IS NULL OR ((w.professional_id IS NULL OR w.professional_id=$3) AND EXISTS(
 SELECT 1 FROM professional_services ps WHERE ps.tenant_id=w.tenant_id AND ps.professional_id=$3 AND ps.service_id=w.service_id)))`;
function scope(req:Request){const a=req.access!;if(a.role==='employee'&&!a.permissions.includes('agenda:all')){ensure(a.scopeProfessionalId,403,'Vincule sua conta a quem realiza os atendimentos.');return a.scopeProfessionalId;}return null;}
async function item(db:Db,company:string,id:string,professional:string|null,lock=false){
 const row=await db.query(`SELECT w.* FROM waitlist w WHERE w.tenant_id=$1 AND w.id=$2 AND ${visibility} ${lock?'FOR UPDATE OF w':''}`,[company,id,professional]);
 ensure(row.rowCount,404,'Pedido de encaixe não encontrado.');return row.rows[0];
}

r.get('/options',permit('waitlist'),async(req,res)=>{
 const company=tenant(req),professional=scope(req);
 const [tutors,pets,professionals,services,settings]=await Promise.all([
  pool.query('SELECT id,name FROM tutors WHERE tenant_id=$1 AND anonymized_at IS NULL ORDER BY name,id',[company]),
  pool.query('SELECT p.id,p.name,p.tutor_id FROM pets p JOIN tutors t ON t.tenant_id=p.tenant_id AND t.id=p.tutor_id WHERE p.tenant_id=$1 AND t.anonymized_at IS NULL ORDER BY p.name,p.id',[company]),
  pool.query('SELECT id,name FROM professionals WHERE tenant_id=$1 AND active=true AND ($2::uuid IS NULL OR id=$2) ORDER BY name,id',[company,professional]),
  pool.query(`SELECT s.id,s.name,s.price_cents,s.duration_minutes FROM services s WHERE s.tenant_id=$1 AND s.active=true AND s.service_type='appointment'
   AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM professional_services ps WHERE ps.tenant_id=s.tenant_id AND ps.professional_id=$2 AND ps.service_id=s.id)) ORDER BY s.name,s.id`,[company,professional]),
  pool.query('SELECT timezone,now() AS server_now FROM tenants WHERE id=$1',[company])
 ]);
 res.json({tutors:tutors.rows,pets:pets.rows,professionals:professionals.rows,services:services.rows,timezone:settings.rows[0].timezone,server_now:settings.rows[0].server_now});
});
r.get('/',permit('waitlist'),async(req,res)=>{
 const rows=await pool.query(`SELECT w.*,t.name AS tutor_name,p.name AS pet_name,s.name AS service_name,s.duration_minutes,s.active AS service_active
 FROM waitlist w JOIN tutors t ON t.tenant_id=w.tenant_id AND t.id=w.tutor_id
 JOIN pets p ON p.tenant_id=w.tenant_id AND p.id=w.pet_id JOIN services s ON s.tenant_id=w.tenant_id AND s.id=w.service_id
 WHERE w.tenant_id=$1 AND $2::boolean AND ${visibility} ORDER BY w.earliest_at,w.id`,[tenant(req),true,scope(req)]);
 res.json(rows.rows);
});
r.post('/',permit('waitlist'),async(req,res)=>{
 const input=z.object({tutor_id:z.uuid(),pet_id:z.uuid(),service_id:z.uuid(),professional_id:z.uuid().nullable().optional(),earliest_at:datetime,latest_at:datetime,notes:z.string().max(1000).default('')}).strict().parse(req.body);
 const company=tenant(req),professional=scope(req);if(input.professional_id)allowProfessional(req,input.professional_id);
 const saved=await tx(async db=>{
  await lockTutor(db,company,input.tutor_id,422);
  const service=(await db.query("SELECT duration_minutes FROM services WHERE tenant_id=$1 AND id=$2 AND active=true AND service_type='appointment' FOR SHARE",[company,input.service_id])).rows[0];
  ensure(service,422,'Escolha um serviço de atendimento ativo.');validateWaitlistWindow(new Date(input.earliest_at),new Date(input.latest_at),service.duration_minutes);
  if(professional)ensure((await db.query('SELECT 1 FROM professional_services WHERE tenant_id=$1 AND professional_id=$2 AND service_id=$3',[company,professional,input.service_id])).rowCount,403,'Você só pode receber encaixes dos serviços que realiza.');
  return (await db.query(`INSERT INTO waitlist(tenant_id,tutor_id,pet_id,service_id,professional_id,earliest_at,latest_at,notes)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[company,input.tutor_id,input.pet_id,input.service_id,input.professional_id??professional,input.earliest_at,input.latest_at,input.notes])).rows[0];
 });res.status(201).json(saved);
});
r.get('/:id/opportunities',permit('waitlist'),async(req,res)=>{
 const company=tenant(req),professional=scope(req),id=z.uuid().parse(req.params.id),request=await item(pool,company,id,professional);
 ensure(['waiting','offered'].includes(request.status),409,'Este pedido já foi encerrado ou agendado.');
 res.json(await findWaitlistOpportunities(pool,company,request,professional));
});
r.patch('/:id/availability',permit('waitlist'),async(req,res)=>{
 const company=tenant(req),professional=scope(req),id=z.uuid().parse(req.params.id),input=period.parse(req.body);
 const saved=await tx(async db=>{
  const target=await item(db,company,id,professional);await lockTutor(db,company,target.tutor_id);
  const request=await item(db,company,id,professional,true);ensure(['waiting','offered'].includes(request.status),409,'Atualize o agendamento pela Agenda; este pedido já foi encerrado.');
  const service=(await db.query("SELECT duration_minutes FROM services WHERE tenant_id=$1 AND id=$2 AND active=true AND service_type='appointment' FOR SHARE",[company,request.service_id])).rows[0];
  ensure(service,422,'Ative o serviço antes de atualizar o período.');validateWaitlistWindow(new Date(input.earliest_at),new Date(input.latest_at),service.duration_minutes);
  const row=await db.query("UPDATE waitlist SET earliest_at=$3,latest_at=$4,status='waiting' WHERE tenant_id=$1 AND id=$2 RETURNING *",[company,id,input.earliest_at,input.latest_at]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'waitlist.availability.update',entityType:'waitlist',entityId:id});return row.rows[0];
 });res.json(saved);
});
r.post('/:id/offer',permit('waitlist'),async(req,res)=>{
 const company=tenant(req),professional=scope(req),id=z.uuid().parse(req.params.id);
 const saved=await tx(async db=>{
  const request=await item(db,company,id,professional,true);ensure(request.status==='waiting',409,'Esta oferta já foi registrada ou encerrada.');
  ensure(new Date(request.latest_at).getTime()>Date.now(),409,'Esse período já terminou. Atualize a disponibilidade antes de oferecer um horário.');
  return (await db.query("UPDATE waitlist SET status='offered' WHERE tenant_id=$1 AND id=$2 RETURNING *",[company,id])).rows[0];
 });res.json({offer:saved,delivered:false});
});
r.post('/:id/book',permit('waitlist'),async(req,res)=>{
 const input=z.object({starts_at:datetime,professional_id:z.uuid().nullable().optional(),tutor_consent:z.literal(true)}).strict().parse(req.body);
 const company=tenant(req),professional=scope(req),id=z.uuid().parse(req.params.id);if(input.professional_id)allowProfessional(req,input.professional_id);
 const saved=await tx(async db=>{
  const target=await item(db,company,id,professional);await lockTutor(db,company,target.tutor_id);
  const request=await item(db,company,id,professional,true);ensure(['waiting','offered'].includes(request.status),409,'Este pedido já foi encerrado ou agendado.');
  ensure(new Date(request.latest_at).getTime()>Date.now(),409,'Esse período já terminou. Atualize a disponibilidade antes de confirmar.');
  const start=new Date(input.starts_at);assertFutureAppointmentStart(start);ensure(start>=new Date(request.earliest_at)&&start<new Date(request.latest_at),422,'Escolha um horário dentro da disponibilidade do tutor.');
  if(request.professional_id&&input.professional_id)ensure(request.professional_id===input.professional_id,422,'Profissional diferente do solicitado.');
  const chosen=request.professional_id??input.professional_id??undefined;if(chosen)allowProfessional(req,chosen);
  const appointment=await putAppointment(db,req,company,{tutor_id:request.tutor_id,pet_id:request.pet_id,professional_id:chosen,service_ids:[request.service_id],starts_at:input.starts_at,notes:`Encaixe da lista de espera: ${request.notes}`},'waitlist_booking');
  ensure(new Date(appointment.ends_at)<=new Date(request.latest_at),422,'O serviço completo não cabe no período informado.');
  await db.query("UPDATE waitlist SET status='booked',appointment_id=$3 WHERE tenant_id=$1 AND id=$2",[company,id,appointment.id]);return appointment;
 });res.status(201).json(saved);
});
r.delete('/:id',permit('waitlist'),async(req,res)=>{
 const company=tenant(req),professional=scope(req),id=z.uuid().parse(req.params.id);z.object({}).strict().parse(req.body??{});
 const saved=await tx(async db=>{
  const request=await item(db,company,id,professional,true);ensure(request.status!=='booked',409,'Este pedido já virou agendamento. Para cancelá-lo, abra a Agenda.');
  if(request.status!=='closed'){
   await db.query("UPDATE waitlist SET status='closed' WHERE tenant_id=$1 AND id=$2",[company,id]);
   await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'waitlist.closed',entityType:'waitlist',entityId:id});
  }return{id,status:'closed'};
 });res.json(saved);
});
export default r;
