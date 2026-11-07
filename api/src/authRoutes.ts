import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { pool, tx, normEmail, sha, token, hashPassword, error, ensure, auth, tenant, platform, permit } from './core.js';
import {settings,subscription} from './commercialService.js';
import {recordAudit} from './audit.js';
const router=Router();
const credentials=z.object({email:z.email().max(255),password:z.string().min(8).max(200)});
const passRule=z.string().min(12).max(200);
function newSession(req:import('express').Request):Promise<void>{return new Promise((resolve,reject)=>req.session.regenerate(err=>err?reject(err):resolve()));}
async function throttle(req:import('express').Request,_res:import('express').Response,next:import('express').NextFunction){
 try{
  const key=sha(`${req.path}:${req.ip||'unknown'}`);
  const result=await pool.query(`INSERT INTO auth_rate_limits(key) VALUES($1)
   ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempts+1 END,
   window_started=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN now() ELSE auth_rate_limits.window_started END
   RETURNING attempts`,[key]);
  ensure(result.rows[0].attempts<=10,429,'Muitas tentativas. Tente novamente em alguns minutos.');next();
 }catch(e){next(e);}
}
router.post('/login',throttle,async(req,res)=>{
 const {email,password}=credentials.parse(req.body);
 const found=await pool.query('SELECT id,password_hash,is_platform_owner,session_version FROM users WHERE email=$1',[normEmail(email)]);
 if(!found.rowCount||!await argon2.verify(found.rows[0].password_hash,password))error(401,'E-mail ou senha incorretos.');
 await newSession(req);req.session.userId=found.rows[0].id;req.session.sessionVersion=found.rows[0].session_version;
 if(!found.rows[0].is_platform_owner){
  const m=await pool.query('SELECT tenant_id FROM memberships WHERE user_id=$1 AND active=true ORDER BY tenant_id LIMIT 1',[found.rows[0].id]);
  req.session.tenantId=m.rows[0]?.tenant_id;
 }
 res.json({ok:true});
});
router.post('/logout',async(req,res)=>{await new Promise<void>((resolve,reject)=>req.session.destroy(e=>e?reject(e):resolve()));res.clearCookie('petcore.sid',{path:'/'});res.json({ok:true});});
router.get('/me',auth,async(req,res)=>{
 const a=req.access!;const memberships=await pool.query(`SELECT t.id,t.name,m.role FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.active=true AND t.active=true ORDER BY t.name`,[a.userId]);
 const config=await settings();
 const acceptance=config.published?await pool.query('SELECT 1 FROM terms_acceptances WHERE user_id=$1 AND version=$2',[a.userId,config.legal_version]):{rowCount:1};
 res.json({user:{id:a.userId,name:a.name,role:a.role,permissions:a.permissions,scopeProfessionalId:a.scopeProfessionalId,tenantId:a.tenantId,companyName:a.companyName},companies:memberships.rows,
  legal:{required:config.published&&!acceptance.rowCount,version:config.legal_version},subscription:a.tenantId?await subscription(a.tenantId):null});
});
router.post('/select-company',auth,async(req,res)=>{
 const id=z.uuid().parse(req.body.tenantId);
 const a=req.access!;const m=await pool.query('SELECT 1 FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.active=true AND t.active=true',[id,a.userId]);
 ensure(m.rowCount,403,'Você não tem acesso a esta empresa.');req.session.tenantId=id;res.json({ok:true});
});
router.post('/return-platform',auth,async(req,res)=>{
 const a=req.access!;const owner=await pool.query('SELECT 1 FROM users WHERE id=$1 AND is_platform_owner=true',[a.userId]);ensure(owner.rowCount,403,'Sem acesso.');
 delete req.session.tenantId;res.json({ok:true});
});
router.get('/platform/companies',auth,platform,async(_req,res)=>{
 const result=await pool.query('SELECT t.*,count(m.user_id)::int AS member_count FROM tenants t LEFT JOIN memberships m ON m.tenant_id=t.id GROUP BY t.id ORDER BY t.name');res.json(result.rows);
});
router.post('/platform/companies',auth,platform,async(req,res)=>{
 const input=z.object({name:z.string().trim().min(2).max(160),email:z.email(),timezone:z.string().default('America/Sao_Paulo')}).parse(req.body);
 // Validar timezone via Intl (evita valores inválidos que quebrariam a agenda).
 try{new Intl.DateTimeFormat('en-US',{timeZone:input.timezone});}catch{error(422,'Fuso horário inválido.');}
 const result=await tx(async c=>{
  const company=await c.query('INSERT INTO tenants(name,timezone) VALUES($1,$2) RETURNING *',[input.name,input.timezone]);
  await subscription(company.rows[0].id,c);
  const raw=token();await c.query(`INSERT INTO invitations(tenant_id,email,role,token_hash,expires_at,created_by)
   VALUES($1,$2,'admin',$3,now()+interval '7 days',$4)`,[company.rows[0].id,normEmail(input.email),sha(raw),req.access!.userId]);
  return {company:company.rows[0],inviteToken:raw};
 });res.status(201).json(result);
});
router.post('/invites',auth,permit('team'),async(req,res)=>{
 const {email}=z.object({email:z.email()}).parse(req.body);const id=tenant(req),raw=token();
 await pool.query(`INSERT INTO invitations(tenant_id,email,role,token_hash,expires_at,created_by)
 VALUES($1,$2,'employee',$3,now()+interval '7 days',$4)`,[id,normEmail(email),sha(raw),req.access!.userId]);
 res.status(201).json({inviteToken:raw,expiresInDays:7});
});
router.get('/invite/:token',async(req,res)=>{
 const raw=z.string().length(64).parse(req.params.token);
 const r=await pool.query(`SELECT i.email,i.role,t.name AS company_name FROM invitations i JOIN tenants t ON t.id=i.tenant_id
 WHERE i.token_hash=$1 AND i.redeemed_at IS NULL AND i.expires_at>now()`,[sha(raw)]);
 ensure(r.rowCount,404,'Convite inválido ou expirado.');res.json(r.rows[0]);
});
router.post('/invite/accept',async(req,res)=>{
 const {inviteToken,name,password,accepted_terms,terms_version}=z.object({inviteToken:z.string().length(64),name:z.string().trim().min(2).max(160),password:passRule,accepted_terms:z.boolean().optional(),terms_version:z.string().max(100).optional()}).parse(req.body);
 await tx(async c=>{
  const inv=await c.query(`SELECT * FROM invitations WHERE token_hash=$1 AND redeemed_at IS NULL AND expires_at>now() FOR UPDATE`,[sha(inviteToken)]);
  ensure(inv.rowCount,410,'Convite expirado ou já utilizado.');
  const found=await c.query('SELECT id FROM users WHERE email=$1',[inv.rows[0].email]);
  let userId:string;
  if(found.rowCount){error(409,'Esta conta já existe. Entre com sua conta e solicite vinculação à empresa.');}
  const user=await c.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id',[name,inv.rows[0].email,await hashPassword(password)]);
  userId=user.rows[0].id;
  const legal=await settings(c);
  if(legal.published){ensure(accepted_terms===true&&terms_version===legal.legal_version,422,'Leia e aceite os Termos de Uso atuais antes de ativar a conta.');await c.query('INSERT INTO terms_acceptances(user_id,version) VALUES($1,$2)',[userId,legal.legal_version]);}
  await c.query('INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,$3,$4)',[inv.rows[0].tenant_id,userId,inv.rows[0].role,inv.rows[0].role==='employee'?['appointments','tutors','pets','waitlist']:[]]);
  await c.query('UPDATE invitations SET redeemed_at=now() WHERE id=$1',[inv.rows[0].id]);
  await recordAudit(c,{tenantId:inv.rows[0].tenant_id,userId,action:'account.invitation_accepted',entityType:'user',entityId:userId});
 });res.status(201).json({ok:true});
});
// A recuperação exige serviço de e-mail real configurado; sem API KEY não afirma envio.
router.post('/invite/join',auth,async(req,res)=>{
 const {inviteToken}=z.object({inviteToken:z.string().length(64)}).parse(req.body);
 const target=await tx(async db=>{
  const inv=await db.query(`SELECT i.*,u.email AS user_email FROM invitations i JOIN users u ON u.id=$2
  WHERE i.token_hash=$1 AND i.redeemed_at IS NULL AND i.expires_at>now() FOR UPDATE OF i`,[sha(inviteToken),req.access!.userId]);
  ensure(inv.rowCount,410,'Convite expirado ou já utilizado.');
  ensure(inv.rows[0].email===inv.rows[0].user_email,403,'O convite foi enviado para outro e-mail.');
  const exists=await db.query('SELECT 1 FROM memberships WHERE tenant_id=$1 AND user_id=$2',[inv.rows[0].tenant_id,req.access!.userId]);
  ensure(!exists.rowCount,409,'Você já pertence a esta empresa.');
  await db.query('INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,$3,$4)',[inv.rows[0].tenant_id,req.access!.userId,inv.rows[0].role,inv.rows[0].role==='employee'?['appointments','tutors','pets','waitlist']:[]]);
  await db.query('UPDATE invitations SET redeemed_at=now() WHERE id=$1',[inv.rows[0].id]);
  return inv.rows[0].tenant_id as string;
 });req.session.tenantId=target;res.json({ok:true,tenantId:target});
});
router.post('/password/forgot',throttle,async(req,res)=>{
 const {email}=z.object({email:z.email()}).parse(req.body);
 ensure(process.env.EMAIL_PROVIDER==='resend'&&process.env.EMAIL_API_KEY&&process.env.EMAIL_FROM,503,'A recuperação de senha está indisponível no momento. Tente novamente mais tarde ou fale com o suporte.');
 const user=await pool.query('SELECT id FROM users WHERE email=$1',[normEmail(email)]);
 if(user.rowCount){
  const raw=token();await pool.query(`INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '30 minutes')`,[user.rows[0].id,sha(raw)]);
  const url=`${process.env.APP_ORIGIN}/?reset=${raw}`;
  try{
   const reply=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.EMAIL_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[normEmail(email)],subject:'Recuperar senha PetCore',html:`<p>Solicitou recuperação de senha?</p><p><a href="${url}">Alterar minha senha</a></p><p>O link expira em 30 minutos.</p>`})});
   ensure(reply.ok,502,'Falha ao enviar recuperação.');
  }catch{error(502,'Não foi possível enviar as orientações agora. Tente novamente em alguns minutos ou fale com o suporte.');}
 }
 res.json({message:'Se a conta existir, você receberá orientações por e-mail.'});
});
router.post('/password/reset',async(req,res)=>{
 const {token:raw,password}=z.object({token:z.string().length(64),password:passRule}).parse(req.body);
 await tx(async c=>{
  const owner=await c.query('SELECT user_id FROM password_resets WHERE token_hash=$1',[sha(raw)]);ensure(owner.rowCount,410,'Token inválido ou expirado.');
  // Serializa todos os links da conta antes de bloquear qualquer token.
  // FOR UPDATE também ordena novas emissões pela chave estrangeira de user_id.
  const user=await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[owner.rows[0].user_id]);ensure(user.rowCount,410,'Token inválido ou expirado.');
  const r=await c.query(`SELECT id FROM password_resets WHERE token_hash=$1 AND user_id=$2 AND used_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`,[sha(raw),owner.rows[0].user_id]);ensure(r.rowCount,410,'Token inválido ou expirado.');
  await c.query('UPDATE users SET password_hash=$1,session_version=session_version+1 WHERE id=$2',[await hashPassword(password),owner.rows[0].user_id]);
  await c.query('UPDATE password_resets SET used_at=clock_timestamp() WHERE user_id=$1 AND used_at IS NULL',[owner.rows[0].user_id]);
 });res.json({ok:true});
});
export default router;
