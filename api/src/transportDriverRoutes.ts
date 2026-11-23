import {Router} from 'express';
import {z} from 'zod';
import {auth,ensure,pool,tenant,tx} from './core.js';
import {requireSubscriptionWrite} from './commercialService.js';
import {recordAudit} from './audit.js';

const router=Router();
// Configuration is admin-only. Driver access to their own trips will use a separate router.
router.use(auth,(req,_res,next)=>{
 try{ensure(req.access?.role==='admin',403,'Apenas o responsável pode configurar motoristas.');next();}
 catch(error){next(error);}
},requireSubscriptionWrite);

router.get('/options',async(req,res)=>{
 const company=tenant(req);
 const [drivers,members]=await Promise.all([
  pool.query('SELECT id,name,active,user_id FROM taxi_drivers WHERE tenant_id=$1 ORDER BY name,id',[company]),
  pool.query(`SELECT u.id,u.name,m.role FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.tenant_id=$1 AND m.active=true ORDER BY u.name,u.id`,[company])
 ]);
 res.json({drivers:drivers.rows,members:members.rows});
});

router.patch('/:id/account',async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id);
 const input=z.object({user_id:z.uuid().nullable()}).strict().parse(req.body);
 const result=await tx(async db=>{
  const driver=await db.query('SELECT id,name,active,user_id FROM taxi_drivers WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,id]);
  ensure(driver.rowCount,404,'Motorista não encontrado.');
  const current=driver.rows[0];
  if(input.user_id!==null){
   ensure(current.active,409,'Ative o motorista antes de vincular uma conta.');
   const member=await db.query('SELECT active FROM memberships WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE',[company,input.user_id]);
   ensure(member.rows[0]?.active===true,422,'Selecione uma conta ativa deste pet shop.');
   const duplicate=await db.query('SELECT 1 FROM taxi_drivers WHERE tenant_id=$1 AND user_id=$2 AND id<>$3',[company,input.user_id,id]);
   ensure(!duplicate.rowCount,409,'Esta conta já está vinculada a outro motorista.');
  }
  if(current.user_id===input.user_id)return current;
  const busy=await db.query(`SELECT EXISTS(SELECT 1 FROM taxi_trips WHERE tenant_id=$1 AND driver_id=$2 AND status IN ('en_route','with_pet'))
    OR EXISTS(SELECT 1 FROM business_delivery_orders WHERE tenant_id=$1 AND driver_id=$2 AND status='out_for_delivery') AS busy`,[company,id]);
  ensure(!busy.rows[0].busy,409,'Finalize o transporte em andamento antes de alterar o vínculo.');
  const updated=await db.query('UPDATE taxi_drivers SET user_id=$3,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,name,active,user_id',[company,id,input.user_id]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'transport.driver.account',entityType:'taxi_driver',entityId:id,metadata:{linked:input.user_id!==null}});
  return updated.rows[0];
 });
 res.json(result);
});
export default router;
