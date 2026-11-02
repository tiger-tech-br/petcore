import type {Request,Response,NextFunction} from 'express';
import {createHash} from 'node:crypto';
import {pool,ensure,type Db} from './core.js';

export async function settings(db:Db=pool) {
 const result=await db.query('SELECT * FROM commercial_settings WHERE singleton=true');return result.rows[0];
}
export function legalPublic(row:any) {
 if(!row.published)return {published:false,version:'draft',effectiveDate:null,operator:{brand:row.brand,legalName:null,supportEmail:null,privacyEmail:null,address:null},documents:{privacy:'',terms:''},subprocessors:[]};
 return {published:row.published,version:row.legal_version,effectiveDate:row.effective_date instanceof Date?row.effective_date.toISOString().slice(0,10):row.effective_date,
  operator:{brand:row.brand,legalName:row.legal_name,supportEmail:row.support_email,privacyEmail:row.privacy_email,address:row.address},
  documents:{privacy:row.privacy_text,terms:row.terms_text},subprocessors:row.subprocessors};
}
export function legalVersion(content:unknown) {return createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0,24);}
export function paymentLink(value:string|null) {
 if(!value)return null;
 let url:URL;try{url=new URL(value);}catch{ensure(false,422,'Informe um link HTTPS válido do PagBank.');}
 const hosts=['pag.ae','pagbank.com.br','pagseguro.uol.com.br'];
 ensure(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&hosts.some(host=>url.hostname===host||host!=='pag.ae'&&url.hostname.endsWith('.'+host)),422,'Use um link HTTPS criado no painel oficial do PagBank.');
 return url.toString();
}
export async function subscription(company:string,db:Db=pool) {
 await db.query(`INSERT INTO tenant_subscriptions(tenant_id,trial_ends_at)
  SELECT $1,now()+(trial_days*interval '1 day') FROM commercial_settings WHERE singleton=true ON CONFLICT DO NOTHING`,[company]);
 const result=await db.query(`SELECT s.*,p.name AS plan_name,p.amount_cents,p.interval_months,c.grace_days,c.trial_days,
  GREATEST(s.trial_ends_at,COALESCE(s.paid_through,s.trial_ends_at)) AS access_until,
  CASE WHEN s.onboarding_completed_at IS NULL OR s.status IN ('pending','suspended','cancelled') THEN false
   ELSE GREATEST(s.trial_ends_at,COALESCE(s.paid_through,s.trial_ends_at))+(c.grace_days*interval '1 day')>=now() END AS writable
  FROM tenant_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id CROSS JOIN commercial_settings c
  WHERE s.tenant_id=$1 AND c.singleton=true`,[company]);
 return result.rows[0];
}
// Expired subscriptions preserve consultation, data-rights and billing access.
export async function requireSubscriptionWrite(req:Request,_res:Response,next:NextFunction) {
 try {
  if(!['POST','PUT','PATCH','DELETE'].includes(req.method)||!req.access?.tenantId)return next();
  const current=await subscription(req.access.tenantId);
  ensure(current.onboarding_completed_at,428,'Escolha o plano no primeiro acesso para começar a usar o PetCore.');
  const legal=await settings();
  if(legal.published){const accepted=await pool.query('SELECT 1 FROM terms_acceptances WHERE user_id=$1 AND version=$2',[req.access.userId,legal.legal_version]);ensure(accepted.rowCount,428,'Leia e aceite os Termos de Uso atuais para continuar.');}
  ensure(current.writable,402,'A assinatura precisa ser regularizada para realizar alterações. Consulte Plano e assinatura.');next();
 }catch(error){next(error);}
}
