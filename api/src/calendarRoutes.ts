import { Router } from 'express';
import { z } from 'zod';
import { pool,tx,auth,permit,tenant,ensure,allowProfessional,validateAvailability,syncReminder,error,lockTutor } from './core.js';
import type { PoolClient } from 'pg';
import {requireSubscriptionWrite} from './commercialService.js';
import {assertFutureAppointmentStart} from './scheduling.js';
import {canTaxi,cancelTaxiForAppointment,saveTaxiBooking,taxiDraft,taxiOptions,validateTaxiForAppointmentMove} from './taxiDogService.js';
import {chooseAvailableProfessional} from './publicBookingService.js';
const r=Router();r.use(auth,requireSubscriptionWrite);
const datetime=z.iso.datetime({offset:true});
const createInput=z.object({tutor_id:z.uuid(),pet_id:z.uuid(),professional_id:z.uuid().nullable().optional(),service_ids:z.array(z.uuid()).min(1).max(12),starts_at:datetime,notes:z.string().max(3000).default(''),taxi_dog:taxiDraft.nullable().optional()});
const activeStatuses=['pending','confirmed','in_progress'];
const notificationLabels: Record<string,string> = {
  created:'Novo agendamento',
  waitlist_booking:'Encaixe pela lista de espera',
  reschedule:'Atendimento reagendado',
  anticipate:'Atendimento antecipado',
  confirmed:'Atendimento confirmado',
  cancelled:'Atendimento cancelado',
  no_show:'Falta registrada',
  in_progress:'Atendimento iniciado',
  done:'Atendimento concluído'
};

// A notificação é salva na MESMA transação do evento da agenda.
// Funcionários veem apenas sua agenda, salvo permissão explícita agenda:all.
async function notifyAppointmentEvent(
  db:PoolClient, company:string, eventId:string, professionalId:string
) {
  await db.query(`INSERT INTO notifications(tenant_id,recipient_user_id,event_id)
    SELECT m.tenant_id,m.user_id,$2::uuid
    FROM memberships m
    LEFT JOIN professionals p
      ON p.tenant_id=m.tenant_id AND p.user_id=m.user_id
      AND p.id=$3::uuid
    WHERE m.tenant_id=$1::uuid AND m.active=true
      AND (m.role='admin' OR (
        'appointments'=ANY(m.permissions)
        AND ('agenda:all'=ANY(m.permissions) OR p.id IS NOT NULL)
      ))
    ON CONFLICT (tenant_id,recipient_user_id,event_id) DO NOTHING`,
    [company,eventId,professionalId]);
}

// Caixa de entrada individual; os dados ficam isolados por tenant e usuário.
r.get('/notifications',permit('appointments'),async(req,res)=>{
  const company=tenant(req),access=req.access!;
  const scoped=access.role==='employee'&&!access.permissions.includes('agenda:all');
  if(scoped) ensure(access.scopeProfessionalId,403,'Vincule sua conta a um profissional.');
  const params=[company,access.userId,scoped?access.scopeProfessionalId:null];
  const scope=`n.tenant_id=$1 AND n.recipient_user_id=$2
    AND ($3::uuid IS NULL OR a.professional_id=$3::uuid)`;
  const [items,unread]=await Promise.all([
    pool.query(`SELECT n.id,n.created_at,n.read_at,
        e.kind,e.appointment_id,e.actor_user_id,
        a.starts_at,a.status,p.name AS pet_name,
        pr.name AS professional_name,u.name AS actor_name
      FROM notifications n
      JOIN appointment_events e ON e.tenant_id=n.tenant_id AND e.id=n.event_id
      JOIN appointments a ON a.tenant_id=e.tenant_id AND a.id=e.appointment_id
      JOIN pets p ON p.tenant_id=a.tenant_id AND p.id=a.pet_id
      JOIN professionals pr ON pr.tenant_id=a.tenant_id AND pr.id=a.professional_id
      JOIN users u ON u.id=e.actor_user_id
      WHERE ${scope}
      ORDER BY n.created_at DESC,n.id DESC LIMIT 50`,params),
    pool.query(`SELECT count(*)::int AS count FROM notifications n
      JOIN appointment_events e ON e.tenant_id=n.tenant_id AND e.id=n.event_id
      JOIN appointments a ON a.tenant_id=e.tenant_id AND a.id=e.appointment_id
      WHERE ${scope} AND n.read_at IS NULL`,params)
  ]);
  res.json({items:items.rows.map(row=>({...row,title:notificationLabels[row.kind]??'Atendimento atualizado'})),
    unreadCount:unread.rows[0].count});
});

