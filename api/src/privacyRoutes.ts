import {Router} from 'express';
import argon2 from 'argon2';
import {z} from 'zod';
import {auth,ensure,pool,sha,tenant,tx} from './core.js';
import {recordAudit} from './audit.js';
import {anonymizeSubject,exportSubject,processObjectDeletionJobs,requestColumns,requestEvent,requestJoin} from './privacyService.js';

const router=Router();
router.use(auth,(req,_res,next)=>{try{ensure(req.access?.role==='admin',403,'Somente o administrador da empresa pode gerenciar solicitações de privacidade.');tenant(req);next();}catch(error){next(error);}});
const kinds=z.enum(['access','correction','anonymization','opposition','portability','other']);
const statuses=z.enum(['open','in_progress','completed','rejected']);
const pageNumber=(fallback:number,max:number)=>z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(max)).default(fallback);
const listQuery=z.object({status:z.enum(['all','open','in_progress','completed','rejected']).default('all'),page:pageNumber(1,100000),page_size:pageNumber(20,100)}).strict();
const passwordInput=z.object({password:z.string().min(1).max(200)}).strict();
const reasonCodes=z.enum(['subject_request','purpose_ended','unlawful_processing','other']);

async function reauthenticate(userId:string,password:string,ip:string){
 const key=sha(`privacy:${userId}:${ip}`);
 const attempts=await pool.query(`INSERT INTO auth_rate_limits(key) VALUES($1)
  ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempts+1 END,
  window_started=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN now() ELSE auth_rate_limits.window_started END RETURNING attempts`,[key]);
 ensure(attempts.rows[0].attempts<=5,429,'Muitas confirmações de senha. Aguarde alguns minutos antes de tentar novamente.');
 const account=await pool.query('SELECT password_hash FROM users WHERE id=$1',[userId]);
 ensure(account.rowCount&&await argon2.verify(account.rows[0].password_hash,password),403,'A senha atual não confere.');
}

router.get('/tutors',async(req,res)=>{
 const input=z.object({q:z.string().trim().max(100).default(''),limit:pageNumber(50,100)}).strict().parse(req.query);
 const result=await pool.query(`WITH selected AS (SELECT id,name,anonymized_at FROM tutors WHERE tenant_id=$1
  AND ($2::text='' OR strpos(lower(name),lower($2))>0 OR strpos(phone,$2)>0 OR strpos(lower(COALESCE(email,'')),lower($2))>0))
  SELECT COALESCE((SELECT json_agg(items) FROM (SELECT * FROM selected ORDER BY lower(name),id LIMIT $3) items),'[]'::json) AS items,
  (SELECT count(*)::int FROM selected) AS total`,[tenant(req),input.q,input.limit]);
 res.json(result.rows[0]);
});

router.get('/requests',async(req,res)=>{
 const company=tenant(req),input=listQuery.parse(req.query);
 const result=await pool.query(`WITH filtered AS (SELECT ${requestColumns} ${requestJoin}
  WHERE r.tenant_id=$1 AND ($2::text='all' OR r.status=$2))
  SELECT COALESCE((SELECT json_agg(items) FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT $3 OFFSET $4) items),'[]'::json) AS items,
   (SELECT count(*)::int FROM filtered) AS total,
   (SELECT json_build_object('open',count(*) FILTER (WHERE status='open')::int,'inProgress',count(*) FILTER (WHERE status='in_progress')::int,
    'completed',count(*) FILTER (WHERE status='completed')::int,'rejected',count(*) FILTER (WHERE status='rejected')::int,
    'filesPending',(SELECT count(*)::int FROM object_deletion_jobs WHERE tenant_id=$1 AND state<>'done')) FROM privacy_requests WHERE tenant_id=$1) AS summary`,
 [company,input.status,input.page_size,(input.page-1)*input.page_size]);
 res.json({...result.rows[0],page:input.page,pageSize:input.page_size});
});

router.get('/requests/:id',async(req,res)=>{
 const company=tenant(req),id=z.uuid().parse(req.params.id);
 const request=await pool.query(`SELECT ${requestColumns} ${requestJoin} WHERE r.tenant_id=$1 AND r.id=$2`,[company,id]);
 ensure(request.rowCount,404,'Solicitação não encontrada.');
 const events=await pool.query(`SELECT e.id,e.action,e.status,e.reason_code,e.created_at,u.name AS actor_name
  FROM privacy_request_events e JOIN users u ON u.id=e.actor_user_id
  WHERE e.tenant_id=$1 AND e.request_id=$2 ORDER BY e.created_at,e.id`,[company,id]);
 res.json({request:request.rows[0],events:events.rows});
});

