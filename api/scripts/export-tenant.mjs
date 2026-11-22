// Assisted export only. Run in a protected operator environment after verifying
// the requesting administrator through the support/privacy procedure.
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {chmod,link,lstat,mkdir,open,realpath,unlink,writeFile} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {Pool} from 'pg';
import {GetObjectCommand} from '@aws-sdk/client-s3';
import {photoStorage,validatePhotoKey,PHOTO_BACKUP_LOCK} from '../dist/photoBackup.js';
import {directDatabaseLockOptions} from '../dist/databaseLocks.js';
import {privateTemporary,removeTemporary,safeCode,failure} from './backup.mjs';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_ROWS_PER_DATASET=1000000,MAX_TOTAL_BYTES=1024*1024*1024,MAX_PHOTOS=10000,MAX_PHOTO_BYTES=8*1024*1024;
const SCHEMA_LOCK=719381000;
const fields=value=>value.split(',');
const data=(table,columns,order='id')=>({name:table,table,columns:fields(columns),order});

// Deliberately explicit: new tenant tables need an export review. Never use a
// global database dump or row_to_json(*) to export credentials by accident.
export const tenantExportDatasets=[
 data('tutors','id,name,phone,email,notes,created_at,anonymized_at,email_reminders_opt_in,email_reminders_opt_in_at,email_reminders_opt_in_by'),
 data('pets','id,tutor_id,name,species,breed,size,birth_date,notes,created_at,photo_key'),
 data('professionals','id,name,user_id,active'),
 data('services','id,name,description,price_cents,duration_minutes,active,service_type,transport_mode'),
 data('professional_services','professional_id,service_id','professional_id,service_id'),
 data('professional_shifts','id,professional_id,weekday,start_time,end_time'),
 data('professional_breaks','id,professional_id,weekday,start_time,end_time'),
 data('professional_absences','id,professional_id,starts_at,ends_at,reason'),
 data('appointments','id,tutor_id,pet_id,professional_id,starts_at,ends_at,status,notes,created_by,created_at,updated_at'),
 data('appointment_services','appointment_id,service_id,position,price_cents,duration_minutes','appointment_id,position'),
 data('appointment_events','id,appointment_id,actor_user_id,kind,old_start,old_end,new_start,new_end,old_professional_id,new_professional_id,reason,tutor_consent,created_at'),
 data('waitlist','id,tutor_id,pet_id,service_id,professional_id,earliest_at,latest_at,status,appointment_id,notes'),
 data('notifications','id,recipient_user_id,event_id,read_at,created_at'),
 data('reminder_jobs','id,appointment_id,scheduled_for,state,created_at,attempt_count,next_attempt_at,last_attempt_at,sent_at'),
 data('reminder_delivery_attempts','id,appointment_id,attempt_number,status,started_at,finished_at'),
 data('tutor_email_reminder_consent_events','id,tutor_id,actor_user_id,email,action,created_at,event_order','event_order'),
 data('crm_contacts','id,tutor_id,channel,summary,occurred_at,created_by,created_at'),
 data('crm_tasks','id,tutor_id,title,notes,due_at,status,created_by,created_at,updated_at,completed_at'),
 data('business_products','id,name,sku,unit,price_cents,cost_cents,min_stock,stock_quantity,active,public_catalog_visible,created_at,updated_at'),
 data('business_cash_sessions','id,opened_at,closed_at,opening_cents,counted_cents,expected_cents,difference_cents,notes,closing_notes,opened_by,closed_by'),
 data('business_sales','id,tutor_id,appointment_id,status,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,due_date,notes,created_by,created_at,updated_at,cancelled_at,cancellation_reason'),
 data('business_sale_items','id,sale_id,kind,product_id,service_id,description,quantity,unit_price_cents,total_cents'),
 data('business_expenses','id,title,category,amount_cents,due_date,status,notes,created_by,created_at,paid_at,payment_method,cancelled_at,cancellation_reason'),
 data('business_ledger','id,sale_id,expense_id,kind,amount_cents,payment_method,cash_session_id,created_by,created_at'),
 data('business_stock_movements','id,product_id,sale_id,quantity_delta,balance_after,reason,note,created_by,created_at'),
 data('privacy_requests','id,tutor_id,kind,status,description,identity_verified,verification_method,identity_verified_by,identity_verified_at,resolution,created_by,created_at,updated_at,resolved_at'),
 data('privacy_request_events','id,request_id,actor_user_id,action,status,reason_code,created_at'),
 data('audit_events','id,actor_user_id,action,entity_type,entity_id,created_at'),
 data('tenant_subscriptions','plan_id,status,onboarding_completed_at,trial_started_at,onboarding_plan,trial_ends_at,paid_through,suspension_reason,updated_at,recurrence_cancelled_at,recurrence_cancellation_reference,recurrence_cancelled_by,pending_checkout_at,pending_checkout_plan_id','tenant_id'),
 data('subscription_payments','id,plan_id,amount_cents,provider,provider_reference,period_start,period_end,received_at,recorded_at,recorded_by,voided_at,voided_by,void_reason'),
 data('support_tickets','id,created_by,subject,category,status,created_at,updated_at'),
 data('support_messages','id,ticket_id,actor_user_id,from_platform,body,created_at'),
 data('taxi_drivers','id,name,phone,active,created_at,updated_at'),
 data('taxi_bookings','id,appointment_id,service_id,service_name,price_cents,mode,address,reference,notes,cancelled_at,created_by,created_at,updated_at'),
 data('taxi_trips','id,booking_id,leg,driver_id,starts_at,ends_at,status,created_at,updated_at'),
 data('public_booking_settings','enabled,notice,updated_by,updated_at','tenant_id'),
 data('public_booking_requests','id,receipt,status,tutor_name,tutor_phone,tutor_email,pet_name,pet_species,pet_size,pet_breed,starts_at,ends_at,appointment_id,reviewed_by,reviewed_at,rejection_reason,created_at,updated_at'),
 data('public_booking_request_services','request_id,service_id,position,name,price_cents,duration_minutes','request_id,position'),
 data('business_delivery_orders','id,sale_id,status,address,phone,reference,notes,cancellation_reason,created_by,updated_by,created_at,updated_at,out_for_delivery_at,delivered_at,cancelled_at'),
 data('business_delivery_events','id,delivery_id,old_status,new_status,reason,actor_user_id,created_at'),
 data('public_delivery_settings','enabled,coverage_note,notice,delivery_fee_cents,updated_by,updated_at','tenant_id'),
 data('public_delivery_requests','id,receipt,status,customer_name,phone,address,reference,notes,subtotal_cents,quoted_delivery_fee_cents,delivery_order_id,reviewed_by,reviewed_at,rejection_reason,created_at,updated_at'),
 data('public_delivery_request_items','request_id,product_id,position,name,unit,quantity,unit_price_cents','request_id,position'),
 {name:'team',table:'memberships',columns:[],sql:'SELECT u.id AS user_id,u.name,u.email,m.role,m.permissions,m.active,u.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY m.user_id'},
 {name:'terms_acceptances',table:null,columns:[],sql:'SELECT a.user_id,a.version,a.accepted_at FROM terms_acceptances a JOIN memberships m ON m.user_id=a.user_id WHERE m.tenant_id=$1 ORDER BY a.user_id,a.accepted_at'},
];
export const tenantExportExclusions={
 invitations:'Invitation credentials and pending access administration are not portable operational records.',
 business_operations:'Internal idempotency keys, request fingerprints and replay payloads.',
 object_deletion_jobs:'Internal deletion queue and storage object identifiers; active photos are included separately.',
 support_email_notifications:'Internal provider queue, recipient payloads and delivery credentials; support conversations are included.',
};
const reviewedHiddenColumns={
 reminder_jobs:['claimed_by','claim_expires_at','provider_message_id','last_error'],
 reminder_delivery_attempts:['provider_message_id','error_message'],
 subscription_payments:['idempotency_key'],audit_events:['metadata'],
 public_booking_settings:['public_token'],public_booking_requests:['payload_hash','idempotency_key'],
 public_delivery_settings:['public_token'],public_delivery_requests:['payload_hash','idempotency_key'],
};
const quote=value=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw failure('TENANT_EXPORT_IDENTIFIER_INVALID');return '"'+value+'"';};

