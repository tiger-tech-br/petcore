// Runs only in the new data project's private volumes. Never prints credentials.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const root='/private',ca='/public-ca';
const names=['PG_ADMIN_PASSWORD','PG_OWNER_PASSWORD','PG_RUNTIME_PASSWORD','STORAGE_ROOT_ACCESS_KEY','STORAGE_ROOT_SECRET_KEY','STORAGE_APP_SECRET_KEY','STORAGE_BACKUP_SECRET_KEY'];
function fail(code){throw Object.assign(new Error(code),{code});}
function save(file,value,mode=0o600,uid=0,gid=0){fs.writeFileSync(file,value,{flag:'wx',mode});fs.chownSync(file,uid,gid);fs.chmodSync(file,mode);}
function openssl(args){try{cp.execFileSync('openssl',args,{stdio:['ignore','pipe','pipe'],timeout:120000});}catch{fail('BOOTSTRAP_CERTIFICATE_FAILED');}}
try{
 for(const name of names)if(!/^[A-Za-z0-9_-]{32,100}$/.test(process.env[name]||''))fail('BOOTSTRAP_CONFIGURATION_INVALID');
 const signature=crypto.createHash('sha256').update(JSON.stringify(names.map(name=>[name,process.env[name]]))).digest('hex');
 const marker=path.join(root,'BOOTSTRAP-COMPLETE.json');
 if(fs.existsSync(marker)){
  const old=JSON.parse(fs.readFileSync(marker,'utf8'));
  if(old.configurationFingerprint!==signature||!fs.existsSync(path.join(root,'postgres/server/server.key'))||!fs.existsSync(path.join(ca,'ca.crt')))fail('BOOTSTRAP_EXISTING_STATE_MISMATCH');
  console.log(JSON.stringify({ok:true,event:'petcore_private_bootstrap',existing:true}));
 }else{
  if(fs.readdirSync(root).length||fs.readdirSync(ca).length)fail('BOOTSTRAP_VOLUMES_NOT_EMPTY');
  fs.chmodSync(root,0o711);fs.chmodSync(ca,0o755);
  fs.mkdirSync(path.join(root,'postgres'),{mode:0o700});
  fs.mkdirSync(path.join(root,'postgres/server'),{mode:0o700});
  fs.mkdirSync(path.join(root,'app'),{mode:0o700});fs.chownSync(path.join(root,'app'),1000,1000);
  const pg=path.join(root,'postgres'),server=path.join(pg,'server');
  openssl(['req','-x509','-newkey','rsa:3072','-sha256','-days','3650','-nodes','-keyout',path.join(pg,'ca.key'),'-out',path.join(pg,'ca.crt'),'-subj','/CN=PetCore VPS Local CA']);
  openssl(['req','-new','-newkey','rsa:3072','-nodes','-keyout',path.join(server,'server.key'),'-out',path.join(pg,'server.csr'),'-subj','/CN=petcore-db']);
  save(path.join(pg,'extensions.conf'),'subjectAltName=DNS:petcore-db\nextendedKeyUsage=serverAuth\nkeyUsage=digitalSignature,keyEncipherment\n');
  openssl(['x509','-req','-in',path.join(pg,'server.csr'),'-CA',path.join(pg,'ca.crt'),'-CAkey',path.join(pg,'ca.key'),'-CAcreateserial','-out',path.join(server,'server.crt'),'-days','825','-sha256','-extfile',path.join(pg,'extensions.conf')]);
  fs.chmodSync(path.join(pg,'ca.key'),0o600);
  fs.chmodSync(pg,0o711);
  fs.chownSync(server,999,999);fs.chmodSync(server,0o700);
  for(const [file,mode]of [['server.key',0o600],['server.crt',0o644]]){fs.chownSync(path.join(server,file),999,999);fs.chmodSync(path.join(server,file),mode);}
  save(path.join(ca,'ca.crt'),fs.readFileSync(path.join(pg,'ca.crt')),0o444);
  save(path.join(root,'admin-password'),process.env.PG_ADMIN_PASSWORD);
  const privateState=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  save(path.join(root,'operator.json'),JSON.stringify(privateState));
  const url=new URL('postgresql://petcore_runtime@petcore-db:5432/petcore');url.password=process.env.PG_RUNTIME_PASSWORD;url.searchParams.set('sslmode','verify-full');url.searchParams.set('sslrootcert','/run/petcore-ca/ca.crt');
  save(path.join(root,'app/runtime.json'),JSON.stringify({DATABASE_URL:url.href,DATABASE_SSL:'true',NODE_EXTRA_CA_CERTS:'/run/petcore-ca/ca.crt'}),0o600,1000,1000);
  save(marker,JSON.stringify({format:'petcore.private-bootstrap.v1',createdAt:new Date().toISOString(),configurationFingerprint:signature}));
  console.log(JSON.stringify({ok:true,event:'petcore_private_bootstrap',existing:false,secretsPrinted:false}));
 }
}catch(error){console.error(JSON.stringify({ok:false,code:/^BOOTSTRAP_[A-Z_]+$/.test(error.code||'')?error.code:'BOOTSTRAP_FAILED',systemCode:/^E[A-Z]{2,30}$/.test(error.code||'')?error.code:null}));process.exitCode=1;}