router.post('/requests',async(req,res)=>{
 const input=z.object({tutor_id:z.uuid(),kind:kinds,description:z.string().trim().min(3).max(3000)}).strict().parse(req.body);
 const company=tenant(req),user=req.access!.userId;
 const created=await tx(async db=>{
  const client=await db.query('SELECT id,anonymized_at FROM tutors WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[company,input.tutor_id]);
  ensure(client.rowCount,404,'Cliente não encontrado.');
  ensure(!client.rows[0].anonymized_at,409,'Este cadastro já foi anonimizado. Solicitações adicionais precisam de análise pelo canal de privacidade.');
  const result=await db.query(`INSERT INTO privacy_requests(tenant_id,tutor_id,kind,description,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id`,
   [company,input.tutor_id,input.kind,input.description,user]);
  const id=result.rows[0].id;
  await requestEvent(db,company,id,user,'created','open');
  await recordAudit(db,{tenantId:company,userId:user,action:'privacy.request.create',entityType:'privacy_request',entityId:id,metadata:{kind:input.kind,tutorId:input.tutor_id}});
  return (await db.query(`SELECT ${requestColumns} ${requestJoin} WHERE r.tenant_id=$1 AND r.id=$2`,[company,id])).rows[0];
 });
 res.status(201).json(created);
});

router.patch('/requests/:id',async(req,res)=>{
 const input=z.object({status:statuses.optional(),resolution:z.string().trim().max(3000).optional(),identity_verified:z.literal(true).optional(),
  verification_method:z.enum(['in_person','existing_contact','document_checked','other']).optional()}).strict()
  .refine(value=>Object.keys(value).length>0,'Informe uma alteração.').parse(req.body);
 ensure(!input.identity_verified||input.verification_method,422,'Informe como a identidade foi verificada, sem armazenar cópias de documentos.');
 ensure(!input.verification_method||input.identity_verified,422,'Confirme a verificação de identidade.');
 const company=tenant(req),user=req.access!.userId,id=z.uuid().parse(req.params.id);
 const updated=await tx(async db=>{
  const current=await db.query(`SELECT r.*,t.anonymized_at FROM privacy_requests r JOIN tutors t ON t.tenant_id=r.tenant_id AND t.id=r.tutor_id
   WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE OF r`,[company,id]);
  ensure(current.rowCount,404,'Solicitação não encontrada.');
  const before=current.rows[0];
  ensure(!['completed','rejected'].includes(before.status),409,'Esta solicitação já foi encerrada e seu histórico deve ser preservado.');
  const verified=before.identity_verified||input.identity_verified===true,status=input.status??before.status,resolution=input.resolution??before.resolution;
  if(['completed','rejected'].includes(status))ensure(resolution.length>=3,422,'Registre o resultado e a resposta fornecida ao titular.');
  if(status==='completed'){
   ensure(verified,409,'Verifique a identidade do titular antes de concluir.');
   ensure(before.kind!=='anonymization'||before.anonymized_at,409,'Use a ação protegida de anonimização para concluir este tipo de solicitação.');
  }
  await db.query(`UPDATE privacy_requests SET status=$3,resolution=$4,identity_verified=$5,
   verification_method=CASE WHEN $6::text IS NULL THEN verification_method ELSE $6 END,
   identity_verified_by=CASE WHEN $7::boolean THEN $8::uuid ELSE identity_verified_by END,
   identity_verified_at=CASE WHEN $7::boolean THEN now() ELSE identity_verified_at END,
   resolved_at=CASE WHEN $3 IN ('completed','rejected') THEN now() ELSE NULL END,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
   [company,id,status,resolution,verified,input.verification_method??null,Boolean(input.identity_verified&&!before.identity_verified),user]);
  await requestEvent(db,company,id,user,input.identity_verified&&!before.identity_verified?'identity_verified':'updated',status);
  await recordAudit(db,{tenantId:company,userId:user,action:'privacy.request.update',entityType:'privacy_request',entityId:id,metadata:{status,identityVerified:verified}});
  return (await db.query(`SELECT ${requestColumns} ${requestJoin} WHERE r.tenant_id=$1 AND r.id=$2`,[company,id])).rows[0];
 });
 res.json(updated);
});

router.post('/requests/:id/export',async(req,res)=>{
 const input=passwordInput.parse(req.body),company=tenant(req),id=z.uuid().parse(req.params.id);
 // Verifica escopo antes da senha para nunca entregar um arquivo de outro pet shop.
 const exists=await pool.query('SELECT 1 FROM privacy_requests WHERE tenant_id=$1 AND id=$2',[company,id]);
 ensure(exists.rowCount,404,'Solicitação não encontrada.');
 await reauthenticate(req.access!.userId,input.password,req.ip??'unknown');
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Disposition',`attachment; filename="petcore-solicitacao-${id}.json"`);
 res.json(await exportSubject(company,id,req.access!.userId));
});

router.post('/requests/:id/anonymize',async(req,res)=>{
 const input=z.object({password:z.string().min(1).max(200),confirmation:z.literal('ANONIMIZAR'),reason:reasonCodes,
  retention_reviewed:z.literal(true)}).strict().parse(req.body);
 const company=tenant(req),id=z.uuid().parse(req.params.id);
 const exists=await pool.query('SELECT 1 FROM privacy_requests WHERE tenant_id=$1 AND id=$2',[company,id]);
 ensure(exists.rowCount,404,'Solicitação não encontrada.');
 await reauthenticate(req.access!.userId,input.password,req.ip??'unknown');
 res.json(await anonymizeSubject(company,id,req.access!.userId,input.reason));
});

router.get('/cleanup-queue',async(req,res)=>{
 z.object({}).strict().parse(req.query);
 const items=await pool.query(`SELECT id,request_id,state,attempt_count,next_attempt_at,last_error_code,created_at,finished_at
  FROM object_deletion_jobs WHERE tenant_id=$1 ORDER BY (state='done'),created_at DESC,id DESC LIMIT 100`,[tenant(req)]);
 res.json({items:items.rows,limit:100});
});
router.post('/cleanup-queue/retry',async(req,res)=>{
 z.object({}).strict().parse(req.body??{});
 const company=tenant(req);
 await tx(async db=>{
  await db.query("UPDATE object_deletion_jobs SET state='queued',attempt_count=0,next_attempt_at=now(),last_error_code=NULL WHERE tenant_id=$1 AND state='failed'",[company]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'privacy.files.retry',entityType:'object_deletion_job'});
 });
 res.json(await processObjectDeletionJobs({tenantId:company,limit:10}));
});

export default router;
