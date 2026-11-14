import type {PoolConfig} from 'pg';

const failure=(code:string)=>Object.assign(new Error('Revise a conexão direta usada para proteger os arquivos.'),{code});
function parse(value:string|undefined){
 let address:URL;try{address=new URL(value??'');}catch{throw failure('DATABASE_LOCK_URL_INVALID');}
 if(!['postgres:','postgresql:'].includes(address.protocol)||!address.hostname||decodeURIComponent(address.pathname).length<2)throw failure('DATABASE_LOCK_URL_INVALID');
 return address;
}
function target(address:URL){
 const host=address.hostname.endsWith('.neon.tech')?address.hostname.replace(/-pooler(?=\.)/,''):address.hostname;
 return [host.toLowerCase(),address.port||'5432',decodeURIComponent(address.pathname),decodeURIComponent(address.username)].join('\n');
}

// Session advisory locks must never run through Neon's transaction pooler.
// Validate an explicit direct URL against the application target before opening
// any connection; a stale production URL in a test shell must fail closed.
export function directDatabaseLockOptions(env:NodeJS.ProcessEnv=process.env):PoolConfig{
 const application=parse(env.DATABASE_URL),direct=env.DATABASE_DIRECT_URL?parse(env.DATABASE_DIRECT_URL):new URL(application.href);
 if(target(application)!==target(direct))throw failure('DATABASE_LOCK_TARGET_MISMATCH');
 if(env.NODE_ENV==='test'){
  if(!decodeURIComponent(application.pathname).endsWith('_test'))throw failure('DATABASE_LOCK_TEST_DATABASE_REQUIRED');
  if(env.TEST_DATABASE_URL&&target(parse(env.TEST_DATABASE_URL))!==target(application))throw failure('DATABASE_LOCK_TEST_TARGET_MISMATCH');
 }
 if(direct.hostname.endsWith('.neon.tech'))direct.hostname=direct.hostname.replace(/-pooler(?=\.)/,'');
 else if(/pooler/i.test(direct.hostname)||direct.port==='6432')throw failure('DATABASE_LOCK_DIRECT_CONNECTION_REQUIRED');
 const secure=direct.hostname.endsWith('.neon.tech')||env.DATABASE_SSL==='true'||Boolean(direct.searchParams.get('sslmode')&&direct.searchParams.get('sslmode')!=='disable');
 if(secure){direct.searchParams.set('sslmode','verify-full');direct.searchParams.delete('uselibpqcompat');}
 return {connectionString:direct.toString(),max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:10000,statement_timeout:30000,ssl:secure?{rejectUnauthorized:true}:undefined};
}
