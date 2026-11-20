// Operator-approved single recovery email, only for a new isolated test account.
const fs=require('node:fs'),crypto=require('node:crypto');
const {Pool}=require('/app/node_modules/pg');
const argon2=require('/app/node_modules/argon2');
const statePath='/private/PASSWORD-RECOVERY-TEST.json';
async function main(){
 if(fs.existsSync(statePath))throw Error('PASSWORD_TEST_ALREADY_STARTED');
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const u=new URL('postgresql://petcore_schema_owner@petcore-db:5432/petcore');u.password=state.PG_OWNER_PASSWORD;u.searchParams.set('sslmode','verify-full');u.searchParams.set('sslrootcert','/run/petcore-ca/ca.crt');
 const db=new Pool({connectionString:u.href,max:1,connectionTimeoutMillis:10000,statement_timeout:15000});db.on('error',()=>{});
 const record={format:'petcore.password-recovery-test.v1',email:'tigertechbr@outlook.com',userId:crypto.randomUUID(),tenantId:crypto.randomUUID(),marker:'QA_PASSWORD_RECOVERY_'+crypto.randomUUID(),createdAt:new Date().toISOString(),stage:'preparing',emailRequests:0};
 try{
  if((await db.query('SELECT 1 FROM users WHERE email=$1',[record.email])).rowCount)throw Error('PASSWORD_TEST_RECIPIENT_ALREADY_EXISTS');
  const hash=await argon2.hash(crypto.randomBytes(48).toString('base64url'),{type:argon2.argon2id});
  await db.query('BEGIN');
  try{
   await db.query('INSERT INTO tenants(id,name,timezone) VALUES($1,$2,$3)',[record.tenantId,record.marker,'America/Sao_Paulo']);
   await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',[record.userId,'Teste temporário de recuperação',record.email,hash]);
   await db.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}')",[record.tenantId,record.userId]);
   await db.query("INSERT INTO tenant_subscriptions(tenant_id,status,onboarding_completed_at,onboarding_plan,trial_started_at,trial_ends_at) VALUES($1,'trial',now(),'free',now(),now()+interval '30 days')",[record.tenantId]);
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}
  record.stage='account_created';fs.writeFileSync(statePath,JSON.stringify(record),{flag:'wx',mode:0o600});
  // Record the attempt before the network request: a timeout is not retried.
  record.stage='email_requested';record.emailRequests=1;fs.writeFileSync(statePath,JSON.stringify(record),{mode:0o600});
  const reply=await fetch('https://petcore.tigertech.dev.br/api/auth/password/forgot',{method:'POST',redirect:'error',headers:{Origin:'https://petcore.tigertech.dev.br','X-PetCore-Request':'1','Content-Type':'application/json'},body:JSON.stringify({email:record.email}),signal:AbortSignal.timeout(20000)});
  record.httpStatus=reply.status;record.stage=reply.status===200?'awaiting_user':'request_failed';
  const tokens=(await db.query('SELECT count(*)::int AS n FROM password_resets WHERE user_id=$1 AND used_at IS NULL',[record.userId])).rows[0].n;
  fs.writeFileSync(statePath,JSON.stringify(record),{mode:0o600});
  console.log(JSON.stringify({ok:reply.status===200&&tokens===1,event:'password_recovery_test_email_requested',httpStatus:reply.status,isolatedAccount:true,oneEmailRequested:record.emailRequests===1,deliveryNotYetConfirmed:true}));
  if(reply.status!==200||tokens!==1)process.exitCode=1;
 }finally{await db.end();}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^PASSWORD_TEST_[A-Z_]+$/.test(error.message||'')?error.message:'PASSWORD_TEST_FAILED'}));process.exitCode=1;});
