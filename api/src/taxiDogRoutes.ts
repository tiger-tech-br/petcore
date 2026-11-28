import {Router} from 'express';
import {z} from 'zod';
import {auth,ensure,permit,pool,tenant,tx} from './core.js';
import {requireSubscriptionWrite} from './commercialService.js';
import {recordAudit} from './audit.js';
import {changeTaxiTripStatus,getTaxiBooking,lockTaxiAppointment,saveTaxiBooking,taxiDraft,taxiOptions} from './taxiDogService.js';

const router=Router();router.use(auth,requireSubscriptionWrite,permit('taxi_dog'));
const driverInput=z.object({name:z.string().trim().min(2).max(160),phone:z.string().trim().max(40).default(''),active:z.boolean().default(true)}).strict();
const states=z.enum(['scheduled','en_route','with_pet','completed','cancelled']);
router.get('/options',async(req,res)=>res.json(await taxiOptions(pool,tenant(req))));
router.get('/drivers',async(req,res)=>{
 const rows=await pool.query('SELECT id,name,phone,active,created_at,updated_at FROM taxi_drivers WHERE tenant_id=$1 ORDER BY active DESC,name,id',[tenant(req)]);
 res.json({items:rows.rows});
});
router.post('/drivers',async(req,res)=>{
 const input=driverInput.parse(req.body),company=tenant(req);
 const row=await tx(async db=>{
  const result=await db.query('INSERT INTO taxi_drivers(tenant_id,name,phone,active) VALUES($1,$2,$3,$4) RETURNING id,name,phone,active,created_at,updated_at',[company,input.name,input.phone,input.active]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'taxi.driver.create',entityType:'taxi_driver',entityId:result.rows[0].id});return result.rows[0];
 });res.status(201).json(row);
});
router.patch('/drivers/:id',async(req,res)=>{
 const parsed=driverInput.partial().strict().parse(req.body),input=Object.fromEntries(Object.entries(parsed).filter(([key])=>Object.hasOwn(req.body,key)));
 ensure(Object.keys(input).length>0,422,'Informe os dados que deseja atualizar.');
 const id=z.uuid().parse(req.params.id),company=tenant(req);
 const row=await tx(async db=>{
  const existing=await db.query('SELECT id,name,phone,active FROM taxi_drivers WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);ensure(existing.rowCount,404,'Motorista não encontrado.');
  const merged={...existing.rows[0],...input};
  if(merged.active===false){const pending=await db.query("SELECT 1 FROM taxi_trips WHERE tenant_id=$1 AND driver_id=$2 AND status IN ('scheduled','en_route','with_pet') UNION ALL SELECT 1 FROM business_delivery_orders WHERE tenant_id=$1 AND driver_id=$2 AND status IN ('preparing','out_for_delivery') LIMIT 1",[company,id]);ensure(!pending.rowCount,409,'Reatribua ou finalize os transportes pendentes antes de desativar o motorista.');}
  const result=await db.query('UPDATE taxi_drivers SET name=$3,phone=$4,active=$5,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,name,phone,active,created_at,updated_at',[company,id,merged.name,merged.phone,merged.active]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'taxi.driver.update',entityType:'taxi_driver',entityId:id,metadata:{active:merged.active}});return result.rows[0];
 });res.json(row);
});
router.get('/appointments/:id',async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id);
 const found=await pool.query('SELECT id FROM appointments WHERE tenant_id=$1 AND id=$2',[company,id]);ensure(found.rowCount,404,'Atendimento não encontrado.');
 res.json({booking:await getTaxiBooking(pool,company,id)});
});
router.put('/appointments/:id',async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id),input=z.object({taxi_dog:taxiDraft.nullable()}).strict().parse(req.body);
 const booking=await tx(async db=>{const appointment=await lockTaxiAppointment(db,company,id);return saveTaxiBooking(db,req,company,appointment,input.taxi_dog);});
 res.json({booking});
});
router.get('/trips',async(req,res)=>{
 const company=tenant(req);
 const query=z.object({from:z.iso.date().optional(),to:z.iso.date().optional(),driver_id:z.uuid().optional(),status:states.optional(),page:z.coerce.number().int().min(1).max(100000).default(1),page_size:z.coerce.number().int().min(1).max(100).default(30)}).parse(req.query);
 const settings=await pool.query("SELECT timezone,to_char(now() AT TIME ZONE timezone,'YYYY-MM-DD') AS today FROM tenants WHERE id=$1",[company]);
 const timezone=settings.rows[0].timezone,from=query.from??settings.rows[0].today,to=query.to??from;
 const days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
 ensure(days>=0&&days<=31,422,'Selecione um período válido de até 32 dias.');
 const params=[company,from,to,timezone,query.driver_id??null,query.status??null];
 const where=`t.tenant_id=$1 AND t.starts_at >= ($2::date::timestamp AT TIME ZONE $4)
  AND t.starts_at < (($3::date+1)::timestamp AT TIME ZONE $4)
  AND ($5::uuid IS NULL OR t.driver_id=$5) AND ($6::text IS NULL OR t.status=$6)
  AND (b.mode='round_trip' OR t.leg=b.mode)`;
 const [items,count]=await Promise.all([
  pool.query(`SELECT t.id,t.booking_id,t.leg,t.driver_id,d.name AS driver_name,t.starts_at,t.ends_at,t.status,t.updated_at,
    b.appointment_id,b.service_name,b.price_cents,b.mode,b.address,b.reference,b.notes,b.cancelled_at,
    a.starts_at AS appointment_starts_at,a.ends_at AS appointment_ends_at,a.status AS appointment_status,
    p.name AS pet_name,u.name AS tutor_name,u.phone AS tutor_phone
   FROM taxi_trips t JOIN taxi_drivers d ON d.tenant_id=t.tenant_id AND d.id=t.driver_id
   JOIN taxi_bookings b ON b.tenant_id=t.tenant_id AND b.id=t.booking_id
   JOIN appointments a ON a.tenant_id=b.tenant_id AND a.id=b.appointment_id
   JOIN pets p ON p.tenant_id=a.tenant_id AND p.id=a.pet_id
   JOIN tutors u ON u.tenant_id=a.tenant_id AND u.id=a.tutor_id
   WHERE ${where} ORDER BY t.starts_at,t.id LIMIT $7 OFFSET $8`,[...params,query.page_size,(query.page-1)*query.page_size]),
  pool.query(`SELECT count(*)::int AS total FROM taxi_trips t JOIN taxi_bookings b ON b.tenant_id=t.tenant_id AND b.id=t.booking_id WHERE ${where}`,params)
 ]);
 const total=count.rows[0].total;
 res.json({items:items.rows,pagination:{page:query.page,pageSize:query.page_size,total,totalPages:Math.max(1,Math.ceil(total/query.page_size))},timezone});
});
router.patch('/trips/:id/status',async(req,res)=>{
 const id=z.uuid().parse(req.params.id),company=tenant(req),input=z.object({status:states,expected_status:states}).strict().parse(req.body);
 const row=await tx(db=>changeTaxiTripStatus(db,company,id,input,req.access!.userId));res.json(row);
});
export default router;