export function parseExportArguments(args){
 const result={};
 const names=new Set(['tenant','operator','reference','output','identity-verified','confirm-export']);
 for(let i=0;i<args.length;i++){
  const name=args[i].replace(/^--/,'');
  if(!args[i].startsWith('--')||!names.has(name)||result[name]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw failure('TENANT_EXPORT_ARGUMENT_INVALID');
  result[name]=args[++i];
 }
 if(!UUID.test(result.tenant??'')||!UUID.test(result.operator??''))throw failure('TENANT_EXPORT_ID_REQUIRED');
 if(result['identity-verified']!=='YES'||result['confirm-export']!=='YES')throw failure('TENANT_EXPORT_CONFIRMATION_REQUIRED');
 if(/^support:/i.test(result.reference??''))result.reference='support:'+result.reference.slice(8).toLowerCase();
 if(!/^(support:[a-f0-9-]{36}|external:[A-Za-z0-9._/-]{3,80})$/.test(result.reference??''))throw failure('TENANT_EXPORT_REFERENCE_REQUIRED');
 if(result.reference.startsWith('support:')&&!UUID.test(result.reference.slice(8)))throw failure('TENANT_EXPORT_REFERENCE_REQUIRED');
 if(!result.output||!isAbsolute(result.output)||!result.output.endsWith('.tar.gz'))throw failure('TENANT_EXPORT_NEW_ABSOLUTE_ARCHIVE_REQUIRED');
 return result;
}

export async function assertTenantExportSchema(db){
 const tables=await db.query("SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND c.column_name='tenant_id' AND t.table_type='BASE TABLE' ORDER BY c.table_name");
 const known=new Set([...tenantExportDatasets.map(item=>item.table).filter(Boolean),...Object.keys(tenantExportExclusions)]);
 const unknown=tables.rows.map(row=>row.table_name).filter(name=>!known.has(name));
 if(unknown.length)throw failure('TENANT_EXPORT_SCHEMA_REVIEW_REQUIRED');
 const columns=await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[]) ORDER BY table_name,ordinal_position",[[...tenantExportDatasets.map(item=>item.table).filter(Boolean),'tenants','users','terms_acceptances']]);
 const reviewed=new Map(tenantExportDatasets.filter(item=>item.table).map(item=>[item.table,new Set(['tenant_id',...item.columns,...reviewedHiddenColumns[item.table]??[]])]));
 reviewed.set('memberships',new Set(['tenant_id','user_id','role','permissions','active']));
 reviewed.set('tenants',new Set(['id','name','timezone','late_tolerance_minutes','reminder_minutes_before','active','created_at','taxi_dog_enabled','operation_mode','delivery_enabled']));
 reviewed.set('users',new Set(['id','name','email','password_hash','session_version','is_platform_owner','created_at']));
 reviewed.set('terms_acceptances',new Set(['user_id','version','accepted_at']));
 if(columns.rows.some(row=>!reviewed.get(row.table_name)?.has(row.column_name)))throw failure('TENANT_EXPORT_SCHEMA_REVIEW_REQUIRED');
 return tables.rows.map(row=>row.table_name);
}

