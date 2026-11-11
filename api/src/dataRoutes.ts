import { Router } from 'express';
import { z } from 'zod';
import { pool, tx, auth, tenant, permit, ensure, validateAvailability,lockTutor } from './core.js';
import {requireSubscriptionWrite} from './commercialService.js';
import {recordAudit} from './audit.js';
const r=Router();r.use(auth,requireSubscriptionWrite);
const tutor=z.object({name:z.string().trim().min(2).max(160),phone:z.string().max(40).default(''),email:z.union([z.email(),z.literal(''),z.null()]).optional(),notes:z.string().max(3000).default(''),email_reminders_opt_in:z.boolean().default(false)});
const pet=z.object({name:z.string().trim().min(1).max(160),tutor_id:z.uuid(),species:z.string().trim().min(2),breed:z.string().nullable().optional(),size:z.enum(['pequeno','medio','grande']),birth_date:z.iso.date().nullable().optional(),notes:z.string().max(3000).default('')});
const professional=z.object({name:z.string().trim().min(2).max(160),user_id:z.uuid().nullable().optional(),active:z.boolean().default(true)});
const service=z.object({name:z.string().trim().min(2).max(160),description:z.string().max(2000).default(''),price_cents:z.number().int().min(0).max(999999999),duration_minutes:z.number().int().min(0).max(1440),active:z.boolean().default(true),service_type:z.enum(['appointment','transport']).default('appointment'),transport_mode:z.enum(['pickup','dropoff','round_trip']).nullable().default(null)});
const defs={tutors:{schema:tutor,permission:'tutors',columns:['name','phone','email','notes']},pets:{schema:pet,permission:'pets',columns:['name','tutor_id','species','breed','size','birth_date','notes']},professionals:{schema:professional,permission:'professionals',columns:['name','user_id','active']},services:{schema:service,permission:'services',columns:['name','description','price_cents','duration_minutes','active','service_type','transport_mode']}} as const;
function validateServiceKind(input:Record<string,unknown>){
 if(input.service_type==='transport')ensure(input.duration_minutes===0&&input.transport_mode,422,'O serviço de Táxi Dog usa duração zero na agenda e precisa indicar busca, entrega ou ida e volta.');
 else ensure(Number(input.duration_minutes)>=5&&input.transport_mode===null,422,'Informe a duração do atendimento entre 5 e 1440 minutos, sem modalidade de transporte.');
}
type Resource=keyof typeof defs;
function getResource(raw:string):Resource {ensure(raw in defs,404,'Recurso não encontrado.');return raw as Resource;}
function allowed(req:import('express').Request,permission:string){const a=req.access!;ensure(a.role==='admin'||a.permissions.includes(permission),403,'Sem permissão.');}
// Apenas para lembretes reais: enderecos de exemplo/teste nao sao destinatarios.
function eligibleReminderEmail(value:unknown):boolean {
  if(typeof value!=='string'||!z.email().safeParse(value).success)return false;
  const domain=value.trim().split('@')[1]?.toLowerCase()??'';
  return !(/(^|\.)example\.(com|net|org)$/.test(domain)||/\.(test|invalid|localhost)$/.test(domain)||domain==='localhost');
}
function hasOwn(record:Record<string,unknown>,key:string){return Object.hasOwn(record,key);}
// Seletores de relacionamento não concedem acesso ao cadastro completo: quem
// cadastra pets ou configura profissionais recebe somente os nomes necessários.
r.get('/options/pet-tutors',permit('pets'),async(req,res)=>{
 const rows=await pool.query('SELECT id,name FROM tutors WHERE tenant_id=$1 AND anonymized_at IS NULL ORDER BY name,id',[tenant(req)]);
 res.json(rows.rows);
});
r.get('/options/professional-services',permit('professionals'),async(req,res)=>{
 const rows=await pool.query("SELECT id,name FROM services WHERE tenant_id=$1 AND service_type='appointment' ORDER BY name,id",[tenant(req)]);
 res.json(rows.rows);
});
r.get('/options/professional-accounts',permit('professionals'),async(req,res)=>{
 const rows=await pool.query(`SELECT u.id,u.name FROM memberships m JOIN users u ON u.id=m.user_id
  WHERE m.tenant_id=$1 AND m.role='employee' ORDER BY u.name,u.id`,[tenant(req)]);
 res.json(rows.rows);
});
// Identificador da empresa nunca é fornecido pelo cliente nestas operações.
r.get('/data/:resource',async(req,res)=>{
 const key=getResource(req.params.resource as string),id=tenant(req);allowed(req,defs[key].permission);
 const fields=key==='pets'?'SELECT p.*,t.name AS tutor_name FROM pets p JOIN tutors t ON t.tenant_id=p.tenant_id AND t.id=p.tutor_id WHERE p.tenant_id=$1 ORDER BY p.name':
 `SELECT * FROM ${key} WHERE tenant_id=$1 ORDER BY name`;
 const rows=await pool.query(fields,[id]);res.json(rows.rows);
});
r.post('/data/:resource',async(req,res)=>{
 const key=getResource(req.params.resource as string),id=tenant(req);allowed(req,defs[key].permission);
 const def=defs[key];const data=def.schema.parse(req.body) as Record<string,unknown>;
 if(key==='services')validateServiceKind(data);
 if(key==='tutors'){
  const optIn=data.email_reminders_opt_in===true;
  if(optIn)ensure(eligibleReminderEmail(data.email),422,'Informe um e-mail real e valide a autorizacao do tutor antes de ativar lembretes.');
  const created=await tx(async db=>{
   const row=await db.query(`INSERT INTO tutors
    (tenant_id,name,phone,email,notes,email_reminders_opt_in,email_reminders_opt_in_at,email_reminders_opt_in_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id,data.name,data.phone,data.email??null,data.notes,optIn,optIn?new Date():null,optIn?req.access!.userId:null]);
   if(optIn)await db.query(`INSERT INTO tutor_email_reminder_consent_events
    (tenant_id,tutor_id,actor_user_id,email,action) VALUES($1,$2,$3,$4,'granted')`,
    [id,row.rows[0].id,req.access!.userId,data.email]);
   return row.rows[0];
  });
  return res.status(201).json(created);
 }
 const columns=[...def.columns] as string[];const sql=`INSERT INTO ${key}(tenant_id,${columns.join(',')}) VALUES($1,${columns.map((_,i)=>'$'+(i+2)).join(',')}) RETURNING *`;
 const row=await tx(async db=>{if(key==='pets')await lockTutor(db,id,String(data.tutor_id),422);return db.query(sql,[id,...columns.map(c=>data[c]??null)]);});res.status(201).json(row.rows[0]);
});
r.patch('/data/:resource/:id',async(req,res)=>{
 const key=getResource(req.params.resource as string),id=tenant(req),recordId=z.uuid().parse(req.params.id);allowed(req,defs[key].permission);
 const def=defs[key];const parsed=def.schema.partial().strict().parse(req.body) as Record<string,unknown>;
 // Defaults servem à criação. PATCH altera somente campos enviados pela pessoa.
 const data=Object.fromEntries(Object.entries(parsed).filter(([field])=>Object.hasOwn(req.body,field)));
 if(key==='tutors'){
  ensure(Object.keys(data).length>0,422,'Nenhum campo para atualizar.');
  const updated=await tx(async db=>{
   const previous=await db.query('SELECT email,email_reminders_opt_in,email_reminders_opt_in_at,email_reminders_opt_in_by,anonymized_at FROM tutors WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[id,recordId]);
   ensure(previous.rowCount,404,'Tutor nao encontrado.');
   const before=previous.rows[0];
   ensure(!before.anonymized_at,409,'Este cadastro foi anonimizado e não pode ser alterado.');
   const email=hasOwn(data,'email')?data.email:before.email;
   const emailChanged=String(before.email??'').trim().toLowerCase()!==String(email??'').trim().toLowerCase();
   const oldOptIn=before.email_reminders_opt_in===true;
   // Trocar e-mail jamais herda automaticamente a autorizacao do endereco anterior.
   const optIn=hasOwn(data,'email_reminders_opt_in')?data.email_reminders_opt_in===true:(emailChanged?false:oldOptIn);
   if(optIn)ensure(eligibleReminderEmail(email),422,'Informe um e-mail real e valide a autorizacao do tutor antes de ativar lembretes.');
   const newGrant=optIn&&(!oldOptIn||emailChanged);
   const revoke=oldOptIn&&(!optIn||emailChanged);
   const changes:Record<string,unknown>={};
   for(const field of ['name','phone','email','notes'])if(hasOwn(data,field))changes[field]=data[field];
   changes.email_reminders_opt_in=optIn;
   changes.email_reminders_opt_in_at=optIn?(newGrant?new Date():before.email_reminders_opt_in_at):null;
   changes.email_reminders_opt_in_by=optIn?(newGrant?req.access!.userId:before.email_reminders_opt_in_by):null;
   const fields=Object.keys(changes);
   const row=await db.query(`UPDATE tutors SET ${fields.map((field,index)=>`${field}=$${index+3}`).join(',')} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [id,recordId,...fields.map(field=>changes[field])]);
   if(revoke)await db.query(`INSERT INTO tutor_email_reminder_consent_events
    (tenant_id,tutor_id,actor_user_id,email,action) VALUES($1,$2,$3,$4,'revoked')`,
    [id,recordId,req.access!.userId,before.email]);
   if(newGrant)await db.query(`INSERT INTO tutor_email_reminder_consent_events
    (tenant_id,tutor_id,actor_user_id,email,action) VALUES($1,$2,$3,$4,'granted')`,
    [id,recordId,req.access!.userId,email]);
   return row.rows[0];
  });
  return res.json(updated);
 }
 const columns=(def.columns as readonly string[]).filter(c=>Object.hasOwn(data,c));ensure(columns.length,422,'Nenhum campo para atualizar.');
 const sql=`UPDATE ${key} SET ${columns.map((c,i)=>`${c}=$${i+3}`).join(',')} WHERE tenant_id=$1 AND id=$2 RETURNING *`;
 const row=await tx(async db=>{
  if(key==='services'){
   const existing=await db.query('SELECT * FROM services WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[id,recordId]);ensure(existing.rowCount,404,'Serviço não encontrado.');
   const before=existing.rows[0],merged={...before,...data};validateServiceKind(merged);
   if(merged.service_type!==before.service_type||merged.transport_mode!==before.transport_mode){
    const used=await db.query(`SELECT 1 WHERE EXISTS(SELECT 1 FROM appointment_services WHERE tenant_id=$1 AND service_id=$2)
     OR EXISTS(SELECT 1 FROM professional_services WHERE tenant_id=$1 AND service_id=$2)
     OR EXISTS(SELECT 1 FROM waitlist WHERE tenant_id=$1 AND service_id=$2)
     OR EXISTS(SELECT 1 FROM taxi_bookings WHERE tenant_id=$1 AND service_id=$2)`,[id,recordId]);
    ensure(!used.rowCount,409,'Este serviço já está vinculado a atendimentos, profissionais ou transportes. Cadastre outro serviço para mudar seu tipo ou modalidade.');
   }
  }
  if(key==='pets'){
   const current=(await db.query('SELECT tutor_id FROM pets WHERE tenant_id=$1 AND id=$2',[id,recordId])).rows[0];ensure(current,404,'Pet não encontrado.');
   for(const tutorId of [...new Set([current.tutor_id,data.tutor_id].filter(Boolean) as string[])].sort())await lockTutor(db,id,tutorId);
   const locked=(await db.query('SELECT tutor_id FROM pets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[id,recordId])).rows[0];
   ensure(locked?.tutor_id===current.tutor_id,409,'O cadastro mudou durante a alteração. Atualize a tela.');
  }
  return db.query(sql,[id,recordId,...columns.map(c=>data[c]??null)]);
 });ensure(row.rowCount,404,'Registro não encontrado.');res.json(row.rows[0]);
});
const hhmm=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const period=z.object({weekday:z.number().int().min(1).max(7),start_time:hhmm,end_time:hhmm}).refine(x=>x.end_time>x.start_time,'Fim deve ser maior que início.');
r.get('/professionals/:id/schedule',permit('professionals'),async(req,res)=>{
 const c=tenant(req),id=z.uuid().parse(req.params.id);
 const [shifts,breaks,services]=await Promise.all([
  pool.query('SELECT weekday,to_char(start_time,\'HH24:MI\') AS start_time,to_char(end_time,\'HH24:MI\') AS end_time FROM professional_shifts WHERE tenant_id=$1 AND professional_id=$2 ORDER BY weekday,start_time',[c,id]),
  pool.query('SELECT weekday,to_char(start_time,\'HH24:MI\') AS start_time,to_char(end_time,\'HH24:MI\') AS end_time FROM professional_breaks WHERE tenant_id=$1 AND professional_id=$2 ORDER BY weekday,start_time',[c,id]),
  pool.query('SELECT service_id FROM professional_services WHERE tenant_id=$1 AND professional_id=$2',[c,id])]);
 res.json({shifts:shifts.rows,breaks:breaks.rows,serviceIds:services.rows.map(s=>s.service_id)});
});
r.put('/professionals/:id/schedule',permit('professionals'),async(req,res)=>{
 const c=tenant(req),id=z.uuid().parse(req.params.id);
 const data=z.object({shifts:z.array(period).max(28),breaks:z.array(period).max(28),serviceIds:z.array(z.uuid()).max(100)}).parse(req.body);
 await tx(async db=>{
  const exists=await db.query('SELECT 1 FROM professionals WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[c,id]);ensure(exists.rowCount,404,'Profissional não encontrado.');
  if(data.serviceIds.length){const allowed=await db.query("SELECT id FROM services WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND service_type='appointment' ORDER BY id FOR SHARE",[c,[...new Set(data.serviceIds)]]);ensure(allowed.rowCount===new Set(data.serviceIds).size,422,'Selecione apenas serviços de atendimento desta empresa. O Táxi Dog usa a agenda dos motoristas.');}
  await db.query('DELETE FROM professional_services WHERE tenant_id=$1 AND professional_id=$2',[c,id]);
  await db.query('DELETE FROM professional_shifts WHERE tenant_id=$1 AND professional_id=$2',[c,id]);
  await db.query('DELETE FROM professional_breaks WHERE tenant_id=$1 AND professional_id=$2',[c,id]);
  for(const s of data.shifts)await db.query('INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)',[c,id,s.weekday,s.start_time,s.end_time]);
  for(const s of data.breaks)await db.query('INSERT INTO professional_breaks(tenant_id,professional_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)',[c,id,s.weekday,s.start_time,s.end_time]);
  for(const s of new Set(data.serviceIds))await db.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3)',[c,id,s]);
  const future=await db.query("SELECT * FROM appointments WHERE tenant_id=$1 AND professional_id=$2 AND starts_at>now() AND status IN ('pending','confirmed','in_progress')",[c,id]);
  for(const a of future.rows){const ids=(await db.query('SELECT service_id FROM appointment_services WHERE tenant_id=$1 AND appointment_id=$2',[c,a.id])).rows.map(x=>x.service_id);
   await validateAvailability(db,c,id,new Date(a.starts_at),new Date(a.ends_at),ids);}
 });res.json({ok:true});
});
r.post('/professionals/:id/absences',permit('professionals'),async(req,res)=>{
 const c=tenant(req),id=z.uuid().parse(req.params.id);
 const {starts_at,ends_at,reason}=z.object({starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true}),reason:z.string().max(500).default('')}).parse(req.body);
 ensure(new Date(ends_at)>new Date(starts_at),422,'Intervalo inválido.');
 const row=await tx(async db=>{
  const prof=await db.query('SELECT 1 FROM professionals WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[c,id]);ensure(prof.rowCount,404,'Profissional não encontrado.');
  const conflict=await db.query(`SELECT 1 FROM appointments WHERE tenant_id=$1 AND professional_id=$2 AND status IN ('pending','confirmed','in_progress')
   AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`,[c,id,starts_at,ends_at]);
  ensure(!conflict.rowCount,409,'Existe atendimento confirmado no intervalo.');
  return db.query(`INSERT INTO professional_absences(tenant_id,professional_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5) RETURNING *`,[c,id,starts_at,ends_at,reason]);
 });res.status(201).json(row.rows[0]);
});
r.get('/settings',async(req,res)=>{
 const row=await pool.query('SELECT id,name,timezone,late_tolerance_minutes,reminder_minutes_before,taxi_dog_enabled FROM tenants WHERE id=$1',[tenant(req)]);res.json(row.rows[0]);
});
r.patch('/settings',async(req,res)=>{
 ensure(req.access?.role==='admin',403,'Somente o administrador pode alterar configurações.');
 const input=z.object({late_tolerance_minutes:z.number().int().min(0).max(120).optional(),reminder_minutes_before:z.number().int().min(0).max(10080).optional(),taxi_dog_enabled:z.boolean().optional()}).strict().refine(value=>Object.keys(value).length>0).parse(req.body);
 const row=await tx(async db=>{
  const company=tenant(req);await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE',[company]);
  if(input.taxi_dog_enabled===false){const pending=await db.query("SELECT 1 FROM taxi_trips WHERE tenant_id=$1 AND status IN ('scheduled','en_route','with_pet') LIMIT 1",[company]);ensure(!pending.rowCount,409,'Finalize ou cancele os transportes pendentes antes de desativar o Táxi Dog.');}
  const result=await db.query('UPDATE tenants SET late_tolerance_minutes=COALESCE($2,late_tolerance_minutes),reminder_minutes_before=COALESCE($3,reminder_minutes_before),taxi_dog_enabled=COALESCE($4,taxi_dog_enabled) WHERE id=$1 RETURNING id,name,timezone,late_tolerance_minutes,reminder_minutes_before,taxi_dog_enabled',[company,input.late_tolerance_minutes??null,input.reminder_minutes_before??null,input.taxi_dog_enabled??null]);
  if(input.reminder_minutes_before!==undefined)await db.query(`UPDATE reminder_jobs j SET scheduled_for=a.starts_at-($2::int*interval '1 minute')
   FROM appointments a WHERE j.tenant_id=$1 AND a.tenant_id=j.tenant_id AND a.id=j.appointment_id AND j.state='queued'`,[tenant(req),input.reminder_minutes_before]);
  if(input.taxi_dog_enabled!==undefined)await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'taxi.settings.update',entityType:'tenant',entityId:company,metadata:{enabled:input.taxi_dog_enabled}});
  return result;
 });res.json(row.rows[0]);
});
r.get('/team',permit('team'),async(req,res)=>{
 const out=await pool.query(`SELECT u.id,u.name,u.email,m.role,m.permissions,m.active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY u.name`,[tenant(req)]);res.json(out.rows);
});
r.patch('/team/:id',async(req,res)=>{
 ensure(req.access?.role==='admin',403,'Somente o administrador pode alterar permissões.');
 const id=z.uuid().parse(req.params.id);const data=z.object({permissions:z.array(z.enum(['appointments','agenda:all','tutors','pets','crm','inventory','waitlist','services','professionals','team','finance','taxi_dog'])),active:z.boolean()}).parse(req.body);
 const row=await pool.query("UPDATE memberships SET permissions=$3,active=$4 WHERE tenant_id=$1 AND user_id=$2 AND role='employee' RETURNING user_id",[tenant(req),id,data.permissions,data.active]);
 ensure(row.rowCount,404,'Funcionário não encontrado.');res.json({ok:true});
});
export default r;
