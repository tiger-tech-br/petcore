import { config } from 'dotenv';
config({path:new URL('../../.env',import.meta.url)});
import { createHash, randomBytes } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { Request, Response, NextFunction } from 'express';
import argon2 from 'argon2';
import {localSlot} from './scheduling.js';

if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL');
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 40) throw new Error('SESSION_SECRET precisa ter 40+ caracteres');
export const pool=new Pool({connectionString:process.env.DATABASE_URL, max:12,
 ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
export type Db = Pool|PoolClient;
export const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export const hashPassword=(s:string)=>argon2.hash(s,{type:argon2.argon2id});
export const normEmail=(s:string)=>s.trim().toLowerCase();
export const error=(code:number,message:string):never=>{throw Object.assign(new Error(message),{status:code});};
export function ensure(ok:unknown,status:number,message:string):asserts ok {if(!ok)error(status,message);}
export const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export async function tx<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();try{await c.query('BEGIN');const value=await run(c);await c.query('COMMIT');return value;}
 catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
declare module 'express-session' {interface SessionData {userId?:string;tenantId?:string;sessionVersion?:number}}
declare global {namespace Express {interface Request {access?:Access;requestId?:string}}}
export type Access={userId:string;tenantId:string|null;role:'platform'|'admin'|'employee';permissions:string[];scopeProfessionalId:string|null;name:string;companyName?:string};
export async function auth(req:Request,_res:Response,next:NextFunction){
 try{
  ensure(req.session.userId,401,'Faça login novamente.');
  const user=await pool.query('SELECT id,name,is_platform_owner,session_version FROM users WHERE id=$1',[req.session.userId]);
  ensure(user.rowCount&&req.session.sessionVersion===user.rows[0].session_version,401,'Sessão expirada ou invalidada. Faça login novamente.');
  if(user.rows[0].is_platform_owner && !req.session.tenantId){
   req.access={userId:user.rows[0].id,tenantId:null,role:'platform',permissions:[],scopeProfessionalId:null,name:user.rows[0].name};return next();
  }
  ensure(req.session.tenantId,403,'Selecione uma empresa autorizada.');
  const m=await pool.query(`SELECT m.role,m.permissions,t.name AS company_name,p.id AS own_professional
   FROM memberships m JOIN tenants t ON t.id=m.tenant_id
   LEFT JOIN professionals p ON p.tenant_id=m.tenant_id AND p.user_id=m.user_id
   WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.active=true AND t.active=true`,[req.session.tenantId,req.session.userId]);
  ensure(m.rowCount,403,'Empresa ou acesso indisponível.');
  req.access={userId:user.rows[0].id,tenantId:req.session.tenantId,role:m.rows[0].role,permissions:m.rows[0].permissions,
   scopeProfessionalId:m.rows[0].own_professional,name:user.rows[0].name,companyName:m.rows[0].company_name};next();
 }catch(e){next(e);}
}
export function permit(permission:string){return (req:Request,_res:Response,next:NextFunction)=>{
 try{const a=req.access;ensure(a,401,'Não autenticado.');ensure(a.role==='admin'||a.permissions.includes(permission),403,'Sem permissão para esta operação.');next();}catch(e){next(e);}
};}
export function platform(req:Request,_res:Response,next:NextFunction){try{ensure(req.access?.role==='platform',403,'Área exclusiva da plataforma.');next();}catch(e){next(e);}}
export function tenant(req:Request){ensure(req.access?.tenantId,403,'Selecione uma empresa.');return req.access.tenantId;}
export async function lockTutor(db:Db,company:string,id:string,missingStatus=404) {
 const row=await db.query('SELECT id,anonymized_at FROM tutors WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);
 ensure(row.rowCount,missingStatus,'Cliente não encontrado.');
 ensure(!row.rows[0].anonymized_at,409,'Este cadastro foi anonimizado e não pode receber novos dados pessoais.');
}
export function allowProfessional(req:Request, professionalId:string){const a=req.access!;
 ensure(a.role==='admin'||a.permissions.includes('agenda:all')||a.scopeProfessionalId===professionalId,403,'Você só pode acessar sua própria agenda.');}
export async function syncReminder(db:Db,companyId:string,appointmentId:string,status:string,start:string,minutes=60){
 if(['cancelled','no_show','done'].includes(status)){
  await db.query(`UPDATE reminder_jobs SET state='cancelled' WHERE tenant_id=$1 AND appointment_id=$2 AND state<>'sent'`,[companyId,appointmentId]);return;
 }
 const settings=await db.query('SELECT reminder_minutes_before FROM tenants WHERE id=$1',[companyId]);
 minutes=settings.rows[0]?.reminder_minutes_before??minutes;
 // Somente lembretes ainda nao processados podem ter o horario atualizado.
 // Nao reabrir lembretes enviados, falhos ou com tentativas iniciadas.
 await db.query(`INSERT INTO reminder_jobs(tenant_id,appointment_id,scheduled_for,state)
  VALUES($1,$2,$3::timestamptz - ($4::int * interval '1 minute'),'queued')
  ON CONFLICT(tenant_id,appointment_id) DO UPDATE
  SET scheduled_for=EXCLUDED.scheduled_for, next_attempt_at=NULL
  WHERE reminder_jobs.state='queued'
    AND reminder_jobs.claimed_by IS NULL
    AND reminder_jobs.attempt_count=0
    AND reminder_jobs.sent_at IS NULL
    AND reminder_jobs.provider_message_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM reminder_delivery_attempts d
      WHERE d.tenant_id=reminder_jobs.tenant_id
        AND d.appointment_id=reminder_jobs.appointment_id
    )`,[companyId,appointmentId,start,minutes]);
}
export async function validateAvailability(db:Db,companyId:string,profId:string,start:Date,end:Date,serviceIds:string[]){
 ensure(Number.isFinite(start.valueOf())&&Number.isFinite(end.valueOf())&&end>start,422,'Data inválida.');
 const info=await db.query('SELECT timezone FROM tenants WHERE id=$1',[companyId]);ensure(info.rowCount,404,'Empresa não encontrada.');
 const prof=await db.query('SELECT 1 FROM professionals WHERE tenant_id=$1 AND id=$2 AND active=true FOR UPDATE',[companyId,profId]);ensure(prof.rowCount,422,'Profissional indisponível.');
 const slots=localSlot(start,(end.getTime()-start.getTime())/60000,info.rows[0].timezone);
 const shifts=await db.query('SELECT start_time::text,end_time::text FROM professional_shifts WHERE tenant_id=$1 AND professional_id=$2 AND weekday=$3',[companyId,profId,slots.weekday]);
 const mins=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
 ensure(shifts.rows.some(s=>mins(s.start_time)<=slots.start&&mins(s.end_time)>=slots.end),422,'Fora da jornada de trabalho.');
 const breaks=await db.query('SELECT start_time::text,end_time::text FROM professional_breaks WHERE tenant_id=$1 AND professional_id=$2 AND weekday=$3',[companyId,profId,slots.weekday]);
 ensure(!breaks.rows.some(s=>mins(s.start_time)<slots.end&&mins(s.end_time)>slots.start),409,'Horário coincide com intervalo.');
 const absences=await db.query(`SELECT 1 FROM professional_absences WHERE tenant_id=$1 AND professional_id=$2
  AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`,[companyId,profId,start.toISOString(),end.toISOString()]);
 ensure(!absences.rowCount,409,'Profissional indisponível neste horário.');
 if(serviceIds.length){const elig=await db.query(`SELECT count(*)::int AS n FROM professional_services ps
   JOIN services s ON s.tenant_id=ps.tenant_id AND s.id=ps.service_id
   WHERE ps.tenant_id=$1 AND ps.professional_id=$2 AND ps.service_id=ANY($3::uuid[]) AND s.active=true`,[companyId,profId,serviceIds]);
  ensure(elig.rows[0].n===new Set(serviceIds).size,422,'Profissional não habilitado para os serviços.');}
}
export function sendError(err:unknown,_req:Request,res:Response,_next:NextFunction){
 const e=err as {status?:number;code?:string;message?:string;issues?:unknown};
 if(e.code==='23P01') return res.status(409).json({error:'Este horário acabou de ser reservado por outro atendimento.'});
 if(e.code==='23503'||e.code==='23514'||e.code==='23505'||e.code==='22P02')return res.status(422).json({error:'Referência inválida, registro duplicado ou dados incompatíveis com esta empresa.'});
 if(e.issues)return res.status(422).json({error:'Verifique os dados informados.',details:e.issues});
 if(e.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'A foto deve ter até 5 MB.'});
 if(e.code==='40P01'||e.code==='55P03'||e.code==='57014')return res.status(409).json({error:'Outra operação está em andamento. Atualize a tela e tente novamente.'});
 if(e.status===400)return res.status(400).json({error:'O conteúdo enviado não é válido.'});
 if(!e.status || e.status>=500)console.error('PetCore API:',{code:e.code??'INTERNAL',status:e.status??500,requestId:_req.requestId});
 return res.status(e.status||500).json({error:e.status?e.message:'Erro interno no servidor.'});
}
