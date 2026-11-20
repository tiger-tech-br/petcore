// Refresh only a recognized unpublished default; preserve custom/published text.
const fs=require('node:fs'),crypto=require('node:crypto');
const {Pool}=require('/app/node_modules/pg');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const normalize=value=>value.replaceAll('\r\n','\n').trim();
function ensure(value,code){if(!value)throw Error(code);}
async function main(){
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const release=JSON.parse(fs.readFileSync('/candidate/PETCORE-RELEASE.json','utf8'));
 ensure(release.revision==='34eb0847e2822094e4636cdee3e182c03f5e5d0b','DRAFT_REFRESH_RELEASE_INVALID');
 const before=await import('/previous/dist/legalTemplates.js'),after=await import('/candidate/dist/legalTemplates.js');
 const url=new URL('postgresql://petcore_schema_owner@petcore-db:5432/petcore');url.password=state.PG_OWNER_PASSWORD;url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert','/run/petcore-ca/ca.crt');
 const db=new Pool({connectionString:url.href,max:1,connectionTimeoutMillis:10000,statement_timeout:15000});db.on('error',()=>{});
 try{
  await db.query('BEGIN');
  try{
   const current=(await db.query('SELECT * FROM commercial_settings WHERE singleton=true FOR UPDATE')).rows[0];
   ensure(current&&!current.published&&current.legal_name==='José Andrey Pereira Lisboa'&&current.brand==='Tiger Tech','DRAFT_REFRESH_TARGET_REFUSED');
   const plans=(await db.query('SELECT id,amount_cents,interval_months FROM subscription_plans ORDER BY id')).rows;
   const identity={...current,plans},oldDraft=before.legalTemplatesFor(identity),newDraft=after.legalTemplatesFor(identity);
   ensure(!current.privacy_text||normalize(current.privacy_text)===normalize(oldDraft.privacy),'DRAFT_REFRESH_CUSTOM_TEXT_PRESERVED');
   ensure(newDraft.privacy.includes('[MECANISMO_TRANSFERENCIAS_VALIDADO]')&&newDraft.privacy.includes('[APROVACAO_JURIDICA_E_OPERACIONAL]'),'DRAFT_REFRESH_REVIEW_GUARDS_MISSING');
   ensure(oldDraft.terms===newDraft.terms,'DRAFT_REFRESH_TERMS_CHANGED');
   const providers=(Array.isArray(current.subprocessors)?current.subprocessors:[]).filter(item=>!/^(?:hostinger|neon(?:\/databricks)?|railway)(?:\b|$)/i.test(item.name||''));
   const resend=providers.find(item=>/^resend(?:\b|$)/i.test(item.name||''));
   if(resend)resend.location='Estados Unidos (armazenamento declarado); cadeia de tratamento sujeita a conferência contratual';
   else providers.push({name:'Resend',purpose:'Recuperação de senha, lembretes autorizados e avisos de suporte',location:'Estados Unidos (armazenamento declarado); cadeia de tratamento sujeita a conferência contratual'});
   providers.unshift({name:'Hostinger',purpose:'Aplicação, PostgreSQL com TLS, arquivos privados no Versity e cópias de segurança na VPS',location:'VPS em Campinas, Brasil; suporte, painel e subprocessadores conforme instrumentos aplicáveis'});
   fs.writeFileSync('/private/LEGAL-DRAFT-BEFORE-HOSTINGER.json',JSON.stringify(current),{flag:'wx',mode:0o600});
   const version=hash(JSON.stringify({operator:[current.brand,current.legal_name,current.support_email,current.privacy_email,current.address],privacy:newDraft.privacy,terms:current.terms_text,subprocessors:providers,effectiveDate:current.effective_date})).slice(0,24);
   await db.query('UPDATE commercial_settings SET privacy_text=$1,subprocessors=$2::jsonb,legal_version=$3,updated_at=now(),updated_by=NULL WHERE singleton=true AND published=false',[newDraft.privacy,JSON.stringify(providers),version]);
   await db.query("INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,metadata) VALUES(NULL,NULL,'platform.infrastructure_draft_updated','platform',$1::jsonb)",[JSON.stringify({published:false,revision:release.revision,recognizedPreviousDefault:true,previousPrivacySha256:hash(current.privacy_text),privacySha256:hash(newDraft.privacy)})]);
   const checked=(await db.query('SELECT published,privacy_text,terms_text FROM commercial_settings WHERE singleton=true')).rows[0];
   ensure(!checked.published&&checked.privacy_text===newDraft.privacy&&checked.terms_text===current.terms_text,'DRAFT_REFRESH_READBACK_FAILED');
   await db.query('COMMIT');
   const record={ok:true,event:'unpublished_infrastructure_draft_refreshed',revision:release.revision,legalPublished:false,previousDefaultMatched:true,termsPreserved:true,identityPricesAndPeriodsPreserved:true,transferReviewMarkerPreserved:true,operatorReviewMarkerPreserved:true,auditRecorded:true,version};
   fs.writeFileSync('/private/LEGAL-DRAFT-INFRA-UPDATED.json',JSON.stringify(record),{mode:0o600});console.log(JSON.stringify(record));
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
 }finally{await db.end();}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^DRAFT_REFRESH_[A-Z_]+$/.test(error.message||'')?error.message:'DRAFT_REFRESH_FAILED'}));process.exitCode=1;});
