// One-off restore into the new, isolated database. No writes to the source.
const fs=require('node:fs');
async function main(){
 const privateState=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const address=new URL('postgresql://petcore_schema_owner@petcore-db:5432/petcore_migration_20261120_restore_test');
 address.password=privateState.PG_OWNER_PASSWORD;
 address.searchParams.set('sslmode','verify-full');address.searchParams.set('sslrootcert','/run/petcore-ca/ca.crt');
 process.env.RESTORE_DATABASE_URL=address.href;
 process.env.RESTORE_RETENTION_PAUSED='YES';
 delete process.env.DATABASE_URL;delete process.env.DATABASE_DIRECT_URL;
 if(!process.env.SOURCE_OBJECT_KEY?.endsWith('-9a679551-f7c0-4ced-b9f7-0fa77f7ca340.dump.enc'))throw Error('RESTORE_SOURCE_NOT_APPROVED');
 if(fs.existsSync('/private/RESTORE-COMPLETE.json'))throw Error('RESTORE_ALREADY_RECORDED');
 const {checkRestore}=await import('/app/api/scripts/restore-check.mjs');
 const result=await checkRestore(['--object-key',process.env.SOURCE_OBJECT_KEY]);
 fs.writeFileSync('/private/RESTORE-COMPLETE.json',JSON.stringify({createdAt:new Date().toISOString(),result}),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({ok:true,event:'petcore_staged_restore_completed',promoted:false}));
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^[A-Z0-9_]{2,80}$/.test(error.code||'')?error.code:/^[A-Z0-9_]{2,80}$/.test(error.message||'')?error.message:'RESTORE_STAGING_FAILED'}));process.exitCode=1;});
