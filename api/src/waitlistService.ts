import {ensure,type Db} from './core.js';

export function validateWaitlistWindow(earliest:Date,latest:Date,duration:number,now=Date.now()){
 ensure(Number.isFinite(earliest.valueOf())&&Number.isFinite(latest.valueOf())&&latest>earliest,422,'Informe um período válido para o atendimento.');
 ensure(latest.getTime()>now,422,'Esse período já terminou. Informe uma nova disponibilidade.');
 ensure(duration>=5&&Number.isFinite(duration),422,'Confira a duração do serviço antes de solicitar o encaixe.');
 ensure(latest.getTime()-Math.max(earliest.getTime(),Math.floor(now/60000)*60000+60000)>=duration*60000,422,'O período precisa ter tempo suficiente para realizar o serviço completo.');
 ensure(latest.getTime()-earliest.getTime()<=90*86400000,422,'Informe uma disponibilidade de no máximo 90 dias.');
}

/** Read-only suggestions. Booking still rechecks under the calendar transaction. */
export async function findWaitlistOpportunities(db:Db,company:string,request:{earliest_at:string;latest_at:string;service_id:string;professional_id:string|null},scope:string|null){
 const from=new Date(Math.max(new Date(request.earliest_at).getTime(),Math.floor(Date.now()/60000)*60000+60000));
 const until=new Date(Math.min(new Date(request.latest_at).getTime(),from.getTime()+90*86400000));
 const searchedUntil=until.toISOString();
 if(new Date(request.latest_at).getTime()<=Date.now())return {options:[],reason:'expired',searchedUntil};
 const service=(await db.query("SELECT duration_minutes FROM services WHERE tenant_id=$1 AND id=$2 AND active=true AND service_type='appointment'",[company,request.service_id])).rows[0];
 if(!service)return {options:[],reason:'service_unavailable',searchedUntil};
 const eligible=await db.query(`SELECT 1 FROM professionals p JOIN professional_services ps ON ps.tenant_id=p.tenant_id AND ps.professional_id=p.id
  WHERE p.tenant_id=$1 AND p.active=true AND ps.service_id=$2 AND ($3::uuid IS NULL OR p.id=$3) AND ($4::uuid IS NULL OR p.id=$4) LIMIT 1`,[company,request.service_id,request.professional_id,scope]);
 if(!eligible.rowCount)return {options:[],reason:'no_eligible_professional',searchedUntil};
 const result=await db.query(`WITH config AS (
  SELECT timezone FROM tenants WHERE id=$1
 ), eligible AS (
  SELECT p.id,p.name FROM professionals p JOIN professional_services ps ON ps.tenant_id=p.tenant_id AND ps.professional_id=p.id
  WHERE p.tenant_id=$1 AND p.active=true AND ps.service_id=$2 AND ($3::uuid IS NULL OR p.id=$3) AND ($4::uuid IS NULL OR p.id=$4)
 ), days AS (
  SELECT stamp::date AS day FROM config CROSS JOIN LATERAL generate_series(
   ($5::timestamptz AT TIME ZONE timezone)::date::timestamp,($6::timestamptz AT TIME ZONE timezone)::date::timestamp,interval '1 day') stamp
 ), bounds AS (
  SELECT p.id,p.name,d.day,c.timezone,
   greatest($5::timestamptz,(d.day+sh.start_time) AT TIME ZONE c.timezone) AS first,
   least($6::timestamptz,(d.day+sh.end_time) AT TIME ZONE c.timezone)-$7::int*interval '1 minute' AS last
  FROM eligible p CROSS JOIN days d CROSS JOIN config c JOIN professional_shifts sh ON sh.tenant_id=$1 AND sh.professional_id=p.id AND sh.weekday=extract(isodow FROM d.day)
 ), candidates AS (
  SELECT b.id,b.name,b.timezone,stamp AS starts_at FROM bounds b CROSS JOIN LATERAL generate_series(b.first,b.last,interval '15 minutes') stamp
  UNION SELECT id,name,timezone,last FROM bounds WHERE last>=first
  UNION SELECT b.id,b.name,b.timezone,a.ends_at FROM bounds b JOIN appointments a ON a.tenant_id=$1 AND a.professional_id=b.id
   AND a.status IN ('pending','confirmed','in_progress') AND a.ends_at BETWEEN b.first AND b.last
  UNION SELECT b.id,b.name,b.timezone,(b.day+br.end_time) AT TIME ZONE b.timezone FROM bounds b JOIN professional_breaks br
   ON br.tenant_id=$1 AND br.professional_id=b.id AND br.weekday=extract(isodow FROM b.day)
   WHERE (b.day+br.end_time) AT TIME ZONE b.timezone BETWEEN b.first AND b.last
  UNION SELECT b.id,b.name,b.timezone,ab.ends_at FROM bounds b JOIN professional_absences ab
   ON ab.tenant_id=$1 AND ab.professional_id=b.id AND ab.ends_at BETWEEN b.first AND b.last
 ), available AS (
  SELECT DISTINCT ON (m.starts_at) m.starts_at,m.id,m.name FROM candidates m
  WHERE m.starts_at>now() AND (m.starts_at AT TIME ZONE m.timezone)::date=((m.starts_at+$7::int*interval '1 minute') AT TIME ZONE m.timezone)::date
   AND NOT EXISTS(SELECT 1 FROM professional_breaks br WHERE br.tenant_id=$1 AND br.professional_id=m.id
    AND br.weekday=extract(isodow FROM m.starts_at AT TIME ZONE m.timezone)
    AND br.start_time<((m.starts_at+$7::int*interval '1 minute') AT TIME ZONE m.timezone)::time AND br.end_time>(m.starts_at AT TIME ZONE m.timezone)::time)
   AND NOT EXISTS(SELECT 1 FROM professional_absences ab WHERE ab.tenant_id=$1 AND ab.professional_id=m.id
    AND tstzrange(ab.starts_at,ab.ends_at,'[)') && tstzrange(m.starts_at,m.starts_at+$7::int*interval '1 minute','[)'))
   AND NOT EXISTS(SELECT 1 FROM appointments a WHERE a.tenant_id=$1 AND a.professional_id=m.id AND a.status IN ('pending','confirmed','in_progress')
    AND tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(m.starts_at,m.starts_at+$7::int*interval '1 minute','[)'))
  ORDER BY m.starts_at,m.id
 ) SELECT starts_at,starts_at+$7::int*interval '1 minute' AS ends_at,id AS professional_id,name AS professional_name
 FROM available ORDER BY starts_at LIMIT 5`,[company,request.service_id,request.professional_id,scope,from,until,service.duration_minutes]);
 return {options:result.rows.map(row=>({...row,starts_at:new Date(row.starts_at).toISOString(),ends_at:new Date(row.ends_at).toISOString()})),reason:result.rowCount?undefined:'no_availability',searchedUntil};
}
