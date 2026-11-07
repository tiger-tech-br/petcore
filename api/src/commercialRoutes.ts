import {Router} from 'express';
import {z} from 'zod';
import {auth,platform,pool,tenant,tx,ensure} from './core.js';
import {recordAudit} from './audit.js';
import {confirmPassword} from './reauth.js';
import {settings,legalPublic,legalVersion,paymentLink,subscription} from './commercialService.js';
import {legalTemplatesFor} from './legalTemplates.js';

export const publicCommercial=Router();
publicCommercial.get('/legal',async(_req,res)=>{res.set('Cache-Control','no-store');res.json(legalPublic(await settings()));});

const router=Router();router.use(auth);
const pageQuery=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),page_size:z.coerce.number().int().min(1).max(100).default(20)});
const password=z.string().min(1).max(200);
const planId=z.enum(['monthly','yearly']);

router.get('/me',async(req,res)=>{
 const company=tenant(req),current=await subscription(company);
 const [plans,payments,legal]=await Promise.all([
  pool.query('SELECT id,name,amount_cents,interval_months,checkout_url,checkout_reviewed FROM subscription_plans WHERE active=true ORDER BY interval_months'),
  req.access!.role==='admin'?pool.query(`SELECT id,plan_id,amount_cents,provider_reference,period_start,period_end,received_at,voided_at
   FROM subscription_payments WHERE tenant_id=$1 ORDER BY recorded_at DESC LIMIT 50`,[company]):Promise.resolve({rows:[]}),settings()
 ]);
 res.json({subscription:current,plans:plans.rows.map(plan=>({...plan,checkout_url:req.access!.role==='admin'&&plan.checkout_reviewed&&legal.published?plan.checkout_url:null})),
  payments:payments.rows,canManage:req.access!.role==='admin',supportEmail:legal.support_email,
  billingMode:'pagbank_recurring_link_manual_reconciliation'});
});
router.post('/choose-plan',async(req,res)=>{
 ensure(req.access!.role==='admin',403,'Somente o responsável pela empresa pode escolher o plano.');
 const input=z.object({plan_id:planId}).strict().parse(req.body),company=tenant(req);
 await subscription(company);
 const plan=await pool.query('SELECT active FROM subscription_plans WHERE id=$1',[input.plan_id]);ensure(plan.rows[0]?.active,422,'Plano indisponível.');
 await tx(async db=>{await db.query('UPDATE tenant_subscriptions SET plan_id=$2,updated_at=now() WHERE tenant_id=$1',[company,input.plan_id]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'subscription.plan_selected',entityType:'subscription',metadata:{plan:input.plan_id}});});
 res.json({ok:true});
});
router.post('/onboarding',async(req,res)=>{
 ensure(req.access!.role==='admin',403,'O responsável pelo pet shop precisa escolher o plano.');
 const input=z.object({plan:z.enum(['free','monthly','yearly'])}).strict().parse(req.body),company=tenant(req);
 const result=await tx(async db=>{
  await subscription(company,db);
  const current=(await db.query('SELECT * FROM tenant_subscriptions WHERE tenant_id=$1 FOR UPDATE',[company])).rows[0];
  ensure(!['suspended','cancelled'].includes(current.status),403,'Entre em contato com o suporte para regularizar o acesso.');
  ensure(!current.onboarding_completed_at||input.plan==='free'&&current.status==='pending'&&!current.trial_started_at,409,'O primeiro acesso já foi concluído. Gerencie o plano em Plano e assinatura.');
  const config=await settings(db);
  if(current.paid_through&&new Date(current.paid_through).getTime()>Date.now()){
   await db.query('UPDATE tenant_subscriptions SET onboarding_completed_at=now(),onboarding_plan=plan_id,updated_at=now() WHERE tenant_id=$1',[company]);
   await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'subscription.onboarding_completed',entityType:'subscription',metadata:{plan:current.plan_id,payment_already_confirmed:true}});
   return {ok:true,plan:current.plan_id,checkout_url:null,paymentAlreadyConfirmed:true};
  }
  const selected=input.plan==='free'?'monthly':input.plan;
  const plan=(await db.query('SELECT * FROM subscription_plans WHERE id=$1 AND active=true',[selected])).rows[0];ensure(plan,422,'Plano indisponível.');
  await db.query(`UPDATE tenant_subscriptions SET plan_id=$2,onboarding_plan=$3,onboarding_completed_at=now(),
   trial_started_at=CASE WHEN $3='free' THEN now() ELSE NULL END,
   trial_ends_at=CASE WHEN $3='free' THEN now()+($4::int*interval '1 day') ELSE now() END,
   status=CASE WHEN $3='free' THEN 'trial' ELSE 'pending' END,updated_at=now() WHERE tenant_id=$1`,[company,selected,input.plan,config.trial_days]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'subscription.onboarding_completed',entityType:'subscription',metadata:{plan:input.plan,trial_days:input.plan==='free'?config.trial_days:0}});
  return {ok:true,plan:input.plan,checkout_url:input.plan!=='free'&&plan.checkout_reviewed&&config.published?plan.checkout_url:null};
 });res.json(result);
});
router.post('/accept-terms',async(req,res)=>{
 const input=z.object({version:z.string().min(1).max(100),accepted:z.literal(true)}).strict().parse(req.body);
 await tx(async db=>{const legal=await settings(db);ensure(legal.published&&input.version===legal.legal_version,409,'Os termos foram atualizados. Leia a versão atual.');
  await db.query('INSERT INTO terms_acceptances(user_id,version) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.access!.userId,input.version]);
  await recordAudit(db,{tenantId:req.access!.tenantId,userId:req.access!.userId,action:'legal.terms_accepted',entityType:'user',entityId:req.access!.userId,metadata:{version:input.version}});});
 res.json({ok:true});
});

router.get('/platform/settings',platform,async(_req,res)=>{
 const [config,plans]=await Promise.all([settings(),pool.query('SELECT * FROM subscription_plans ORDER BY interval_months')]);
 const draft=legalTemplatesFor({...config,plans:plans.rows});res.json({...config,privacy_text:config.privacy_text||draft.privacy,terms_text:config.terms_text||draft.terms,plans:plans.rows});
});
const email=z.union([z.email().max(255),z.literal('')]);
const settingsInput=z.object({brand:z.string().trim().min(2).max(100),legal_name:z.string().trim().max(200),support_email:email,privacy_email:email,address:z.string().trim().max(500),
 privacy_text:z.string().max(40000),terms_text:z.string().max(40000),published:z.boolean(),effective_date:z.iso.date().nullable(),
 subprocessors:z.array(z.object({name:z.string().trim().min(2).max(100),purpose:z.string().trim().min(3).max(500),location:z.string().trim().min(2).max(200)}).strict()).max(30),
 trial_days:z.number().int().min(0).max(90),grace_days:z.number().int().min(0).max(30),review_confirmed:z.boolean(),password:password.optional()}).strict();
router.put('/platform/settings',platform,async(req,res)=>{
 const input=settingsInput.parse(req.body);
 if(input.published){
  ensure(input.review_confirmed&&input.legal_name.length>=3&&input.support_email&&input.privacy_email&&input.address&&input.effective_date,422,'Preencha a identificação, os canais de contato e confirme a revisão dos documentos.');
  ensure(input.privacy_text.trim().length>=500&&input.terms_text.trim().length>=500&&input.subprocessors.length>0,422,'Revise os documentos e informe os fornecedores e as regiões efetivamente utilizadas.');
  ensure(!/\[[A-ZÁÉÍÓÚÇ_ /-]{3,}\]/.test(input.privacy_text+input.terms_text),422,'Substitua os campos pendentes nos documentos antes de publicar.');
  ensure(input.password,422,'Confirme sua senha para publicar documentos.');await confirmPassword(req,input.password);
 }
 const version=legalVersion({operator:[input.brand,input.legal_name,input.support_email,input.privacy_email,input.address],privacy:input.privacy_text,terms:input.terms_text,subprocessors:input.subprocessors,effectiveDate:input.effective_date});
 await tx(async db=>{
  await db.query(`UPDATE commercial_settings SET brand=$1,legal_name=$2,support_email=$3,privacy_email=$4,address=$5,privacy_text=$6,terms_text=$7,
   published=$8,legal_version=$9,effective_date=$10,subprocessors=$11::jsonb,trial_days=$12,grace_days=$13,updated_at=now(),updated_by=$14 WHERE singleton=true`,
   [input.brand,input.legal_name||null,input.support_email||null,input.privacy_email||null,input.address||null,input.privacy_text,input.terms_text,input.published,version,input.effective_date,JSON.stringify(input.subprocessors),input.trial_days,input.grace_days,req.access!.userId]);
  await recordAudit(db,{tenantId:null,userId:req.access!.userId,action:'platform.settings_updated',entityType:'platform',metadata:{published:input.published,version}});
 });res.json({ok:true,version});
});
router.patch('/platform/plans/:id',platform,async(req,res)=>{
 const id=planId.parse(req.params.id),input=z.object({name:z.string().trim().min(2).max(100),amount_cents:z.number().int().min(1).max(99999999),checkout_url:z.string().max(1500).nullable(),checkout_reviewed:z.boolean(),active:z.boolean()}).strict().parse(req.body);
 const url=paymentLink(input.checkout_url);
 ensure(!input.checkout_reviewed||url,422,'Cadastre o link antes de confirmar sua revisão.');
 await tx(async db=>{await db.query('UPDATE subscription_plans SET name=$2,amount_cents=$3,checkout_url=$4,active=$5,checkout_reviewed=$6,updated_at=now() WHERE id=$1',[id,input.name,input.amount_cents,url,input.active,input.checkout_reviewed]);
  await recordAudit(db,{tenantId:null,userId:req.access!.userId,action:'platform.plan_updated',entityType:'plan',metadata:{plan:id,amount_cents:input.amount_cents,active:input.active}});});res.json({ok:true});
});
router.get('/platform/subscriptions',platform,async(req,res)=>{
 const {page,page_size}=pageQuery.parse(req.query),q=z.string().trim().max(100).default('').parse(req.query.q);
 const result=await pool.query(`WITH companies AS (SELECT t.id,t.name,t.active,s.plan_id,s.status,s.trial_ends_at,s.paid_through,s.suspension_reason,
  p.amount_cents,p.name AS plan_name FROM tenants t LEFT JOIN tenant_subscriptions s ON s.tenant_id=t.id
  LEFT JOIN subscription_plans p ON p.id=s.plan_id WHERE $1::text='' OR strpos(lower(t.name),lower($1))>0)
  SELECT (SELECT count(*)::int FROM companies) AS total,COALESCE((SELECT json_agg(r) FROM (SELECT * FROM companies ORDER BY lower(name),id LIMIT $2 OFFSET $3) r),'[]') AS items`,[q,page_size,(page-1)*page_size]);
 res.json({...result.rows[0],page,pageSize:page_size});
});
router.get('/platform/subscriptions/:id',platform,async(req,res)=>{
 const company=z.uuid().parse(req.params.id);
 const record=(await pool.query('SELECT id,name,active FROM tenants WHERE id=$1',[company])).rows[0];ensure(record,404,'Empresa não encontrada.');
 const [current,payments,plans]=await Promise.all([subscription(company),pool.query('SELECT * FROM subscription_payments WHERE tenant_id=$1 ORDER BY recorded_at DESC LIMIT 50',[company]),pool.query('SELECT * FROM subscription_plans ORDER BY interval_months')]);
 res.json({company:record,subscription:current,payments:payments.rows,plans:plans.rows});
});
router.post('/platform/subscriptions/:id/payments',platform,async(req,res)=>{
 const company=z.uuid().parse(req.params.id);
 const input=z.object({plan_id:planId,amount_cents:z.number().int().positive(),provider_reference:z.string().trim().min(3).max(160),received_at:z.iso.datetime({offset:true}),idempotency_key:z.uuid(),confirmed_in_pagbank:z.literal(true)}).strict().parse(req.body);
 ensure(new Date(input.received_at).getTime()<=Date.now()+300000,422,'O recebimento não pode estar no futuro.');
 const result=await tx(async db=>{
  ensure((await db.query('SELECT 1 FROM tenants WHERE id=$1',[company])).rowCount,404,'Empresa não encontrada.');
  await subscription(company,db);
  const current=(await db.query('SELECT * FROM tenant_subscriptions WHERE tenant_id=$1 FOR UPDATE',[company])).rows[0];
  const previous=await db.query('SELECT * FROM subscription_payments WHERE tenant_id=$1 AND idempotency_key=$2',[company,input.idempotency_key]);
  if(previous.rowCount){const old=previous.rows[0];ensure(old.provider_reference===input.provider_reference&&old.amount_cents===input.amount_cents&&old.plan_id===input.plan_id,409,'Esta operação já foi usada para outro recebimento.');return old;}
  const plan=(await db.query('SELECT * FROM subscription_plans WHERE id=$1 AND active=true',[input.plan_id])).rows[0];
  ensure(plan&&plan.amount_cents===input.amount_cents,422,'Confirme o valor integral do plano selecionado.');
  const row=await db.query(`INSERT INTO subscription_payments(tenant_id,plan_id,amount_cents,provider_reference,period_start,period_end,received_at,recorded_by,idempotency_key)
   VALUES($1,$2,$3,$4,GREATEST(COALESCE($5::timestamptz,now()),now()),GREATEST(COALESCE($5::timestamptz,now()),now())+($6::int*interval '1 month'),$7,$8,$9) RETURNING *`,
   [company,input.plan_id,input.amount_cents,input.provider_reference,current.paid_through,plan.interval_months,input.received_at,req.access!.userId,input.idempotency_key]);
  await db.query("UPDATE tenant_subscriptions SET plan_id=$2,status='active',paid_through=$3,suspension_reason='',updated_at=now() WHERE tenant_id=$1",[company,input.plan_id,row.rows[0].period_end]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'subscription.payment_confirmed_manually',entityType:'subscription_payment',entityId:row.rows[0].id,metadata:{amount_cents:input.amount_cents,plan:input.plan_id}});return row.rows[0];
 });res.status(201).json(result);
});
router.post('/platform/payments/:id/void',platform,async(req,res)=>{
 const id=z.uuid().parse(req.params.id),input=z.object({reason:z.string().trim().min(5).max(500),password}).strict().parse(req.body);await confirmPassword(req,input.password);
 await tx(async db=>{
  const target=(await db.query('SELECT tenant_id FROM subscription_payments WHERE id=$1',[id])).rows[0];ensure(target,404,'Recebimento não encontrado.');
  await db.query('SELECT tenant_id FROM tenant_subscriptions WHERE tenant_id=$1 FOR UPDATE',[target.tenant_id]);
  const payment=(await db.query('SELECT * FROM subscription_payments WHERE id=$1 FOR UPDATE',[id])).rows[0];ensure(payment,404,'Recebimento não encontrado.');
  if(payment.voided_at)return;
  await db.query('UPDATE subscription_payments SET voided_at=now(),voided_by=$2,void_reason=$3 WHERE id=$1',[id,req.access!.userId,input.reason]);
  await db.query(`UPDATE tenant_subscriptions SET paid_through=(SELECT max(period_end) FROM subscription_payments WHERE tenant_id=$1 AND voided_at IS NULL),updated_at=now() WHERE tenant_id=$1`,[payment.tenant_id]);
  await recordAudit(db,{tenantId:payment.tenant_id,userId:req.access!.userId,action:'subscription.payment_voided',entityType:'subscription_payment',entityId:id});
 });res.json({ok:true,message:'Registro invalidado. Um eventual estorno do cartão deve ser feito no PagBank.'});
});
router.patch('/platform/subscriptions/:id/status',platform,async(req,res)=>{
 const company=z.uuid().parse(req.params.id),input=z.object({status:z.enum(['active','suspended']),reason:z.string().trim().min(5).max(500),password}).strict().parse(req.body);await confirmPassword(req,input.password);
 await tx(async db=>{ensure((await db.query('SELECT 1 FROM tenants WHERE id=$1',[company])).rowCount,404,'Empresa não encontrada.');await subscription(company,db);
  await db.query('UPDATE tenant_subscriptions SET status=$2,suspension_reason=$3,updated_at=now() WHERE tenant_id=$1',[company,input.status,input.status==='suspended'?input.reason:'']);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'subscription.access_'+input.status,entityType:'subscription'});});res.json({ok:true});
});
router.get('/setup',async(req,res)=>{
 ensure(req.access!.role==='admin',403,'Somente o responsável configura os primeiros passos.');const company=tenant(req);
 const row=await pool.query(`SELECT (SELECT count(*)::int FROM services WHERE tenant_id=$1 AND active=true) services,
  (SELECT count(*)::int FROM professionals WHERE tenant_id=$1 AND active=true) professionals,
  (SELECT count(*)::int FROM professionals p WHERE p.tenant_id=$1 AND p.active=true
   AND EXISTS(SELECT 1 FROM professional_services ps JOIN services s ON s.tenant_id=ps.tenant_id AND s.id=ps.service_id WHERE ps.tenant_id=p.tenant_id AND ps.professional_id=p.id AND s.active=true)
   AND EXISTS(SELECT 1 FROM professional_shifts sh WHERE sh.tenant_id=p.tenant_id AND sh.professional_id=p.id)) AS "readyProfessionals",
  (SELECT count(*)::int FROM tutors WHERE tenant_id=$1 AND anonymized_at IS NULL) tutors,
  (SELECT count(*)::int FROM pets p JOIN tutors t ON t.tenant_id=p.tenant_id AND t.id=p.tutor_id WHERE p.tenant_id=$1 AND t.anonymized_at IS NULL) pets,
  (SELECT count(*)::int FROM appointments WHERE tenant_id=$1) appointments,
  (SELECT count(*)::int FROM business_sales WHERE tenant_id=$1 AND status<>'cancelled') sales,
  (SELECT count(*)::int FROM business_ledger WHERE tenant_id=$1 AND kind='sale_payment') receipts`,[company]);res.json(row.rows[0]);
});
router.get('/audit',async(req,res)=>{
 ensure(req.access!.role==='admin'||req.access!.role==='platform',403,'Somente administradores podem consultar a auditoria.');
 const {page,page_size}=pageQuery.parse(req.query),company=req.access!.role==='platform'?null:tenant(req);
 const result=await pool.query(`WITH events AS (SELECT id,tenant_id,actor_user_id,action,entity_type,entity_id,metadata,created_at FROM audit_events WHERE $1::uuid IS NULL OR tenant_id=$1)
  SELECT (SELECT count(*)::int FROM events) total,COALESCE((SELECT json_agg(r) FROM (SELECT * FROM events ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3) r),'[]') items`,[company,page_size,(page-1)*page_size]);
 res.json({...result.rows[0],page,pageSize:page_size});
});

