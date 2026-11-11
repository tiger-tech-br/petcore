import {z} from 'zod';
import type {Request} from 'express';
import type {PoolClient} from 'pg';
import {ensure,type Db} from './core.js';
import {recordAudit} from './audit.js';
import {assertFutureAppointmentStart} from './scheduling.js';

const tripInput=z.object({driver_id:z.uuid(),starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true})}).strict();
export const taxiDraft=z.object({service_id:z.uuid(),address:z.string().trim().min(8).max(600),reference:z.string().trim().max(300).default(''),notes:z.string().trim().max(1000).default(''),pickup:tripInput.optional(),dropoff:tripInput.optional()}).strict();
export type TaxiDraft=z.infer<typeof taxiDraft>;
export type TaxiAppointment={id:string;tutor_id:string;professional_id:string;starts_at:string|Date;ends_at:string|Date;status:string};
export function canTaxi(req:Request){return req.access!.role==='admin'||req.access!.permissions.includes('taxi_dog');}
export function requireTaxi(req:Request){ensure(canTaxi(req),403,'Sem permissão para gerenciar o Táxi Dog.');}
export async function taxiOptions(db:Db,company:string,allowed=true){
 const settings=await db.query("SELECT taxi_dog_enabled,timezone FROM tenants WHERE id=$1",[company]);
 ensure(settings.rowCount,404,'Empresa não encontrada.');
 const [services,drivers]=allowed?await Promise.all([
  db.query("SELECT id,name,price_cents,service_type,transport_mode,duration_minutes FROM services WHERE tenant_id=$1 AND service_type='transport' AND active=true ORDER BY name,id",[company]),
  db.query('SELECT id,name,phone,active FROM taxi_drivers WHERE tenant_id=$1 AND active=true ORDER BY name,id',[company])
 ]):[{rows:[]},{rows:[]}];
 return {enabled:settings.rows[0].taxi_dog_enabled,timezone:settings.rows[0].timezone,server_now:new Date().toISOString(),services:services.rows,drivers:drivers.rows};
}
export async function getTaxiBooking(db:Db,company:string,appointmentId:string){
 const result=await db.query(`SELECT b.*,
  NOT EXISTS(SELECT 1 FROM business_sales s WHERE s.tenant_id=b.tenant_id AND s.appointment_id=b.appointment_id)
  AND NOT EXISTS(SELECT 1 FROM taxi_trips t WHERE t.tenant_id=b.tenant_id AND t.booking_id=b.id AND (b.mode='round_trip' OR t.leg=b.mode) AND t.status NOT IN ('scheduled','cancelled'))
  AND NOT(b.cancelled_at IS NULL AND EXISTS(SELECT 1 FROM taxi_trips t WHERE t.tenant_id=b.tenant_id AND t.booking_id=b.id AND (b.mode='round_trip' OR t.leg=b.mode) AND t.status='cancelled')) AS editable
  FROM taxi_bookings b WHERE b.tenant_id=$1 AND b.appointment_id=$2`,[company,appointmentId]);
 if(!result.rowCount)return null;
 const row=result.rows[0];
 const trips=await db.query(`SELECT t.id,t.booking_id,t.leg,t.driver_id,d.name AS driver_name,t.starts_at,t.ends_at,t.status,t.updated_at
  FROM taxi_trips t JOIN taxi_drivers d ON d.tenant_id=t.tenant_id AND d.id=t.driver_id
  WHERE t.tenant_id=$1 AND t.booking_id=$2 AND ($3::text='round_trip' OR t.leg=$3::text) ORDER BY t.starts_at,t.leg`,[company,row.id,row.mode]);
 const {tenant_id,created_by,...publicRow}=row;
 return {...publicRow,trips:trips.rows};
}
export async function lockTaxiAppointment(db:PoolClient,company:string,id:string){
 const target=await db.query('SELECT tutor_id FROM appointments WHERE tenant_id=$1 AND id=$2',[company,id]);
 ensure(target.rowCount,404,'Atendimento não encontrado.');
 const tutor=await db.query('SELECT anonymized_at FROM tutors WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,target.rows[0].tutor_id]);
 ensure(tutor.rowCount,404,'Cliente não encontrado.');ensure(!tutor.rows[0].anonymized_at,409,'Este cadastro já foi anonimizado.');
 const appointment=await db.query('SELECT * FROM appointments WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);
 ensure(appointment.rowCount,404,'Atendimento não encontrado.');return appointment.rows[0] as TaxiAppointment;
}
function validateTrip(leg:string,input:z.infer<typeof tripInput>,appointment:TaxiAppointment){
 const start=new Date(input.starts_at),end=new Date(input.ends_at);assertFutureAppointmentStart(start);
 ensure(end>start&&(end.getTime()-start.getTime())<=12*3600000,422,'O transporte precisa ter um intervalo válido de até 12 horas.');
 if(leg==='pickup')ensure(end<=new Date(appointment.starts_at),422,'A busca precisa terminar antes do início do atendimento.');
 else ensure(start>=new Date(appointment.ends_at),422,'A entrega precisa começar depois do término previsto do atendimento.');
}
// A chamada já possui tutor e atendimento travados, inclusive na criação atômica da agenda.
export async function saveTaxiBooking(db:PoolClient,req:Request,company:string,appointment:TaxiAppointment,raw:TaxiDraft|null){
 requireTaxi(req);
 const existing=await db.query('SELECT * FROM taxi_bookings WHERE tenant_id=$1 AND appointment_id=$2 FOR UPDATE',[company,appointment.id]);
 const old=existing.rows[0];
 const billed=await db.query('SELECT 1 FROM business_sales WHERE tenant_id=$1 AND appointment_id=$2 LIMIT 1',[company,appointment.id]);
 ensure(!billed.rowCount,409,'A comanda deste atendimento já foi criada. O transporte e seu valor não podem ser alterados.');
 if(old){
  const trips=await db.query("SELECT status FROM taxi_trips WHERE tenant_id=$1 AND booking_id=$2 AND ($3::text='round_trip' OR leg=$3::text)",[company,old.id,old.mode]);
  ensure(old.cancelled_at||!trips.rows.some(t=>t.status==='cancelled'),409,'Parte deste transporte foi cancelada. Finalize ou cancele os trechos restantes antes de criar outro planejamento.');
  ensure(trips.rows.every(t=>['scheduled','cancelled'].includes(t.status)),409,'O transporte já foi iniciado. Atualize as etapas sem alterar a reserva.');
 }
 if(raw===null){
  if(old&&!old.cancelled_at){
   await db.query("UPDATE taxi_trips SET status='cancelled',updated_at=now() WHERE tenant_id=$1 AND booking_id=$2 AND status='scheduled'",[company,old.id]);
   await db.query('UPDATE taxi_bookings SET cancelled_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2',[company,old.id]);
   await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'taxi.booking.cancel',entityType:'taxi_booking',entityId:old.id});
  }
  return getTaxiBooking(db,company,appointment.id);
 }
 const input=taxiDraft.parse(raw);
 const enabled=await db.query('SELECT taxi_dog_enabled FROM tenants WHERE id=$1 FOR SHARE',[company]);
 ensure(enabled.rows[0]?.taxi_dog_enabled,409,'Ative o Táxi Dog nas configurações deste pet shop.');
 ensure(['pending','confirmed'].includes(appointment.status),409,'Adicione ou ajuste o transporte antes de iniciar o atendimento.');
 const preserve=old&&!old.cancelled_at&&old.service_id===input.service_id;
 const service=await db.query("SELECT id,name,price_cents,transport_mode,active FROM services WHERE tenant_id=$1 AND id=$2 AND service_type='transport' FOR SHARE",[company,input.service_id]);
 ensure(service.rowCount&&(service.rows[0].active||preserve),422,'Escolha um serviço de Táxi Dog ativo desta empresa.');const s=service.rows[0];
 const mode=preserve?old.mode:s.transport_mode;
 const expected=mode==='round_trip'?['pickup','dropoff']:[mode];
 ensure(Boolean(input.pickup)===expected.includes('pickup')&&Boolean(input.dropoff)===expected.includes('dropoff'),422,'Informe exatamente os trajetos previstos no serviço de Táxi Dog.');
 const legs=expected.map((leg:string)=>({leg,input:input[leg as 'pickup'|'dropoff']!}));
 for(const leg of legs)validateTrip(leg.leg,leg.input,appointment);
 const driverIds=[...new Set(legs.map((l:{input:z.infer<typeof tripInput>})=>l.input.driver_id))].sort();
 for(const driverId of driverIds){const d=await db.query('SELECT id FROM taxi_drivers WHERE tenant_id=$1 AND id=$2 AND active=true FOR UPDATE',[company,driverId]);ensure(d.rowCount,422,'Motorista indisponível ou de outra empresa.');}
 // Reutilizar a reserva não altera snapshots de preço/nome já aceitos pelo tutor.
 const booked=await db.query(`INSERT INTO taxi_bookings(tenant_id,appointment_id,service_id,service_name,price_cents,mode,address,reference,notes,created_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  ON CONFLICT(tenant_id,appointment_id) DO UPDATE SET service_id=EXCLUDED.service_id,service_name=EXCLUDED.service_name,price_cents=EXCLUDED.price_cents,
  mode=EXCLUDED.mode,address=EXCLUDED.address,reference=EXCLUDED.reference,notes=EXCLUDED.notes,cancelled_at=NULL,updated_at=now() RETURNING id`,
 [company,appointment.id,input.service_id,preserve?old.service_name:s.name,preserve?old.price_cents:s.price_cents,mode,input.address,input.reference,input.notes,req.access!.userId]);
 const bookingId=booked.rows[0].id;
 // Libertar os intervalos antigos antes de transferir motorista ou horários; a transação mantém a operação atômica.
 await db.query("UPDATE taxi_trips SET status='cancelled',updated_at=now() WHERE tenant_id=$1 AND booking_id=$2 AND status='scheduled'",[company,bookingId]);
 for(const leg of legs){
  validateTrip(leg.leg,leg.input,appointment);
  const clash=await db.query(`SELECT 1 FROM taxi_trips WHERE tenant_id=$1 AND driver_id=$2 AND status IN ('scheduled','en_route','with_pet')
   AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`,[company,leg.input.driver_id,leg.input.starts_at,leg.input.ends_at]);
  ensure(!clash.rowCount,409,'O motorista já possui outro transporte neste intervalo.');
  await db.query(`INSERT INTO taxi_trips(tenant_id,booking_id,leg,driver_id,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(tenant_id,booking_id,leg) DO UPDATE SET driver_id=EXCLUDED.driver_id,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,status='scheduled',updated_at=now()`,
  [company,bookingId,leg.leg,leg.input.driver_id,leg.input.starts_at,leg.input.ends_at]);
 }
 await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:old?'taxi.booking.update':'taxi.booking.create',entityType:'taxi_booking',entityId:bookingId,metadata:{appointmentId:appointment.id,serviceId:input.service_id,mode}});
 return getTaxiBooking(db,company,appointment.id);
}
export async function validateTaxiForAppointmentMove(db:PoolClient,company:string,appointment:TaxiAppointment){
 const bookings=await db.query('SELECT id,mode FROM taxi_bookings WHERE tenant_id=$1 AND appointment_id=$2 AND cancelled_at IS NULL FOR UPDATE',[company,appointment.id]);
 if(!bookings.rowCount)return;
 const trips=await db.query("SELECT * FROM taxi_trips WHERE tenant_id=$1 AND booking_id=$2 AND ($3::text='round_trip' OR leg=$3::text) ORDER BY leg FOR UPDATE",[company,bookings.rows[0].id,bookings.rows[0].mode]);
 ensure(trips.rows.every(t=>['scheduled','cancelled'].includes(t.status)),409,'O Táxi Dog já foi iniciado; conclua o transporte antes de reagendar.');
 for(const t of trips.rows.filter(t=>t.status!=='cancelled'))validateTrip(t.leg,t,appointment);
}
export async function cancelTaxiForAppointment(db:PoolClient,company:string,appointmentId:string,nextStatus='cancelled',actorId:string|null=null){
 const bookings=await db.query(`SELECT b.id,b.mode,a.status AS appointment_status,
  EXISTS(SELECT 1 FROM appointment_events e WHERE e.tenant_id=a.tenant_id AND e.appointment_id=a.id AND e.kind='in_progress') AS previously_started
  FROM taxi_bookings b JOIN appointments a ON a.tenant_id=b.tenant_id AND a.id=b.appointment_id
  WHERE b.tenant_id=$1 AND b.appointment_id=$2 AND b.cancelled_at IS NULL FOR UPDATE OF b`,[company,appointmentId]);
 if(!bookings.rowCount)return;
 const booking=bookings.rows[0];
 const trips=await db.query("SELECT leg,status FROM taxi_trips WHERE tenant_id=$1 AND booking_id=$2 AND ($3::text='round_trip' OR leg=$3::text) ORDER BY leg FOR UPDATE",[company,booking.id,booking.mode]);
 ensure(!trips.rows.some(t=>['en_route','with_pet'].includes(t.status)),409,'Finalize o transporte em andamento antes de cancelar o atendimento ou registrar falta.');
 const pickup=trips.rows.find(t=>t.leg==='pickup');
 const petAtShop=pickup?.status==='completed'||['in_progress','done'].includes(booking.appointment_status)||booking.previously_started;
 ensure(nextStatus!=='no_show'||!petAtShop,409,'O pet já chegou ao estabelecimento. Cancele o atendimento e organize a entrega ao tutor em vez de registrar falta.');
 // Após a chegada do pet, cancelar o banho não cancela seu retorno para casa.
 // Em contratos somente de entrega, a recepção organiza a chegada por conta própria.
 const preserveReturn=nextStatus==='cancelled'&&(petAtShop||!pickup);
 await db.query("UPDATE taxi_trips SET status='cancelled',updated_at=now() WHERE tenant_id=$1 AND booking_id=$2 AND status='scheduled' AND NOT($3::boolean AND leg='dropoff')",[company,bookings.rows[0].id,preserveReturn]);
 if(!preserveReturn&&trips.rows.every(t=>['scheduled','cancelled'].includes(t.status)))await db.query('UPDATE taxi_bookings SET cancelled_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2',[company,bookings.rows[0].id]);
 if(preserveReturn&&trips.rows.some(t=>t.leg==='dropoff'&&t.status==='scheduled'))await recordAudit(db,{tenantId:company,userId:actorId,action:'taxi.return.preserved',entityType:'taxi_booking',entityId:bookings.rows[0].id,metadata:{appointmentId}});
}