r.patch('/notifications/:id/read',permit('appointments'),async(req,res)=>{
  const company=tenant(req),access=req.access!,id=z.uuid().parse(req.params.id);
  const scoped=access.role==='employee'&&!access.permissions.includes('agenda:all');
  if(scoped) ensure(access.scopeProfessionalId,403,'Vincule sua conta a um profissional.');
  const changed=await pool.query(`UPDATE notifications n SET read_at=COALESCE(n.read_at,now())
    WHERE n.tenant_id=$1 AND n.recipient_user_id=$2 AND n.id=$3
    AND EXISTS (
      SELECT 1 FROM appointment_events e
      JOIN appointments a ON a.tenant_id=e.tenant_id AND a.id=e.appointment_id
      WHERE e.tenant_id=n.tenant_id AND e.id=n.event_id
        AND ($4::uuid IS NULL OR a.professional_id=$4::uuid)
    )
    RETURNING n.id,n.read_at`,[company,access.userId,id,scoped?access.scopeProfessionalId:null]);
  ensure(changed.rowCount,404,'Notificação não encontrada.');
  res.json(changed.rows[0]);
});
r.get('/calendar/options',permit('appointments'),async(req,res)=>{
 const c=tenant(req),scoped=req.access!.role==='employee'&&!req.access!.permissions.includes('agenda:all');
 if(scoped)ensure(req.access!.scopeProfessionalId,403,'Vincule sua conta a um profissional.');
 const [tutors,pets,professionals,services,settings]=await Promise.all([
  pool.query('SELECT id,name FROM tutors WHERE tenant_id=$1 AND anonymized_at IS NULL ORDER BY name',[c]),
  pool.query('SELECT p.id,p.name,p.tutor_id FROM pets p JOIN tutors t ON t.tenant_id=p.tenant_id AND t.id=p.tutor_id WHERE p.tenant_id=$1 AND t.anonymized_at IS NULL ORDER BY p.name',[c]),
  pool.query('SELECT id,name FROM professionals WHERE tenant_id=$1 AND active=true AND ($2::uuid IS NULL OR id=$2) ORDER BY name',[c,scoped?req.access!.scopeProfessionalId:null]),
  pool.query("SELECT id,name,price_cents,duration_minutes FROM services WHERE tenant_id=$1 AND active=true AND service_type='appointment' ORDER BY name",[c]),
  pool.query('SELECT timezone FROM tenants WHERE id=$1',[c])
 ]);const taxi=await taxiOptions(pool,c,canTaxi(req));res.json({tutors:tutors.rows,pets:pets.rows,professionals:professionals.rows,services:services.rows,timezone:settings.rows[0].timezone,server_now:new Date().toISOString(),taxi_dog:{...taxi,can_manage:canTaxi(req)}});
});

