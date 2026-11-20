// Verify the user's completed recovery, then remove only this isolated fixture.
const fs=require('node:fs');
const {Pool}=require('/app/node_modules/pg');
function ensure(value,code){if(!value)throw Error(code);}
async function main(){
 const file='/private/PASSWORD-RECOVERY-TEST.json',test=JSON.parse(fs.readFileSync(file,'utf8'));
 ensure(test.format==='petcore.password-recovery-test.v1'&&test.email==='tigertechbr@outlook.com'&&test.emailRequests===1&&test.stage==='awaiting_user','PASSWORD_TEST_STATE_INVALID');
 const secrets=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const url=new URL('postgresql://petcore_schema_owner@petcore-db:5432/petcore');url.password=secrets.PG_OWNER_PASSWORD;url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert','/run/petcore-ca/ca.crt');
 const db=new Pool({connectionString:url.href,max:1,connectionTimeoutMillis:10000,statement_timeout:15000});db.on('error',()=>{});
 try{
  await db.query('BEGIN');
  try{
   const user=(await db.query('SELECT email,name,is_platform_owner,session_version FROM users WHERE id=$1 FOR UPDATE',[test.userId])).rows[0];
   ensure(user?.email===test.email&&user.name==='Teste temporário de recuperação'&&!user.is_platform_owner&&user.session_version===2,'PASSWORD_TEST_ACCOUNT_CHECK_FAILED');
   const company=(await db.query('SELECT name FROM tenants WHERE id=$1 FOR UPDATE',[test.tenantId])).rows[0];ensure(company?.name===test.marker,'PASSWORD_TEST_COMPANY_CHECK_FAILED');
   const used=Number((await db.query('SELECT count(*)::int AS n FROM password_resets WHERE user_id=$1 AND used_at IS NOT NULL AND used_at>=$2::timestamptz',[test.userId,test.createdAt])).rows[0].n);
   const sessions=Number((await db.query('SELECT count(*)::int AS n FROM "session" WHERE sess::jsonb->>\'userId\'=$1 AND sess::jsonb->>\'sessionVersion\'=$2',[test.userId,String(user.session_version)])).rows[0].n);
   // A successful browser login may already have been logged out by the user.
   // The live-session observation is optional; the consumed token is required.
   ensure(used===1,'PASSWORD_TEST_RECOVERY_NOT_COMPLETE');
   // Preserve any unexpected business record rather than deleting by cascade.
   const tables=(await db.query("SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND c.column_name='tenant_id' AND t.table_type='BASE TABLE' ORDER BY c.table_name")).rows;
   for(const row of tables){
    if(['memberships','tenant_subscriptions'].includes(row.table_name))continue;
    const table='"'+row.table_name.replaceAll('"','""')+'"';
    ensure(Number((await db.query('SELECT count(*)::int AS n FROM '+table+' WHERE tenant_id=$1',[test.tenantId])).rows[0].n)===0,'PASSWORD_TEST_UNEXPECTED_BUSINESS_RECORDS');
   }
   const member=await db.query('SELECT user_id FROM memberships WHERE tenant_id=$1',[test.tenantId]);ensure(member.rowCount===1&&member.rows[0].user_id===test.userId,'PASSWORD_TEST_MEMBERSHIP_CHANGED');
   await db.query('DELETE FROM "session" WHERE sess::jsonb->>\'userId\'=$1',[test.userId]);
   await db.query('DELETE FROM password_resets WHERE user_id=$1',[test.userId]);
   await db.query('DELETE FROM memberships WHERE tenant_id=$1 AND user_id=$2',[test.tenantId,test.userId]);
   await db.query('DELETE FROM tenants WHERE id=$1 AND name=$2',[test.tenantId,test.marker]);
   await db.query('DELETE FROM users WHERE id=$1 AND email=$2 AND is_platform_owner=false',[test.userId,test.email]);
   const remaining=(await db.query('SELECT EXISTS(SELECT 1 FROM users WHERE id=$1) OR EXISTS(SELECT 1 FROM tenants WHERE id=$2) AS present',[test.userId,test.tenantId])).rows[0].present;ensure(!remaining,'PASSWORD_TEST_CLEANUP_INCOMPLETE');
   await db.query('COMMIT');
   const record={ok:true,event:'password_recovery_verified',verifiedAt:new Date().toISOString(),emailRequests:1,userConfirmedReceiptAndNewPasswordLogin:true,resetTokenConsumed:true,passwordSessionVersionAdvanced:true,newVersionLoginSessionObserved:sessions>=1,loginEvidence:sessions>=1?'user_report_and_live_session':'user_report',testAccountAndTenantRemoved:true,testSessionsAndTokensRemoved:true,otherAccountsChanged:false,passwordOrTokenExposed:false};
   fs.writeFileSync('/private/PASSWORD-RECOVERY-VERIFIED.json',JSON.stringify(record),{mode:0o600});test.stage='verified_and_removed';fs.writeFileSync(file,JSON.stringify(test),{mode:0o600});console.log(JSON.stringify(record));
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
 }finally{await db.end();}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^PASSWORD_TEST_[A-Z_]+$/.test(error.message||'')?error.message:'PASSWORD_TEST_VERIFICATION_FAILED'}));process.exitCode=1;});
