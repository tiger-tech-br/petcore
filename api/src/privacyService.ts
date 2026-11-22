import {randomUUID} from 'node:crypto';
import {S3Client,DeleteObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {Pool,type PoolClient} from 'pg';
import {ensure,pool,tx} from './core.js';
import {recordAudit} from './audit.js';
import {PHOTO_BACKUP_LOCK} from './photoBackup.js';
import {directDatabaseLockOptions} from './databaseLocks.js';

export const requestColumns=`r.id,r.tutor_id,t.name AS tutor_name,t.anonymized_at,r.kind,r.status,
 r.description,r.identity_verified,r.verification_method,r.identity_verified_at,
 r.resolution,r.created_at,r.updated_at,r.resolved_at,u.name AS created_by_name`;
export const requestJoin=`FROM privacy_requests r JOIN tutors t ON t.tenant_id=r.tenant_id AND t.id=r.tutor_id
 JOIN users u ON u.id=r.created_by`;

export async function requestEvent(db:PoolClient,company:string,id:string,user:string,action:string,status:string,reason:string|null=null){
 await db.query('INSERT INTO privacy_request_events(tenant_id,request_id,actor_user_id,action,status,reason_code) VALUES($1,$2,$3,$4,$5,$6)',[company,id,user,action,status,reason]);
}

function storage(){
 const endpoint=process.env.OBJECT_STORAGE_ENDPOINT,bucket=process.env.OBJECT_STORAGE_BUCKET;
 const access=process.env.OBJECT_STORAGE_ACCESS_KEY,secret=process.env.OBJECT_STORAGE_SECRET_KEY;
 if(!endpoint||!bucket||!access||!secret)return null;
 return {bucket,client:new S3Client({endpoint,region:process.env.OBJECT_STORAGE_REGION||'auto',forcePathStyle:true,
  credentials:{accessKeyId:access,secretAccessKey:secret}})};
}

export async function exportSubject(company:string,requestId:string,user:string){
 const data=await tx(async db=>{
  const target=await db.query('SELECT tutor_id FROM privacy_requests WHERE tenant_id=$1 AND id=$2',[company,requestId]);
  ensure(target.rowCount,404,'Solicitação não encontrada.');
  const tutor=await db.query(`SELECT id,name,phone,email,notes,created_at,anonymized_at,
   email_reminders_opt_in,email_reminders_opt_in_at FROM tutors WHERE tenant_id=$1 AND id=$2 FOR SHARE`,[company,target.rows[0].tutor_id]);
  ensure(tutor.rowCount,404,'Cliente não encontrado.');
  const request=await db.query('SELECT * FROM privacy_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,requestId]);
  const item=request.rows[0];
  ensure(item.identity_verified,409,'Verifique a identidade do titular antes de exportar dados.');
  ensure(!['completed','rejected'].includes(item.status),409,'Esta solicitação já foi encerrada. Abra uma nova solicitação para outra entrega.');
  const size=await db.query(`SELECT
   (SELECT count(*) FROM appointments WHERE tenant_id=$1 AND tutor_id=$2)+
   (SELECT count(*) FROM crm_contacts WHERE tenant_id=$1 AND tutor_id=$2)+
   (SELECT count(*) FROM crm_tasks WHERE tenant_id=$1 AND tutor_id=$2)+
   (SELECT count(*) FROM business_sales WHERE tenant_id=$1 AND tutor_id=$2)+
   (SELECT count(*) FROM taxi_bookings b JOIN appointments a ON a.tenant_id=b.tenant_id AND a.id=b.appointment_id WHERE a.tenant_id=$1 AND a.tutor_id=$2)+
   (SELECT count(*) FROM taxi_trips t JOIN taxi_bookings b ON b.tenant_id=t.tenant_id AND b.id=t.booking_id JOIN appointments a ON a.tenant_id=b.tenant_id AND a.id=b.appointment_id WHERE a.tenant_id=$1 AND a.tutor_id=$2)+
   (SELECT count(*) FROM public_booking_requests r JOIN appointments a ON a.tenant_id=r.tenant_id AND a.id=r.appointment_id WHERE a.tenant_id=$1 AND a.tutor_id=$2)+
   (SELECT count(*) FROM business_delivery_orders d JOIN business_sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id WHERE s.tenant_id=$1 AND s.tutor_id=$2)+
   (SELECT count(*) FROM business_delivery_events e JOIN business_delivery_orders d ON d.tenant_id=e.tenant_id AND d.id=e.delivery_id JOIN business_sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id WHERE s.tenant_id=$1 AND s.tutor_id=$2)+
   (SELECT count(*) FROM public_delivery_requests r JOIN business_delivery_orders d ON d.tenant_id=r.tenant_id AND d.id=r.delivery_order_id JOIN business_sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id WHERE s.tenant_id=$1 AND s.tutor_id=$2) AS total`,[company,item.tutor_id]);
  ensure(Number(size.rows[0].total)<=25000,413,'Este histórico precisa de exportação assistida em lotes pelo responsável pelo sistema.');
  const pets=await db.query('SELECT id,name,species,breed,size,birth_date,notes,created_at,photo_key FROM pets WHERE tenant_id=$1 AND tutor_id=$2 ORDER BY created_at,id',[company,item.tutor_id]);
  const appointments=await db.query(`SELECT a.id,a.pet_id,p.name AS pet_name,a.starts_at,a.ends_at,a.status,a.notes,
   COALESCE((SELECT json_agg(json_build_object('service_id',s.service_id,'name',v.name,'price_cents',s.price_cents,'duration_minutes',s.duration_minutes) ORDER BY s.position)
    FROM appointment_services s JOIN services v ON v.tenant_id=s.tenant_id AND v.id=s.service_id WHERE s.tenant_id=a.tenant_id AND s.appointment_id=a.id),'[]'::json) AS services
   FROM appointments a JOIN pets p ON p.tenant_id=a.tenant_id AND p.id=a.pet_id WHERE a.tenant_id=$1 AND a.tutor_id=$2 ORDER BY a.starts_at,a.id`,[company,item.tutor_id]);
  // Um PoolClient representa uma conexão e executa suas consultas em sequência.
  const contacts=await db.query('SELECT id,channel,summary,occurred_at,created_at FROM crm_contacts WHERE tenant_id=$1 AND tutor_id=$2 ORDER BY occurred_at,id',[company,item.tutor_id]);
  const tasks=await db.query('SELECT id,title,notes,due_at,status,created_at,completed_at FROM crm_tasks WHERE tenant_id=$1 AND tutor_id=$2 ORDER BY created_at,id',[company,item.tutor_id]);
  const consents=await db.query('SELECT email,action,created_at FROM tutor_email_reminder_consent_events WHERE tenant_id=$1 AND tutor_id=$2 ORDER BY event_order',[company,item.tutor_id]);
  const waitlist=await db.query('SELECT id,pet_id,earliest_at,latest_at,status,notes FROM waitlist WHERE tenant_id=$1 AND tutor_id=$2 ORDER BY earliest_at,id',[company,item.tutor_id]);
  const taxiBookings=await db.query(`SELECT b.id,b.appointment_id,b.service_id,b.service_name,b.price_cents,b.mode,b.address,b.reference,b.notes,b.cancelled_at,b.created_at,b.updated_at
   FROM taxi_bookings b JOIN appointments a ON a.tenant_id=b.tenant_id AND a.id=b.appointment_id
   WHERE a.tenant_id=$1 AND a.tutor_id=$2 ORDER BY b.created_at,b.id`,[company,item.tutor_id]);
  const taxiTrips=await db.query(`SELECT t.id,t.booking_id,t.leg,d.name AS driver_name,t.starts_at,t.ends_at,t.status,t.created_at,t.updated_at
   FROM taxi_trips t JOIN taxi_drivers d ON d.tenant_id=t.tenant_id AND d.id=t.driver_id
   JOIN taxi_bookings b ON b.tenant_id=t.tenant_id AND b.id=t.booking_id
   JOIN appointments a ON a.tenant_id=b.tenant_id AND a.id=b.appointment_id
   WHERE a.tenant_id=$1 AND a.tutor_id=$2 ORDER BY t.starts_at,t.id`,[company,item.tutor_id]);
  const sales=await db.query(`SELECT s.id,s.appointment_id,s.status,s.notes,s.created_at,to_jsonb(s)-'tenant_id'-'created_by' AS financial_record,
    COALESCE((SELECT json_agg(to_jsonb(i)-'tenant_id') FROM business_sale_items i WHERE i.tenant_id=s.tenant_id AND i.sale_id=s.id),'[]'::json) AS items,
    COALESCE((SELECT json_agg(to_jsonb(l)-'tenant_id'-'created_by') FROM business_ledger l WHERE l.tenant_id=s.tenant_id AND l.sale_id=s.id),'[]'::json) AS transactions
    FROM business_sales s WHERE s.tenant_id=$1 AND s.tutor_id=$2 ORDER BY s.created_at,s.id`,[company,item.tutor_id]);
  const publicBookings=await db.query(`SELECT r.id,r.status,r.tutor_name,r.tutor_phone,r.tutor_email,
   r.pet_name,r.pet_species,r.pet_size,r.pet_breed,r.starts_at,r.ends_at,r.appointment_id,r.rejection_reason,r.created_at,r.reviewed_at,
   COALESCE((SELECT json_agg(json_build_object('service_id',s.service_id,'name',s.name,'price_cents',s.price_cents,'duration_minutes',s.duration_minutes) ORDER BY s.position)
    FROM public_booking_request_services s WHERE s.tenant_id=r.tenant_id AND s.request_id=r.id),'[]'::json) AS services
   FROM public_booking_requests r JOIN appointments a ON a.tenant_id=r.tenant_id AND a.id=r.appointment_id
   WHERE a.tenant_id=$1 AND a.tutor_id=$2 ORDER BY r.created_at,r.id`,[company,item.tutor_id]);
  const deliveries=await db.query(`SELECT d.id,d.sale_id,d.status,d.address,d.phone,d.reference,d.notes,d.cancellation_reason,
   d.created_at,d.updated_at,d.out_for_delivery_at,d.delivered_at,d.cancelled_at
   FROM business_delivery_orders d JOIN business_sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id
   WHERE s.tenant_id=$1 AND s.tutor_id=$2 ORDER BY d.created_at,d.id`,[company,item.tutor_id]);
  const deliveryEvents=await db.query(`SELECT e.id,e.delivery_id,e.old_status,e.new_status,e.reason,e.created_at
   FROM business_delivery_events e JOIN business_delivery_orders d ON d.tenant_id=e.tenant_id AND d.id=e.delivery_id
   JOIN business_sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id
   WHERE s.tenant_id=$1 AND s.tutor_id=$2 ORDER BY e.created_at,e.id`,[company,item.tutor_id]);
  const publicDeliveries=await db.query(`SELECT r.id,r.status,r.customer_name,r.phone,r.address,r.reference,r.notes,
   r.subtotal_cents,r.quoted_delivery_fee_cents,r.delivery_order_id,r.rejection_reason,r.created_at,r.reviewed_at,
   COALESCE((SELECT json_agg(json_build_object('product_id',i.product_id,'name',i.name,'unit',i.unit,'quantity',i.quantity,'unit_price_cents',i.unit_price_cents) ORDER BY i.position)
    FROM public_delivery_request_items i WHERE i.tenant_id=r.tenant_id AND i.request_id=r.id),'[]'::json) AS items
   FROM public_delivery_requests r JOIN business_delivery_orders d ON d.tenant_id=r.tenant_id AND d.id=r.delivery_order_id
   JOIN business_sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id
   WHERE s.tenant_id=$1 AND s.tutor_id=$2 ORDER BY r.created_at,r.id`,[company,item.tutor_id]);
  await db.query("UPDATE privacy_requests SET status='in_progress',updated_at=now() WHERE tenant_id=$1 AND id=$2",[company,requestId]);
  await requestEvent(db,company,requestId,user,'exported','in_progress');
  await recordAudit(db,{tenantId:company,userId:user,action:'privacy.export',entityType:'privacy_request',entityId:requestId,metadata:{tutorId:item.tutor_id}});
  return {format:'petcore.subject-export.v1',exported_at:new Date().toISOString(),request_id:requestId,
   tutor:tutor.rows[0],pets:pets.rows,appointments:appointments.rows,contacts:contacts.rows,tasks:tasks.rows,
   email_reminder_consent_history:consents.rows,waitlist:waitlist.rows,sales:sales.rows,
   public_booking_requests:publicBookings.rows,taxi_dog:{bookings:taxiBookings.rows,trips:taxiTrips.rows},
   deliveries:{orders:deliveries.rows,events:deliveryEvents.rows,public_requests:publicDeliveries.rows}};
 });
 const configured=storage();
 const photoDownloads:{petId:string;url:string|null;expiresAt:string|null;status:string}[]=[];
 for(const pet of data.pets){
  const key=pet.photo_key;
  delete pet.photo_key;
  if(!key)continue;
  ensure(key.startsWith(`tenants/${company}/pets/${pet.id}/`),409,'Uma foto precisa de revisão de armazenamento antes da exportação.');
  if(!configured){photoDownloads.push({petId:pet.id,url:null,expiresAt:null,status:'storage_unavailable'});continue;}
  try{
   const url=await getSignedUrl(configured.client,new GetObjectCommand({Bucket:configured.bucket,Key:key}),{expiresIn:900});
   photoDownloads.push({petId:pet.id,url,expiresAt:new Date(Date.now()+900000).toISOString(),status:'available'});
  }catch{photoDownloads.push({petId:pet.id,url:null,expiresAt:null,status:'storage_unavailable'});}
 }
 return {...data,photo_downloads:photoDownloads,delivery_notes:photoDownloads.some(p=>p.status!=='available')?
  ['Há fotos pendentes de entrega. O administrador deve disponibilizar uma cópia segura pelo armazenamento configurado.']:[],
  retention_note:'Registros necessários a obrigações legais e exercício de direitos podem ter retenção específica, definida e documentada pelo controlador.'};
}

export async function anonymizeSubject(company:string,requestId:string,user:string,reason:string){
 return tx(async db=>{
  const target=await db.query('SELECT tutor_id FROM privacy_requests WHERE tenant_id=$1 AND id=$2',[company,requestId]);
  ensure(target.rowCount,404,'Solicitação não encontrada.');
  // Tutor antes da solicitação: a mesma ordem nas exportações e gravações evita
  // deadlock entre duas solicitações de um titular e a limpeza do histórico.
  const tutor=await db.query('SELECT id,anonymized_at,email,email_reminders_opt_in FROM tutors WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,target.rows[0].tutor_id]);
  ensure(tutor.rowCount,404,'Cliente não encontrado.');
  const request=await db.query('SELECT * FROM privacy_requests WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,requestId]);
  const item=request.rows[0];
  ensure(item.kind==='anonymization',409,'Use uma solicitação do tipo anonimização.');
  ensure(item.identity_verified,409,'Verifique a identidade do titular antes de anonimizar.');
  ensure(!['completed','rejected'].includes(item.status),409,'Esta solicitação já foi encerrada.');
  ensure(!tutor.rows[0].anonymized_at,409,'Este cadastro já foi anonimizado.');
  // Creating a delivery locks this tutor first. Closed delivery states cannot
  // reopen, so contact details may be cleared only once fulfillment has ended.
  const activeDelivery=await db.query(`SELECT 1 FROM business_delivery_orders d JOIN business_sales s ON s.tenant_id=d.tenant_id AND s.id=d.sale_id
   WHERE s.tenant_id=$1 AND s.tutor_id=$2 AND d.status IN ('preparing','out_for_delivery') LIMIT 1`,[company,item.tutor_id]);
  ensure(!activeDelivery.rowCount,409,'Conclua ou cancele as entregas de produtos pendentes antes de anonimizar este cadastro.');
  const appointments=await db.query(`SELECT a.id,a.status,
   EXISTS(SELECT 1 FROM appointment_events e WHERE e.tenant_id=a.tenant_id AND e.appointment_id=a.id AND e.kind='in_progress') AS previously_started
   FROM appointments a WHERE a.tenant_id=$1 AND a.tutor_id=$2 FOR UPDATE OF a`,[company,item.tutor_id]);
  ensure(!appointments.rows.some(row=>row.status==='in_progress'),409,'Finalize os atendimentos em andamento antes de anonimizar este cadastro.');
  // Mesma ordem de travas dos transportes: tutor, atendimento, reserva, viagens.
  const taxiBookings=await db.query(`SELECT b.id,b.mode,b.appointment_id FROM taxi_bookings b JOIN appointments a ON a.tenant_id=b.tenant_id AND a.id=b.appointment_id
   WHERE a.tenant_id=$1 AND a.tutor_id=$2 ORDER BY b.id FOR UPDATE OF b`,[company,item.tutor_id]);
  const taxiIds=taxiBookings.rows.map(row=>row.id);
  const taxiTrips=await db.query('SELECT id,booking_id,leg,status FROM taxi_trips WHERE tenant_id=$1 AND booking_id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',[company,taxiIds]);
  ensure(!taxiTrips.rows.some(row=>['en_route','with_pet'].includes(row.status)),409,'Finalize o transporte em andamento antes de anonimizar este cadastro.');
  const custodyAppointments=new Set(appointments.rows.filter(row=>['in_progress','done'].includes(row.status)||row.previously_started).map(row=>row.id));
  const bookingsById=new Map(taxiBookings.rows.map(row=>[row.id,row]));
  const completedPickups=new Set(taxiTrips.rows.filter(trip=>trip.leg==='pickup'&&trip.status==='completed').map(trip=>trip.booking_id));
  const awaitingReturn=taxiTrips.rows.some(trip=>{
   const booking=bookingsById.get(trip.booking_id);
   return booking&&booking.mode!=='pickup'&&trip.leg==='dropoff'&&trip.status==='scheduled'&&
    (custodyAppointments.has(booking.appointment_id)||completedPickups.has(trip.booking_id));
  });
  ensure(!awaitingReturn,409,'Há um pet no estabelecimento aguardando a entrega. Conclua a devolução ou registre a retirada pelo tutor antes de anonimizar.');
  const sending=await db.query(`SELECT j.claimed_by,j.claim_expires_at FROM reminder_jobs j JOIN appointments a
   ON a.tenant_id=j.tenant_id AND a.id=j.appointment_id WHERE a.tenant_id=$1 AND a.tutor_id=$2 FOR UPDATE OF j`,[company,item.tutor_id]);
  ensure(!sending.rows.some(row=>row.claimed_by&&row.claim_expires_at&&new Date(row.claim_expires_at)>new Date()),409,
   'Há um lembrete em processamento. Aguarde seu encerramento antes de desidentificar o cadastro.');
  const photos=await db.query('SELECT id,photo_key FROM pets WHERE tenant_id=$1 AND tutor_id=$2 FOR UPDATE',[company,item.tutor_id]);
  for(const photo of photos.rows){
   if(!photo.photo_key)continue;
   ensure(photo.photo_key.startsWith(`tenants/${company}/pets/${photo.id}/`),409,'Uma foto precisa de revisão de armazenamento antes de anonimizar.');
   await db.query(`INSERT INTO object_deletion_jobs(tenant_id,request_id,object_key) VALUES($1,$2,$3)
    ON CONFLICT(tenant_id,object_key) DO NOTHING`,[company,requestId,photo.photo_key]);
  }
  if(tutor.rows[0].email_reminders_opt_in)await db.query(`INSERT INTO tutor_email_reminder_consent_events(tenant_id,tutor_id,actor_user_id,email,action)
   VALUES($1,$2,$3,NULL,'revoked')`,[company,item.tutor_id,user]);
  await db.query(`UPDATE tutors SET name='Titular anonimizado',phone='',email=NULL,notes='',anonymized_at=now(),
   email_reminders_opt_in=false,email_reminders_opt_in_at=NULL,email_reminders_opt_in_by=NULL WHERE tenant_id=$1 AND id=$2`,[company,item.tutor_id]);
  await db.query("UPDATE pets SET name='Pet de cadastro anonimizado',notes='',photo_key=NULL WHERE tenant_id=$1 AND tutor_id=$2",[company,item.tutor_id]);
  // Explicit appointment identity is required: never merge/delete public contacts
  // just because an unverified name, phone or email resembles this tutor.
  await db.query(`DELETE FROM public_booking_requests r USING appointments a
   WHERE a.tenant_id=$1 AND a.tutor_id=$2 AND r.tenant_id=a.tenant_id AND r.appointment_id=a.id`,[company,item.tutor_id]);
  // Only a confirmed delivery/sale identity links a public request to a tutor.
  // Unconfirmed contacts with a matching phone/name belong to no inferred user.
  await db.query(`DELETE FROM public_delivery_requests r USING business_delivery_orders d,business_sales s
   WHERE s.tenant_id=$1 AND s.tutor_id=$2 AND d.tenant_id=s.tenant_id AND d.sale_id=s.id
    AND r.tenant_id=d.tenant_id AND r.delivery_order_id=d.id`,[company,item.tutor_id]);
  await db.query("UPDATE crm_contacts SET summary='Conteúdo removido por solicitação de privacidade.' WHERE tenant_id=$1 AND tutor_id=$2",[company,item.tutor_id]);
  await db.query("UPDATE crm_tasks SET title='Retorno encerrado por privacidade',notes='',status=CASE WHEN status='open' THEN 'cancelled' ELSE status END,updated_at=now() WHERE tenant_id=$1 AND tutor_id=$2",[company,item.tutor_id]);
  await db.query("UPDATE waitlist SET notes='',status=CASE WHEN status IN ('waiting','offered') THEN 'closed' ELSE status END WHERE tenant_id=$1 AND tutor_id=$2",[company,item.tutor_id]);
  await db.query(`UPDATE taxi_bookings b SET address='',reference='',notes='',updated_at=now(),
   cancelled_at=CASE WHEN EXISTS(SELECT 1 FROM taxi_trips t WHERE t.tenant_id=b.tenant_id AND t.booking_id=b.id AND t.status='scheduled') THEN COALESCE(b.cancelled_at,now()) ELSE b.cancelled_at END
   WHERE b.tenant_id=$1 AND b.id=ANY($2::uuid[])`,[company,taxiIds]);
  await db.query("UPDATE taxi_trips SET status='cancelled',updated_at=now() WHERE tenant_id=$1 AND booking_id=ANY($2::uuid[]) AND status='scheduled'",[company,taxiIds]);
  await db.query('UPDATE tutor_email_reminder_consent_events SET email=NULL WHERE tenant_id=$1 AND tutor_id=$2',[company,item.tutor_id]);
  const cancelled=await db.query(`UPDATE appointments SET notes='',updated_at=now(),status='cancelled'
   WHERE tenant_id=$1 AND tutor_id=$2 AND starts_at>=now() AND status IN ('pending','confirmed') RETURNING id`,[company,item.tutor_id]);
  await db.query("UPDATE appointments SET notes='',updated_at=now() WHERE tenant_id=$1 AND tutor_id=$2",[company,item.tutor_id]);
  for(const row of cancelled.rows)await db.query(`INSERT INTO appointment_events(tenant_id,appointment_id,actor_user_id,kind,reason)
   VALUES($1,$2,$3,'privacy_anonymized','Atendimento cancelado após solicitação de privacidade.')`,[company,row.id,user]);
  await db.query(`UPDATE appointment_events e SET reason='' FROM appointments a
   WHERE a.tenant_id=$1 AND a.tutor_id=$2 AND e.tenant_id=a.tenant_id AND e.appointment_id=a.id`,[company,item.tutor_id]);
  await db.query(`UPDATE reminder_jobs j SET state=CASE WHEN j.state IN ('queued','failed') THEN 'cancelled' ELSE j.state END,
   last_error=NULL,claimed_by=NULL,claim_expires_at=NULL FROM appointments a
   WHERE a.tenant_id=$1 AND a.tutor_id=$2 AND j.tenant_id=a.tenant_id AND j.appointment_id=a.id`,[company,item.tutor_id]);
  await db.query(`UPDATE reminder_delivery_attempts d SET error_message=NULL FROM appointments a
   WHERE a.tenant_id=$1 AND a.tutor_id=$2 AND d.tenant_id=a.tenant_id AND d.appointment_id=a.id`,[company,item.tutor_id]);
  await db.query("UPDATE business_sales SET notes='',cancellation_reason=CASE WHEN cancellation_reason IS NULL THEN NULL ELSE 'Texto removido por privacidade.' END WHERE tenant_id=$1 AND tutor_id=$2",[company,item.tutor_id]);
  await db.query(`UPDATE business_delivery_orders d SET address='',phone='',reference='',notes='',cancellation_reason='',updated_at=now()
   FROM business_sales s WHERE s.tenant_id=$1 AND s.tutor_id=$2 AND d.tenant_id=s.tenant_id AND d.sale_id=s.id`,[company,item.tutor_id]);
  await db.query(`UPDATE business_delivery_events e SET reason='' FROM business_delivery_orders d,business_sales s
   WHERE s.tenant_id=$1 AND s.tutor_id=$2 AND d.tenant_id=s.tenant_id AND d.sale_id=s.id
    AND e.tenant_id=d.tenant_id AND e.delivery_id=d.id`,[company,item.tutor_id]);
  await db.query(`UPDATE business_stock_movements m SET note='' FROM business_sales s WHERE s.tenant_id=$1 AND s.tutor_id=$2 AND m.tenant_id=s.tenant_id AND m.sale_id=s.id`,[company,item.tutor_id]);
  await db.query(`UPDATE privacy_requests SET description='Descrição removida após anonimização.',
   resolution='Cadastro e textos vinculados desidentificados. Registros financeiros preservados; arquivos e backups seguem o fluxo documentado.',
   status=CASE WHEN id=$3 THEN 'completed' WHEN status IN ('open','in_progress') THEN 'completed' ELSE status END,
   resolved_at=CASE WHEN status IN ('open','in_progress') OR id=$3 THEN now() ELSE resolved_at END,updated_at=now()
   WHERE tenant_id=$1 AND tutor_id=$2`,[company,item.tutor_id,requestId]);
  await requestEvent(db,company,requestId,user,'anonymized','completed',reason);
  await recordAudit(db,{tenantId:company,userId:user,action:'privacy.anonymize',entityType:'privacy_request',entityId:requestId,
   metadata:{tutorId:item.tutor_id,reasonCode:reason,cancelledAppointments:cancelled.rowCount??0,queuedPhotos:photos.rows.filter(p=>p.photo_key).length}});
  return {ok:true,cancelledAppointments:cancelled.rowCount??0,queuedPhotos:photos.rows.filter(p=>p.photo_key).length,
   message:'Dados do cadastro e textos vinculados desidentificados. Fotos estão na fila de exclusão; retenções legais e backups exigem o procedimento documentado.'};
 });
}

// O worker chama esta rotina sem expor chaves no painel. DeleteObject é idempotente.
export async function processObjectDeletionJobs(options:{tenantId?:string;limit?:number}={}){
 const configured=storage();
 ensure(configured,503,'Configure o armazenamento privado para processar exclusões de fotos.');
 const abort=new AbortController();let guardPool:Pool|undefined,guard:PoolClient|undefined,guardLost=false,locked=false;
 const disconnected=()=>{guardLost=true;abort.abort();};
 try{
  guardPool=new Pool(directDatabaseLockOptions());
  guardPool.on('error',()=>console.error(JSON.stringify({event:'photo_deletion_guard_connection_lost'})));
  guard=await guardPool.connect();guard.on('error',disconnected);
  locked=(await guard.query('SELECT pg_try_advisory_lock($1) AS locked',[PHOTO_BACKUP_LOCK])).rows[0].locked;
  if(!locked)return {processed:0,completed:0,failed:0,deferred:true};
 const limit=Math.max(1,Math.min(options.limit??10,20)),claim=randomUUID();
 const jobs=await tx(async db=>{
  const selected=await db.query(`SELECT id FROM object_deletion_jobs WHERE ($1::uuid IS NULL OR tenant_id=$1)
   AND attempt_count<10 AND next_attempt_at<=now()
   AND (state='queued' OR (state='processing' AND claimed_at<now()-interval '10 minutes'))
   ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT $2`,[options.tenantId??null,limit]);
  if(!selected.rowCount)return [];
  return (await db.query(`UPDATE object_deletion_jobs SET state='processing',claimed_by=$2,claimed_at=now(),attempt_count=attempt_count+1
   WHERE id=ANY($1::uuid[]) RETURNING id,tenant_id,object_key,attempt_count`,[selected.rows.map(r=>r.id),claim])).rows;
 });
 let completed=0,failed=0;
 for(const job of jobs){
  try{
   ensure(job.object_key.startsWith(`tenants/${job.tenant_id}/`),409,'Chave fora da empresa.');
   ensure(!guardLost,503,'A exclusão foi adiada para preservar a cópia de segurança.');
   await configured.client.send(new DeleteObjectCommand({Bucket:configured.bucket,Key:job.object_key}),{abortSignal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
   await pool.query("UPDATE object_deletion_jobs SET state='done',finished_at=now(),last_error_code=NULL,claimed_by=NULL,claimed_at=NULL WHERE id=$1 AND claimed_by=$2",[job.id,claim]);completed++;
  }catch(cause){
   const raw=cause as {name?:string;$metadata?:{httpStatusCode?:number}};
   const code=raw.$metadata?.httpStatusCode?`storage_${raw.$metadata.httpStatusCode}`:'storage_delete_failed';
   await pool.query(`UPDATE object_deletion_jobs SET state=CASE WHEN attempt_count>=10 THEN 'failed' ELSE 'queued' END,
    next_attempt_at=now()+($3::int*interval '1 minute'),last_error_code=$4,claimed_by=NULL,claimed_at=NULL
    WHERE id=$1 AND claimed_by=$2`,[job.id,claim,Math.min(60,2**job.attempt_count),code]);failed++;
  }
 }
 return {processed:jobs.length,completed,failed};
 }finally{
  if(locked&&!guardLost)await guard?.query('SELECT pg_advisory_unlock($1)',[PHOTO_BACKUP_LOCK]).catch(()=>{});
  guard?.removeListener('error',disconnected);guard?.release(guardLost);
  await guardPool?.end();
  configured.client.destroy();
 }
}