async function servicesFor(db:PoolClient,company:string,ids:string[]){
 ensure(new Set(ids).size===ids.length,422,'Serviço repetido no mesmo agendamento.');
 const services=await db.query("SELECT id,price_cents,duration_minutes FROM services WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND active=true AND service_type='appointment' ORDER BY id FOR SHARE",[company,ids]);
 ensure(services.rows.length===ids.length,422,'Um ou mais serviços não pertencem à empresa ou estão inativos.');
 return ids.map((id,index)=>({...(services.rows.find(s=>s.id===id)),position:index+1}));
}
export async function putAppointment(db:PoolClient,req:import('express').Request,company:string,data:z.infer<typeof createInput>,kind:string){
 await lockTutor(db,company,data.tutor_id,422);
 const start=new Date(data.starts_at);assertFutureAppointmentStart(start);
 const svcs=await servicesFor(db,company,data.service_ids);const total=svcs.reduce((n,s)=>n+s.duration_minutes,0);
 ensure(total<=1440,422,'A duração dos serviços ultrapassa um dia.');
 const end=new Date(start.getTime()+total*60000);
 const scoped=req.access!.role==='employee'&&!req.access!.permissions.includes('agenda:all');
 if(scoped)ensure(req.access!.scopeProfessionalId,403,'Vincule sua conta a um profissional para agendar.');
 const professionalId=data.professional_id??await chooseAvailableProfessional(db,company,start,end,data.service_ids,scoped?req.access!.scopeProfessionalId:null);
 ensure(professionalId,409,'Esse horário não está disponível para os serviços escolhidos. Escolha outro horário.');
 allowProfessional(req,professionalId);
 await validateAvailability(db,company,professionalId,start,end,data.service_ids);
 assertFutureAppointmentStart(start);
 const row=await db.query(`INSERT INTO appointments(tenant_id,tutor_id,pet_id,professional_id,starts_at,ends_at,notes,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[company,data.tutor_id,data.pet_id,professionalId,start,end,data.notes,req.access!.userId]);
 for(const s of svcs)await db.query(`INSERT INTO appointment_services(tenant_id,appointment_id,service_id,position,price_cents,duration_minutes) VALUES($1,$2,$3,$4,$5,$6)`,[company,row.rows[0].id,s.id,s.position,s.price_cents,s.duration_minutes]);
 if(data.taxi_dog)await saveTaxiBooking(db,req,company,row.rows[0],data.taxi_dog);
 const event=await db.query(`INSERT INTO appointment_events(tenant_id,appointment_id,actor_user_id,kind,new_start,new_end,new_professional_id)
 VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[company,row.rows[0].id,req.access!.userId,kind,start,end,professionalId]);
 await notifyAppointmentEvent(db,company,event.rows[0].id,professionalId);
 await syncReminder(db,company,row.rows[0].id,'pending',start.toISOString());return row.rows[0];
}
r.get('/calendar/appointments',permit('appointments'),async(req,res)=>{
 const c=tenant(req);const from=datetime.parse(req.query.from),to=datetime.parse(req.query.to);ensure(new Date(to)>new Date(from),422,'Período inválido.');
 ensure((new Date(to).getTime()-new Date(from).getTime())<=32*86400000,422,'Selecione no máximo 32 dias.');
 const scoped=req.access!.role==='employee'&&!req.access!.permissions.includes('agenda:all');
 if(scoped)ensure(req.access!.scopeProfessionalId,403,'Vincule o funcionário a um profissional para acessar a agenda.');
 const result=await pool.query(`SELECT a.*, t.name AS tutor_name,p.name AS pet_name,pr.name AS professional_name,
 COALESCE(json_agg(json_build_object('id',s.id,'name',s.name,'price_cents',acs.price_cents,'duration_minutes',acs.duration_minutes) ORDER BY acs.position) FILTER (WHERE s.id IS NOT NULL),'[]'::json) AS services,
 (SELECT json_build_object('id',b.id,'mode',b.mode,'service_name',b.service_name,'price_cents',b.price_cents,'cancelled_at',b.cancelled_at,
  'status',CASE WHEN b.cancelled_at IS NOT NULL THEN 'cancelled'
   WHEN EXISTS(SELECT 1 FROM taxi_trips tr WHERE tr.tenant_id=b.tenant_id AND tr.booking_id=b.id AND tr.status IN ('en_route','with_pet')) THEN 'active'
   WHEN NOT EXISTS(SELECT 1 FROM taxi_trips tr WHERE tr.tenant_id=b.tenant_id AND tr.booking_id=b.id AND tr.status NOT IN ('completed','cancelled')) THEN 'completed' ELSE 'scheduled' END)
  FROM taxi_bookings b WHERE b.tenant_id=a.tenant_id AND b.appointment_id=a.id) AS taxi_dog
 FROM appointments a JOIN tutors t ON t.id=a.tutor_id AND t.tenant_id=a.tenant_id
 JOIN pets p ON p.id=a.pet_id AND p.tenant_id=a.tenant_id
 JOIN professionals pr ON pr.id=a.professional_id AND pr.tenant_id=a.tenant_id
 LEFT JOIN appointment_services acs ON acs.appointment_id=a.id AND acs.tenant_id=a.tenant_id
 LEFT JOIN services s ON s.id=acs.service_id AND s.tenant_id=a.tenant_id
 WHERE a.tenant_id=$1 AND a.starts_at<$3 AND a.ends_at>$2 AND ($4::uuid IS NULL OR a.professional_id=$4)
 GROUP BY a.id,t.name,p.name,pr.name ORDER BY a.starts_at`,[c,from,to,scoped?req.access!.scopeProfessionalId:null]);
 res.json(result.rows);
});
r.post('/calendar/appointments',permit('appointments'),async(req,res)=>{
 const data=createInput.parse(req.body),c=tenant(req);
 const saved=await tx(db=>putAppointment(db,req,c,data,'created'));
 res.status(201).json(saved);
});
r.post('/calendar/check',permit('appointments'),async(req,res)=>{
 const {starts_at,professional_id,service_ids}=z.object({starts_at:datetime,professional_id:z.uuid().nullable().optional(),service_ids:z.array(z.uuid()).min(1).max(12)}).parse(req.body);
 if(professional_id)allowProfessional(req,professional_id);
 const c=tenant(req);const result=await tx(async db=>{
  const start=new Date(starts_at);assertFutureAppointmentStart(start);
  const svcs=await servicesFor(db,c,service_ids),duration=svcs.reduce((n,s)=>n+s.duration_minutes,0);ensure(duration<=1440,422,'A duração dos serviços ultrapassa um dia.');const end=new Date(start.getTime()+duration*60000);
  const scoped=req.access!.role==='employee'&&!req.access!.permissions.includes('agenda:all');
  if(scoped)ensure(req.access!.scopeProfessionalId,403,'Vincule sua conta a um profissional para consultar horários.');
  const professionalId=professional_id??await chooseAvailableProfessional(db,c,start,end,service_ids,scoped?req.access!.scopeProfessionalId:null);
  if(!professionalId)return {available:false,ends_at:end.toISOString()};
  allowProfessional(req,professionalId);
  await validateAvailability(db,c,professionalId,start,end,service_ids);
  const clash=await db.query(`SELECT 1 FROM appointments WHERE tenant_id=$1 AND professional_id=$2 AND status=ANY($5::text[])
 AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`,[c,professionalId,start,end,activeStatuses]);
  assertFutureAppointmentStart(start);
  return {available:!clash.rowCount,ends_at:end.toISOString()};
 });res.json(result);
});
r.post('/calendar/appointments/:id/move',permit('appointments'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),c=tenant(req);
 const data=z.object({starts_at:datetime,professional_id:z.uuid(),reason:z.string().trim().min(3).max(1000),mode:z.enum(['reschedule','anticipate']),tutor_consent:z.boolean().default(false),taxi_dog:taxiDraft.nullable().optional()}).parse(req.body);
 if(data.mode==='anticipate')ensure(data.tutor_consent,422,'Registre a concordância do tutor.');
 const changed=await tx(async db=>{
  const target=(await db.query('SELECT tutor_id FROM appointments WHERE tenant_id=$1 AND id=$2',[c,id])).rows[0];ensure(target,404,'Agendamento não encontrado.');await lockTutor(db,c,target.tutor_id);
  const old=await db.query('SELECT * FROM appointments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[c,id]);ensure(old.rowCount,404,'Agendamento não encontrado.');
  const before=old.rows[0];allowProfessional(req,before.professional_id);allowProfessional(req,data.professional_id);
  ensure(['pending','confirmed'].includes(before.status),409,'Este atendimento não pode mais ser reagendado.');
  const start=new Date(data.starts_at);assertFutureAppointmentStart(start);if(data.mode==='anticipate')ensure(start<new Date(before.starts_at),422,'A antecipação precisa ser para horário anterior.');
  const svcs=await db.query('SELECT service_id,duration_minutes FROM appointment_services WHERE tenant_id=$1 AND appointment_id=$2',[c,id]);
  const duration=svcs.rows.reduce((n,s)=>n+s.duration_minutes,0);const end=new Date(start.getTime()+duration*60000);
  await validateAvailability(db,c,data.professional_id,start,end,svcs.rows.map(s=>s.service_id));
  assertFutureAppointmentStart(start);
  const updated=await db.query(`UPDATE appointments SET starts_at=$3,ends_at=$4,professional_id=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,[c,id,start,end,data.professional_id]);
  if(data.taxi_dog!==undefined)await saveTaxiBooking(db,req,c,updated.rows[0],data.taxi_dog);
  else await validateTaxiForAppointmentMove(db,c,updated.rows[0]);
  const event=await db.query(`INSERT INTO appointment_events(tenant_id,appointment_id,actor_user_id,kind,old_start,old_end,new_start,new_end,old_professional_id,new_professional_id,reason,tutor_consent)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,[c,id,req.access!.userId,data.mode,before.starts_at,before.ends_at,start,end,before.professional_id,data.professional_id,data.reason,data.tutor_consent]);
  await notifyAppointmentEvent(db,c,event.rows[0].id,data.professional_id);
  await syncReminder(db,c,id,before.status,start.toISOString());return updated.rows[0];
 });res.json(changed);
});
r.post('/calendar/appointments/:id/status',permit('appointments'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),c=tenant(req);
 const {status,reason}=z.object({status:z.enum(['confirmed','in_progress','done','cancelled','no_show']),reason:z.string().max(1000).default('')}).parse(req.body);
 const transitions:Record<string,string[]>={pending:['confirmed','cancelled','no_show'],confirmed:['in_progress','cancelled','no_show'],in_progress:['done','cancelled'],done:[],cancelled:[],no_show:[]};
 const row=await tx(async db=>{
  const target=(await db.query('SELECT tutor_id FROM appointments WHERE tenant_id=$1 AND id=$2',[c,id])).rows[0];ensure(target,404,'Agendamento não encontrado.');await lockTutor(db,c,target.tutor_id);
  const old=await db.query('SELECT * FROM appointments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[c,id]);ensure(old.rowCount,404,'Agendamento não encontrado.');
  allowProfessional(req,old.rows[0].professional_id);
  ensure(transitions[old.rows[0].status]?.includes(status),409,'Mudança de situação não permitida.');
  if(status==='in_progress'){
   const pickup=await db.query(`SELECT t.status FROM taxi_bookings b JOIN taxi_trips t ON t.tenant_id=b.tenant_id AND t.booking_id=b.id
    WHERE b.tenant_id=$1 AND b.appointment_id=$2 AND b.cancelled_at IS NULL AND t.leg='pickup'`,[c,id]);
   ensure(!pickup.rowCount||['completed','cancelled'].includes(pickup.rows[0].status),409,'Confirme a chegada do pet ou cancele a busca antes de iniciar o atendimento.');
  }
  if(status==='no_show'){
   const company=await db.query('SELECT late_tolerance_minutes FROM tenants WHERE id=$1',[c]);
   ensure(Date.now()>=new Date(old.rows[0].starts_at).getTime()+company.rows[0].late_tolerance_minutes*60000,409,'A tolerância para atraso ainda não acabou.');
  }
  if(['cancelled','no_show'].includes(status))await cancelTaxiForAppointment(db,c,id,status,req.access!.userId);
  const updated=await db.query('UPDATE appointments SET status=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *',[c,id,status]);
  const event=await db.query('INSERT INTO appointment_events(tenant_id,appointment_id,actor_user_id,kind,old_start,old_end,reason) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[c,id,req.access!.userId,status,old.rows[0].starts_at,old.rows[0].ends_at,reason]);
  await notifyAppointmentEvent(db,c,event.rows[0].id,old.rows[0].professional_id);
  await syncReminder(db,c,id,status,new Date(old.rows[0].starts_at).toISOString());return updated.rows[0];
 });res.json(row);
});
r.get('/calendar/appointments/:id/history',permit('appointments'),async(req,res)=>{
 const c=tenant(req),id=z.uuid().parse(req.params.id);
 const app=await pool.query('SELECT professional_id FROM appointments WHERE tenant_id=$1 AND id=$2',[c,id]);ensure(app.rowCount,404,'Agendamento não encontrado.');allowProfessional(req,app.rows[0].professional_id);
 const rows=await pool.query(`SELECT e.*,u.name AS actor_name FROM appointment_events e JOIN users u ON u.id=e.actor_user_id WHERE e.tenant_id=$1 AND e.appointment_id=$2 ORDER BY e.created_at`,[c,id]);res.json(rows.rows);
});
export default r;
