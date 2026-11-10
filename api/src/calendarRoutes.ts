import { Router } from 'express';
import { z } from 'zod';
import { pool,tx,auth,permit,tenant,ensure,allowProfessional,validateAvailability,syncReminder,error,lockTutor } from './core.js';
import type { PoolClient } from 'pg';
import {requireSubscriptionWrite} from './commercialService.js';
import {assertFutureAppointmentStart} from './scheduling.js';
const r=Router();r.use(auth,requireSubscriptionWrite);
const datetime=z.iso.datetime({offset:true});
const createInput=z.object({tutor_id:z.uuid(),pet_id:z.uuid(),professional_id:z.uuid(),service_ids:z.array(z.uuid()).min(1).max(12),starts_at:datetime,notes:z.string().max(3000).default('')});
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
  pool.query('SELECT id,name,price_cents,duration_minutes FROM services WHERE tenant_id=$1 AND active=true ORDER BY name',[c]),
  pool.query('SELECT timezone FROM tenants WHERE id=$1',[c])
 ]);res.json({tutors:tutors.rows,pets:pets.rows,professionals:professionals.rows,services:services.rows,timezone:settings.rows[0].timezone,server_now:new Date().toISOString()});
});

async function servicesFor(db:PoolClient,company:string,ids:string[]){
 ensure(new Set(ids).size===ids.length,422,'Serviço repetido no mesmo agendamento.');
 const services=await db.query('SELECT id,price_cents,duration_minutes FROM services WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND active=true',[company,ids]);
 ensure(services.rows.length===ids.length,422,'Um ou mais serviços não pertencem à empresa ou estão inativos.');
 return ids.map((id,index)=>({...(services.rows.find(s=>s.id===id)),position:index+1}));
}
async function putAppointment(db:PoolClient,req:import('express').Request,company:string,data:z.infer<typeof createInput>,kind:string){
 await lockTutor(db,company,data.tutor_id,422);
 allowProfessional(req,data.professional_id);
 const start=new Date(data.starts_at);assertFutureAppointmentStart(start);
 const svcs=await servicesFor(db,company,data.service_ids);const total=svcs.reduce((n,s)=>n+s.duration_minutes,0);
 const end=new Date(start.getTime()+total*60000);
 await validateAvailability(db,company,data.professional_id,start,end,data.service_ids);
 assertFutureAppointmentStart(start);
 const row=await db.query(`INSERT INTO appointments(tenant_id,tutor_id,pet_id,professional_id,starts_at,ends_at,notes,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[company,data.tutor_id,data.pet_id,data.professional_id,start,end,data.notes,req.access!.userId]);
 for(const s of svcs)await db.query(`INSERT INTO appointment_services(tenant_id,appointment_id,service_id,position,price_cents,duration_minutes) VALUES($1,$2,$3,$4,$5,$6)`,[company,row.rows[0].id,s.id,s.position,s.price_cents,s.duration_minutes]);
 const event=await db.query(`INSERT INTO appointment_events(tenant_id,appointment_id,actor_user_id,kind,new_start,new_end,new_professional_id)
 VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[company,row.rows[0].id,req.access!.userId,kind,start,end,data.professional_id]);
 await notifyAppointmentEvent(db,company,event.rows[0].id,data.professional_id);
 await syncReminder(db,company,row.rows[0].id,'pending',start.toISOString());return row.rows[0];
}
r.get('/calendar/appointments',permit('appointments'),async(req,res)=>{
 const c=tenant(req);const from=datetime.parse(req.query.from),to=datetime.parse(req.query.to);ensure(new Date(to)>new Date(from),422,'Período inválido.');
 ensure((new Date(to).getTime()-new Date(from).getTime())<=32*86400000,422,'Selecione no máximo 32 dias.');
 const scoped=req.access!.role==='employee'&&!req.access!.permissions.includes('agenda:all');
 if(scoped)ensure(req.access!.scopeProfessionalId,403,'Vincule o funcionário a um profissional para acessar a agenda.');
 const result=await pool.query(`SELECT a.*, t.name AS tutor_name,p.name AS pet_name,pr.name AS professional_name,
 COALESCE(json_agg(json_build_object('id',s.id,'name',s.name,'price_cents',acs.price_cents,'duration_minutes',acs.duration_minutes) ORDER BY acs.position) FILTER (WHERE s.id IS NOT NULL),'[]'::json) AS services
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
 const {starts_at,professional_id,service_ids}=z.object({starts_at:datetime,professional_id:z.uuid(),service_ids:z.array(z.uuid()).min(1)}).parse(req.body);
 allowProfessional(req,professional_id);
 const c=tenant(req);const result=await tx(async db=>{
  const start=new Date(starts_at);assertFutureAppointmentStart(start);
  const svcs=await servicesFor(db,c,service_ids);const end=new Date(start.getTime()+svcs.reduce((n,s)=>n+s.duration_minutes,0)*60000);
  await validateAvailability(db,c,professional_id,start,end,service_ids);
  const clash=await db.query(`SELECT 1 FROM appointments WHERE tenant_id=$1 AND professional_id=$2 AND status=ANY($5::text[])
 AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`,[c,professional_id,start,end,activeStatuses]);
  assertFutureAppointmentStart(start);
  return {available:!clash.rowCount,ends_at:end.toISOString()};
 });res.json(result);
});
r.post('/calendar/appointments/:id/move',permit('appointments'),async(req,res)=>{
 const id=z.uuid().parse(req.params.id),c=tenant(req);
 const data=z.object({starts_at:datetime,professional_id:z.uuid(),reason:z.string().trim().min(3).max(1000),mode:z.enum(['reschedule','anticipate']),tutor_consent:z.boolean().default(false)}).parse(req.body);
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
  if(status==='no_show'){
   const company=await db.query('SELECT late_tolerance_minutes FROM tenants WHERE id=$1',[c]);
   ensure(Date.now()>=new Date(old.rows[0].starts_at).getTime()+company.rows[0].late_tolerance_minutes*60000,409,'A tolerância para atraso ainda não acabou.');
  }
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
r.get('/calendar/waitlist',permit('waitlist'),async(req,res)=>{
 const c=tenant(req);const rows=await pool.query(`SELECT w.*,t.name AS tutor_name,p.name AS pet_name,s.name AS service_name FROM waitlist w
 JOIN tutors t ON t.id=w.tutor_id AND t.tenant_id=w.tenant_id JOIN pets p ON p.id=w.pet_id AND p.tenant_id=w.tenant_id JOIN services s ON s.id=w.service_id AND s.tenant_id=w.tenant_id WHERE w.tenant_id=$1 ORDER BY w.earliest_at`,[c]);res.json(rows.rows);
});
r.post('/calendar/waitlist',permit('waitlist'),async(req,res)=>{
 const c=tenant(req),i=z.object({tutor_id:z.uuid(),pet_id:z.uuid(),service_id:z.uuid(),professional_id:z.uuid().nullable().optional(),earliest_at:datetime,latest_at:datetime,notes:z.string().max(1000).default('')}).parse(req.body);
 ensure(new Date(i.latest_at)>new Date(i.earliest_at),422,'Período inválido.');
 const row=await tx(async db=>{await lockTutor(db,c,i.tutor_id,422);return db.query(`INSERT INTO waitlist(tenant_id,tutor_id,pet_id,service_id,professional_id,earliest_at,latest_at,notes)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[c,i.tutor_id,i.pet_id,i.service_id,i.professional_id??null,i.earliest_at,i.latest_at,i.notes]);});res.status(201).json(row.rows[0]);
});
r.get('/calendar/waitlist/:id/opportunities',permit('waitlist'),async(req,res)=>{
 const c=tenant(req),id=z.uuid().parse(req.params.id);
 const wait=await pool.query(`SELECT w.*,s.duration_minutes FROM waitlist w JOIN services s ON s.tenant_id=w.tenant_id AND s.id=w.service_id
 WHERE w.tenant_id=$1 AND w.id=$2 AND w.status IN ('waiting','offered')`,[c,id]);ensure(wait.rowCount,404,'Solicitação não disponível.');
 const w=wait.rows[0];
 const scoped=req.access!.role==='employee'&&!req.access!.permissions.includes('agenda:all');
 if(scoped)ensure(req.access!.scopeProfessionalId,403,'Vincule sua conta a um profissional.');
 const prof=await pool.query(`SELECT p.id,p.name FROM professionals p JOIN professional_services ps ON ps.tenant_id=p.tenant_id AND ps.professional_id=p.id
 WHERE p.tenant_id=$1 AND p.active=true AND ps.service_id=$2 AND ($3::uuid IS NULL OR p.id=$3) AND ($4::uuid IS NULL OR p.id=$4)
 ORDER BY p.name LIMIT 20`,[c,w.service_id,w.professional_id,scoped?req.access!.scopeProfessionalId:null]);
 const earliest=Math.max(Date.now(),new Date(w.earliest_at).getTime());
 const limit=Math.min(new Date(w.latest_at).getTime(),Date.now()+14*86400000);
 const starting=Math.ceil(earliest/900000)*900000;
 const options:{starts_at:string;ends_at:string;professional_id:string;professional_name:string}[]=[];
 // Busca limitada e indicativa; a confirmação sempre repete a checagem sob transação.
 for(let time=starting,scanned=0;time+w.duration_minutes*60000<=limit&&scanned<800&&options.length<5;time+=900000,scanned++){
  const from=new Date(time),to=new Date(time+w.duration_minutes*60000);
  for(const p of prof.rows){
   try{await validateAvailability(pool,c,p.id,from,to,[w.service_id]);}catch{continue;}
   const reserved=await pool.query(`SELECT 1 FROM appointments WHERE tenant_id=$1 AND professional_id=$2 AND status IN ('pending','confirmed','in_progress')
   AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`,[c,p.id,from,to]);
   if(!reserved.rowCount){options.push({starts_at:from.toISOString(),ends_at:to.toISOString(),professional_id:p.id,professional_name:p.name});break;}
  }
 }
 res.json({options,limitedToFirst:5,scanLimit:800});
});
r.post('/calendar/waitlist/:id/offer',permit('waitlist'),async(req,res)=>{
 const c=tenant(req),id=z.uuid().parse(req.params.id);
 const row=await pool.query("UPDATE waitlist SET status='offered' WHERE tenant_id=$1 AND id=$2 AND status='waiting' RETURNING *",[c,id]);ensure(row.rowCount,409,'Oferta não disponível.');
 // Registro interno apenas: nenhum contato externo é enviado nesta etapa.
 res.json({offer:row.rows[0],delivered:false});
});
r.post('/calendar/waitlist/:id/book',permit('waitlist'),async(req,res)=>{
 const c=tenant(req),id=z.uuid().parse(req.params.id);
 const {starts_at,professional_id,tutor_consent}=z.object({starts_at:datetime,professional_id:z.uuid(),tutor_consent:z.literal(true)}).parse(req.body);
 const result=await tx(async db=>{
  const target=(await db.query('SELECT tutor_id FROM waitlist WHERE tenant_id=$1 AND id=$2',[c,id])).rows[0];ensure(target,404,'Pedido de encaixe não encontrado.');await lockTutor(db,c,target.tutor_id);
  const item=await db.query("SELECT * FROM waitlist WHERE tenant_id=$1 AND id=$2 AND status IN ('waiting','offered') FOR UPDATE",[c,id]);ensure(item.rowCount,409,'Esta oportunidade já foi utilizada.');
  const w=item.rows[0],start=new Date(starts_at);ensure(start>=new Date(w.earliest_at)&&start<new Date(w.latest_at),422,'Fora da disponibilidade informada.');
  if(w.professional_id)ensure(w.professional_id===professional_id,422,'Profissional diferente do solicitado.');
  const app=await putAppointment(db,req,c,{tutor_id:w.tutor_id,pet_id:w.pet_id,professional_id,service_ids:[w.service_id],starts_at,notes:`Encaixe da lista de espera: ${w.notes}`},'waitlist_booking');
  ensure(new Date(app.ends_at)<=new Date(w.latest_at),422,'Serviço não cabe na janela informada.');
  await db.query("UPDATE waitlist SET status='booked',appointment_id=$3 WHERE tenant_id=$1 AND id=$2",[c,id,app.id]);return app;
 });res.status(201).json(result);
});
export default r;
