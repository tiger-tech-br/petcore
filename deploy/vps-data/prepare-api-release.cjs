// Seed an immutable, public code volume from the pinned runtime; no private mounts.
const fs=require('node:fs'),crypto=require('node:crypto');
const marker='/release/PETCORE-RELEASE.json',revision='33c1d01572b3d30bd1e225eb6abc6c37d28ecd6e';
const fail=code=>{throw Object.assign(new Error(code),{code});};
try{
 if(fs.existsSync(marker)){if(JSON.parse(fs.readFileSync(marker,'utf8')).revision!==revision)fail('RELEASE_EXISTING_REVISION_MISMATCH');}
 else{
  if(fs.readdirSync('/release').length)fail('RELEASE_VOLUME_NOT_EMPTY');
  fs.cpSync('/app/api','/release',{recursive:true,errorOnExist:true,force:false});
  const file='/release/dist/backupRetention.js',before=fs.readFileSync(file,'utf8');
  const needle="  WHERE (state='expiring'";
  if(before.split(needle).length!==2||before.includes("retention_scope='active'"))fail('RELEASE_SOURCE_MISMATCH');
  fs.writeFileSync(file,before.replace(needle,"  WHERE retention_scope='active'\n   AND (state='expiring'"));
  const migration=Buffer.from(process.env.MIGRATION_020_BASE64||'','base64');
  if(crypto.createHash('sha256').update(migration).digest('hex')!=='bdf19081df2b221b5d40dc9a6c3956056f8b39c7f210f5fd584f6942deae1f46')fail('RELEASE_MIGRATION_CHECKSUM_MISMATCH');
  fs.writeFileSync('/release/sql/020_backup_legacy_scope.sql',migration,{flag:'wx',mode:0o644});
  if(fs.existsSync('/release/sql/016_taxi_driver_accounts.sql'))fail('RELEASE_UNRELATED_MIGRATION_PRESENT');
  fs.writeFileSync(marker,JSON.stringify({revision,baseImage:'petcore-runtime:acde9dded16f71403d2a152284144d3019b10d10',legacyScope:true}),{flag:'wx',mode:0o444});
 }
 console.log(JSON.stringify({ok:true,event:'petcore_api_release_prepared',revision,legacyScope:true,unrelated016Absent:true}));
}catch(error){console.error(JSON.stringify({ok:false,code:/^RELEASE_[A-Z_]+$/.test(error.code||'')?error.code:'RELEASE_PREPARATION_FAILED',systemCode:/^E[A-Z]{2,30}$/.test(error.code||'')?error.code:null}));process.exitCode=1;}