function boundedSignal(signal,timeout=60000){return AbortSignal.any([signal,AbortSignal.timeout(timeout)]);}
async function copyPhoto(storage,key,path,signal){
 const response=await storage.client.send(new GetObjectCommand({Bucket:storage.bucket,Key:key}),{abortSignal:boundedSignal(signal)});
 if(!response.Body||Number(response.ContentLength??0)>MAX_PHOTO_BYTES)throw failure('TENANT_EXPORT_PHOTO_TOO_LARGE');
 let bytes=0;const sha=createHash('sha256');
 const guard=new Transform({transform(chunk,_encoding,next){bytes+=chunk.length;if(bytes>MAX_PHOTO_BYTES)return next(failure('TENANT_EXPORT_PHOTO_TOO_LARGE'));sha.update(chunk);next(null,chunk);}});
 await pipeline(response.Body,guard,createWriteStream(path,{flags:'wx',mode:0o600}),{signal:boundedSignal(signal)});
 if(bytes<1)throw failure('TENANT_EXPORT_PHOTO_EMPTY');
 return {bytes,sha256:sha.digest('hex')};
}

async function archiveDirectory(directory,partial,signal){
 const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','LANG'])if(process.env[key])env[key]=process.env[key];
 const child=spawn(process.env.TAR_PATH||'tar',['-czf','-','-C',directory,'bundle'],{env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe'],signal});
 child.stderr.on('data',()=>{});
 const done=new Promise((resolvePromise,reject)=>{child.once('error',()=>reject(failure('TENANT_EXPORT_ARCHIVER_FAILED')));child.once('close',code=>code===0?resolvePromise():reject(failure('TENANT_EXPORT_ARCHIVER_FAILED')));});
 try{await Promise.all([done,pipeline(child.stdout,createWriteStream(partial,{flags:'wx',mode:0o600}),{signal})]);}
 catch(error){child.kill();await done.catch(()=>{});throw error;}
}
async function fileHash(path,assertActive){
 assertActive();const sha=createHash('sha256');
 for await(const bytes of createReadStream(path)){assertActive();sha.update(bytes);}
 assertActive();return sha.digest('hex');
}

export async function exportTenant(args=process.argv.slice(2),dependencies={}){
 if(args.length===1&&args[0]==='--help'){console.log('node api/scripts/export-tenant.mjs --tenant UUID --operator UUID --reference support:UUID --identity-verified YES --confirm-export YES --output <new-absolute-file.tar.gz>');return;}
 if(dependencies.signal?.aborted)throw failure('TENANT_EXPORT_ABORTED');
 const options=parseExportArguments(args),exportId=randomUUID();
 const outputParent=await realpath(dirname(options.output)),output=join(outputParent,basename(options.output));
 try{await lstat(output);throw failure('TENANT_EXPORT_OUTPUT_EXISTS');}catch(error){if(error.code!=='ENOENT')throw error;}
 // Database injection is reserved for trusted server/test code. A production
 // export always validates and uses the same direct target as the application.
 const partial=join(outputParent,`.petcore-tenant-export-${exportId}.partial`),db=dependencies.db??new Pool({...directDatabaseLockOptions(),application_name:'petcore-tenant-export'});
 const storage=dependencies.storage??photoStorage(),abort=new AbortController(),timer=setTimeout(()=>abort.abort(),30*60*1000);timer.unref();
 const externalAbort=()=>abort.abort();dependencies.signal?.addEventListener('abort',externalAbort,{once:true});if(dependencies.signal?.aborted)abort.abort();
 const referenceHash=createHash('sha256').update(options.reference).digest('hex');
 let client,temporary,transaction=false,schemaLocked=false,photoLocked=false,completed=false,published=false,connectionLost=false;
 const assertActive=()=>{if(connectionLost)throw failure('TENANT_EXPORT_CONNECTION_LOST');if(abort.signal.aborted)throw failure('TENANT_EXPORT_ABORTED');};
 const connectionError=()=>{connectionLost=true;abort.abort();};
 if(!dependencies.db)db.on('error',()=>console.error(JSON.stringify({event:'tenant_export_idle_connection_lost'})));
 try{
  client=await db.connect();client.on?.('error',connectionError);
  schemaLocked=(await client.query('SELECT pg_try_advisory_lock_shared($1) AS locked',[SCHEMA_LOCK])).rows[0].locked;if(!schemaLocked)throw failure('TENANT_EXPORT_SCHEMA_BUSY');
  photoLocked=(await client.query('SELECT pg_try_advisory_lock_shared($1) AS locked',[PHOTO_BACKUP_LOCK])).rows[0].locked;if(!photoLocked)throw failure('TENANT_EXPORT_PHOTO_CLEANUP_BUSY');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
  await client.query("SET LOCAL statement_timeout='30s'");await client.query("SET LOCAL idle_in_transaction_session_timeout='35min'");
  const operator=await client.query('SELECT id FROM users WHERE id=$1 AND is_platform_owner=true',[options.operator]);if(operator.rowCount!==1)throw failure('TENANT_EXPORT_PLATFORM_OPERATOR_REQUIRED');
  const company=await client.query('SELECT id,name,timezone,late_tolerance_minutes,reminder_minutes_before,active,created_at,taxi_dog_enabled,operation_mode,delivery_enabled FROM tenants WHERE id=$1',[options.tenant]);if(company.rowCount!==1)throw failure('TENANT_EXPORT_COMPANY_NOT_FOUND');
  if(options.reference.startsWith('support:')){
   const ticket=await client.query('SELECT id FROM support_tickets WHERE tenant_id=$1 AND id=$2',[options.tenant,options.reference.slice(8)]);if(ticket.rowCount!==1)throw failure('TENANT_EXPORT_REFERENCE_COMPANY_MISMATCH');
  }
  const schemaTables=await assertTenantExportSchema(client);
  temporary=await privateTemporary();const bundle=join(temporary,'bundle');await mkdir(bundle,{mode:0o700});await mkdir(join(bundle,'data'),{mode:0o700});await mkdir(join(bundle,'photos'),{mode:0o700});
  const snapshotAt=(await client.query('SELECT transaction_timestamp() AS at')).rows[0].at;
  const manifest={format:'petcore.tenant-export.v1',exportId,tenantId:options.tenant,createdAt:new Date().toISOString(),snapshotAt,completeOperationalData:true,referenceHash,datasets:[],photos:[],files:[],excludedTables:tenantExportExclusions,excludedFields:['passwords and hashes','sessions and reset/invitation tokens','internal idempotency/replay data','provider delivery payloads and raw errors','global configuration and other companies','raw audit metadata'],schemaTenantTables:schemaTables,delivery:{private:true,archiveEncrypted:false,automaticDelivery:false}};
  let totalBytes=0,totalRows=0;const photos=[];
  const writeDataset=async(name,rows)=>{
   const relative=`data/${name}.ndjson`,handle=await open(join(bundle,relative),'wx',0o600),sha=createHash('sha256');let count=0,bytes=0;
   try{
    for await(const value of rows){
     if(abort.signal.aborted||connectionLost)throw failure('TENANT_EXPORT_CONNECTION_LOST');
     const row={...value};
     if(name==='pets'&&row.photo_key){validatePhotoKey(options.tenant,row.id,row.photo_key);if(photos.length>=MAX_PHOTOS)throw failure('TENANT_EXPORT_REQUIRES_BATCH_REVIEW');const relativePhoto=`photos/${row.id}.webp`;photos.push({petId:row.id,key:row.photo_key,path:relativePhoto});row.photo_file=relativePhoto;}
     delete row.photo_key;
     const line=Buffer.from(JSON.stringify(row)+'\n');bytes+=line.length;totalBytes+=line.length;count++;totalRows++;
     if(count>MAX_ROWS_PER_DATASET||totalBytes>MAX_TOTAL_BYTES)throw failure('TENANT_EXPORT_REQUIRES_BATCH_REVIEW');
     sha.update(line);await handle.writeFile(line);
    }
   }finally{await handle.close();}
   manifest.datasets.push({name,rows:count});manifest.files.push({path:relative,bytes,sha256:sha.digest('hex')});
  };
  await writeDataset('company',company.rows);
  for(const dataset of tenantExportDatasets){
   if(abort.signal.aborted||connectionLost)throw failure('TENANT_EXPORT_ABORTED');
   const sql=dataset.sql??`SELECT ${dataset.columns.map(quote).join(',')} FROM ${quote(dataset.table)} WHERE tenant_id=$1 ORDER BY ${dataset.order.split(',').map(quote).join(',')}`;
   await client.query('DECLARE petcore_export_cursor NO SCROLL CURSOR FOR '+sql,[options.tenant]);
   async function* rows(){for(;;){const page=await client.query('FETCH FORWARD 500 FROM petcore_export_cursor');if(!page.rows.length)return;for(const row of page.rows)yield row;}}
   try{await writeDataset(dataset.name,rows());}finally{await client.query('CLOSE petcore_export_cursor');}
  }
  if(photos.length&&!storage)throw failure('TENANT_EXPORT_PHOTO_STORAGE_MISSING');
  for(const photo of photos){
   const copied=await copyPhoto(storage,photo.key,join(bundle,photo.path),abort.signal);totalBytes+=copied.bytes;if(totalBytes>MAX_TOTAL_BYTES)throw failure('TENANT_EXPORT_REQUIRES_BATCH_REVIEW');
   manifest.photos.push({petId:photo.petId,path:photo.path,...copied});manifest.files.push({path:photo.path,...copied});
   // Keep the read-only snapshot and session locks alive during long transfers.
   await client.query('SELECT 1');
  }
  if(connectionLost||abort.signal.aborted)throw failure('TENANT_EXPORT_CONNECTION_LOST');
  await client.query('COMMIT');transaction=false;
  await client.query('SELECT pg_advisory_unlock_shared($1)',[PHOTO_BACKUP_LOCK]);photoLocked=false;await client.query('SELECT pg_advisory_unlock_shared($1)',[SCHEMA_LOCK]);schemaLocked=false;
  manifest.totalRows=totalRows;manifest.totalBytes=totalBytes;
  await writeFile(join(bundle,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
  await writeFile(join(bundle,'LEIA-ME.txt'),'PetCore — exportação assistida da empresa\n\nOs arquivos data/*.ndjson usam um objeto JSON por linha, UTF-8, datas ISO e valores monetários em centavos. Os IDs mantêm os vínculos entre registros. As fotos indicadas em pets.photo_file estão em photos/. manifest.json contém contagens e somas SHA-256.\n\nO arquivo contém dados pessoais e NÃO está cifrado. Entregue somente ao administrador verificado por canal privado aprovado. Não publique, não envie a terceiros e não deixe a cópia em local compartilhado. A exportação não executa encerramento, exclusão, cobrança ou cancelamento de assinatura.\n',{flag:'wx',mode:0o600});
  await archiveDirectory(temporary,partial,abort.signal);await chmod(partial,0o600);const sha256=await fileHash(partial,assertActive);
  assertActive();await link(partial,output);published=true;await unlink(partial);assertActive();
  // This records archive preparation, not delivery. Cancellation after the
  // insert can leave this evidence while still requiring archive cleanup.
  const audit=await client.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) SELECT $1,id,'tenant.export_assisted','tenant',$1,$3::jsonb FROM users WHERE id=$2 AND is_platform_owner=true RETURNING id",[options.tenant,options.operator,JSON.stringify({exportId,referenceHash,archiveSha256:sha256,rows:totalRows,photos:photos.length,datasets:manifest.datasets.length})]);
  assertActive();
  if(audit.rowCount!==1)throw failure('TENANT_EXPORT_OPERATOR_ACCESS_CHANGED');
  completed=true;return {ok:true,event:'tenant_export_created',exportId,tenantId:options.tenant,archivePath:output,sha256,datasets:manifest.datasets.length,rows:totalRows,photos:photos.length,completeOperationalData:true,requiresPrivateDelivery:true,automaticDelivery:false};
 }finally{
  clearTimeout(timer);dependencies.signal?.removeEventListener('abort',externalAbort);abort.abort();
  if(transaction)await client?.query('ROLLBACK').catch(()=>{});
  if(photoLocked)await client?.query('SELECT pg_advisory_unlock_shared($1)',[PHOTO_BACKUP_LOCK]).catch(()=>{});
  if(schemaLocked)await client?.query('SELECT pg_advisory_unlock_shared($1)',[SCHEMA_LOCK]).catch(()=>{});
  client?.removeListener?.('error',connectionError);client?.release(connectionLost);if(!dependencies.db)await db.end();storage?.client.destroy?.();
  await unlink(partial).catch(()=>{});if(published&&!completed)await unlink(output).catch(()=>{});
  if(temporary)await removeTemporary(temporary);
 }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){exportTenant().then(result=>{if(result)console.log(JSON.stringify(result));}).catch(error=>{console.error(JSON.stringify({ok:false,code:safeCode(error,'TENANT_EXPORT_FAILED')}));process.exitCode=1;});}