async function ticketAccess(req:import('express').Request,id:string) {
 const scope=req.access!.role==='platform'?null:tenant(req),user=req.access!.role==='employee'?req.access!.userId:null;
 const result=await pool.query('SELECT * FROM support_tickets WHERE id=$1 AND ($2::uuid IS NULL OR tenant_id=$2) AND ($3::uuid IS NULL OR created_by=$3)',[id,scope,user]);
 ensure(result.rowCount,404,'Solicitação não encontrada.');return result.rows[0];
}
router.get('/support',async(req,res)=>{
 const {page,page_size}=pageQuery.parse(req.query),scope=req.access!.role==='platform'?null:tenant(req),user=req.access!.role==='employee'?req.access!.userId:null;
 const result=await pool.query(`WITH tickets AS (SELECT s.*,t.name AS company_name FROM support_tickets s JOIN tenants t ON t.id=s.tenant_id
  WHERE ($1::uuid IS NULL OR s.tenant_id=$1) AND ($2::uuid IS NULL OR s.created_by=$2))
  SELECT (SELECT count(*)::int FROM tickets) total,COALESCE((SELECT json_agg(r) FROM (SELECT * FROM tickets ORDER BY updated_at DESC,id DESC LIMIT $3 OFFSET $4) r),'[]') items`,[scope,user,page_size,(page-1)*page_size]);
 res.json({...result.rows[0],page,pageSize:page_size});
});
router.post('/support',async(req,res)=>{
 const company=tenant(req),input=z.object({subject:z.string().trim().min(3).max(160),category:z.enum(['access','billing','technical','privacy','other']),body:z.string().trim().min(5).max(4000)}).strict().parse(req.body);
 const ticket=await tx(async db=>{const row=(await db.query('INSERT INTO support_tickets(tenant_id,created_by,subject,category) VALUES($1,$2,$3,$4) RETURNING *',[company,req.access!.userId,input.subject,input.category])).rows[0];
  await db.query('INSERT INTO support_messages(tenant_id,ticket_id,actor_user_id,body) VALUES($1,$2,$3,$4)',[company,row.id,req.access!.userId,input.body]);
  await recordAudit(db,{tenantId:company,userId:req.access!.userId,action:'support.created',entityType:'support_ticket',entityId:row.id});return row;});res.status(201).json(ticket);
});
router.get('/support/:id',async(req,res)=>{
 const id=z.uuid().parse(req.params.id),ticket=await ticketAccess(req,id);
 const messages=await pool.query(`SELECT m.id,m.body,m.from_platform,m.created_at FROM support_messages m
  WHERE tenant_id=$1 AND ticket_id=$2 ORDER BY created_at,id LIMIT 200`,[ticket.tenant_id,id]);res.json({ticket,messages:messages.rows});
});
router.post('/support/:id/messages',async(req,res)=>{
 const id=z.uuid().parse(req.params.id),ticket=await ticketAccess(req,id),input=z.object({body:z.string().trim().min(1).max(4000),status:z.enum(['open','in_progress','resolved']).optional()}).strict().parse(req.body);
 ensure(input.status===undefined||req.access!.role==='platform',403,'Somente o suporte pode alterar a situação da solicitação.');
 await tx(async db=>{await db.query('INSERT INTO support_messages(tenant_id,ticket_id,actor_user_id,from_platform,body) VALUES($1,$2,$3,$4,$5)',[ticket.tenant_id,id,req.access!.userId,req.access!.role==='platform',input.body]);
  await db.query('UPDATE support_tickets SET updated_at=now(),status=COALESCE($2,status) WHERE id=$1',[id,input.status??null]);
  await recordAudit(db,{tenantId:ticket.tenant_id,userId:req.access!.userId,action:'support.message_added',entityType:'support_ticket',entityId:id});});res.status(201).json({ok:true});
});
export default router;
