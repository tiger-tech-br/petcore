import type {PoolClient} from 'pg';
import {ensure,validateAvailability,type Db} from './core.js';
import {assertFutureAppointmentStart} from './scheduling.js';

export const PUBLIC_BOOKING_NOTICE='Seu pedido será confirmado pelo pet shop. O horário só fica reservado depois dessa confirmação.';
export const PUBLIC_BOOKING_HORIZON_DAYS=90;

export type BookingService={id:string;name:string;price_cents:number;duration_minutes:number;position:number};
export async function bookingServices(db:Db,company:string,ids:string[],lock=false):Promise<BookingService[]> {
 ensure(ids.length>=1&&ids.length<=12&&new Set(ids).size===ids.length,422,'Escolha os serviços sem repetições.');
 const result=await db.query(`SELECT id,name,price_cents,duration_minutes FROM services
  WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND active=true AND service_type='appointment'
  ORDER BY id ${lock?'FOR SHARE':''}`,[company,ids]);
 ensure(result.rows.length===ids.length,422,'Um dos serviços não está disponível.');
 const values=ids.map((id,index)=>({...result.rows.find(row=>row.id===id),position:index+1}));
 ensure(values.reduce((total,item)=>total+item.duration_minutes,0)<=1440,422,'A duração dos serviços ultrapassa um dia.');
 return values;
}

/** Returns an internal id only. Callers must never expose it through public routes.
 * Final confirmation holds the professional row lock until its transaction ends.
 * Driver scheduling is separate: the current schema has no professional/driver link.
 */
export async function chooseAvailableProfessional(db:PoolClient,company:string,start:Date,end:Date,serviceIds:string[],scopeProfessionalId?:string|null):Promise<string|null> {
 assertFutureAppointmentStart(start);
 const candidates=await db.query(`SELECT p.id FROM professionals p
  WHERE p.tenant_id=$1 AND p.active=true AND ($4::uuid IS NULL OR p.id=$4)
   AND (SELECT count(*) FROM professional_services ps WHERE ps.tenant_id=p.tenant_id
    AND ps.professional_id=p.id AND ps.service_id=ANY($3::uuid[]))=cardinality($3::uuid[])
  ORDER BY (SELECT count(*) FROM appointments a WHERE a.tenant_id=p.tenant_id AND a.professional_id=p.id
   AND a.starts_at >= date_trunc('day',$2::timestamptz) AND a.starts_at < date_trunc('day',$2::timestamptz)+interval '1 day'
   AND a.status IN ('pending','confirmed','in_progress')),p.id LIMIT 100`,[company,start,serviceIds,scopeProfessionalId??null]);
 for(const candidate of candidates.rows){
  await db.query('SAVEPOINT public_booking_candidate');
  try {
   await validateAvailability(db,company,candidate.id,start,end,serviceIds);
   const busy=await db.query(`SELECT 1 FROM appointments WHERE tenant_id=$1 AND professional_id=$2
    AND status IN ('pending','confirmed','in_progress')
    AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`,[company,candidate.id,start,end]);
   if(!busy.rowCount){await db.query('RELEASE SAVEPOINT public_booking_candidate');return candidate.id;}
   await db.query('ROLLBACK TO SAVEPOINT public_booking_candidate');
   await db.query('RELEASE SAVEPOINT public_booking_candidate');
  }catch(failure){
   const status=(failure as {status?:number}).status;
   if(status!==409&&status!==422)throw failure;
   // A rejected candidate must not leave its professional row locked while the
   // next candidate is tried. Calendar writes take tutor -> professional locks.
   await db.query('ROLLBACK TO SAVEPOINT public_booking_candidate');
   await db.query('RELEASE SAVEPOINT public_booking_candidate');
  }
 }
 return null;
}

export async function bookingSlots(db:Db,company:string,date:string,timezone:string,serviceIds:string[],duration:number){
 // UTC generation and local comparisons handle offset/DST changes without relying
 // on the API host's timezone. Reading slots never locks or reserves resources.
 const result=await db.query(`WITH moments AS (
  SELECT stamp AS starts_at,stamp+($5::int*interval '1 minute') AS ends_at
  FROM generate_series(($2::date::timestamp AT TIME ZONE $3),
   (($2::date+1)::timestamp AT TIME ZONE $3)-interval '15 minutes',interval '15 minutes') AS stamp
 ), available AS (
  SELECT m.starts_at,m.ends_at FROM moments m
  WHERE m.starts_at>now() AND (m.ends_at AT TIME ZONE $3)::date=$2::date
   AND EXISTS(SELECT 1 FROM professionals p WHERE p.tenant_id=$1 AND p.active=true
    AND (SELECT count(*) FROM professional_services ps WHERE ps.tenant_id=p.tenant_id
     AND ps.professional_id=p.id AND ps.service_id=ANY($4::uuid[]))=cardinality($4::uuid[])
    AND EXISTS(SELECT 1 FROM professional_shifts sh WHERE sh.tenant_id=p.tenant_id AND sh.professional_id=p.id
     AND sh.weekday=extract(isodow FROM m.starts_at AT TIME ZONE $3)
     AND sh.start_time<=(m.starts_at AT TIME ZONE $3)::time AND sh.end_time>=(m.ends_at AT TIME ZONE $3)::time)
    AND NOT EXISTS(SELECT 1 FROM professional_breaks br WHERE br.tenant_id=p.tenant_id AND br.professional_id=p.id
     AND br.weekday=extract(isodow FROM m.starts_at AT TIME ZONE $3)
     AND br.start_time<(m.ends_at AT TIME ZONE $3)::time AND br.end_time>(m.starts_at AT TIME ZONE $3)::time)
    AND NOT EXISTS(SELECT 1 FROM professional_absences ab WHERE ab.tenant_id=p.tenant_id AND ab.professional_id=p.id
     AND tstzrange(ab.starts_at,ab.ends_at,'[)') && tstzrange(m.starts_at,m.ends_at,'[)'))
    AND NOT EXISTS(SELECT 1 FROM appointments a WHERE a.tenant_id=p.tenant_id AND a.professional_id=p.id
     AND a.status IN ('pending','confirmed','in_progress')
     AND tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(m.starts_at,m.ends_at,'[)')))
 ) SELECT starts_at,ends_at FROM available ORDER BY starts_at LIMIT 100`,[company,date,timezone,serviceIds,duration]);
 return result.rows.map(row=>({starts_at:new Date(row.starts_at).toISOString(),ends_at:new Date(row.ends_at).toISOString()}));
}
