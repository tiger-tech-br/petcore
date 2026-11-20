const fs=require('node:fs'),crypto=require('node:crypto');
const {SignatureV4}=require('/app/node_modules/@smithy/signature-v4');
const {S3Client,CreateBucketCommand,PutBucketPolicyCommand,GetBucketPolicyCommand,GetBucketAclCommand,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,HeadBucketCommand}=require('/app/node_modules/@aws-sdk/client-s3');
class Sha256{constructor(key){this.value=key?crypto.createHmac('sha256',key):crypto.createHash('sha256');}update(bytes){this.value.update(bytes);}async digest(){return this.value.digest();}}
const fail=code=>{throw Object.assign(new Error(code),{code});};
const status=error=>error?.$metadata?.httpStatusCode;
async function main(){
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const root={accessKeyId:state.STORAGE_ROOT_ACCESS_KEY,secretAccessKey:state.STORAGE_ROOT_SECRET_KEY};
 const client=credentials=>new S3Client({endpoint:'http://127.0.0.1:7070',region:'us-east-1',forcePathStyle:true,credentials,maxAttempts:1});
 const admin=client(root),app=client({accessKeyId:'petcore-app',secretAccessKey:state.STORAGE_APP_SECRET_KEY}),backup=client({accessKeyId:'petcore-backup',secretAccessKey:state.STORAGE_BACKUP_SECRET_KEY});
 async function signedAdmin(path,body='',credentials=root){
  const headers={host:'127.0.0.1:7071','content-type':'application/xml','x-amz-content-sha256':crypto.createHash('sha256').update(body).digest('hex')};
  const signer=new SignatureV4({credentials,region:'us-east-1',service:'s3',sha256:Sha256});
  const request=await signer.sign({protocol:'http:',hostname:'127.0.0.1',port:7071,method:'PATCH',path,headers,body});
  return fetch('http://127.0.0.1:7071'+path,{method:'PATCH',headers:request.headers,body,signal:AbortSignal.timeout(10000)});
 }
 async function denied(operation){try{await operation();}catch(error){if(status(error)===403)return;throw error;}fail('STORAGE_PERMISSION_TOO_BROAD');}
 const keys=[],backupKeys=[],run=crypto.randomUUID();
 try{
  let available=false;for(let n=0;n<60;n++){try{await fetch('http://127.0.0.1:7071/',{signal:AbortSignal.timeout(1500)});available=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
  if(!available)fail('STORAGE_ADMIN_UNAVAILABLE');
  for(const [access,secret]of [['petcore-app',state.STORAGE_APP_SECRET_KEY],['petcore-backup',state.STORAGE_BACKUP_SECRET_KEY]]){
   const body='<Account><Access>'+access+'</Access><Secret>'+secret+'</Secret><Role>user</Role><UserID>1001</UserID><GroupID>1001</GroupID></Account>';
   const response=await signedAdmin('/create-user',body);
   if(response.status!==201){
    const text=await response.text();if(!text.includes('XAdminUserExists'))fail('STORAGE_USER_CREATION_FAILED');
    const users=await signedAdmin('/list-users');if(users.status!==200)fail('STORAGE_USER_VERIFICATION_FAILED');
    const accounts=(await users.text()).match(/<Account>[\s\S]*?<\/Account>/g)||[];
    if(!accounts.some(value=>value.includes('<Access>'+access+'</Access>')&&value.includes('<Secret>'+secret+'</Secret>')&&value.includes('<Role>user</Role>')))fail('STORAGE_EXISTING_USER_MISMATCH');
   }
  }
  for(const bucket of ['petcore-fotos','petcore-backups']){
   try{await admin.send(new CreateBucketCommand({Bucket:bucket}));}catch(error){if(!['BucketAlreadyOwnedByYou','BucketAlreadyExists'].includes(error.name))throw error;}
   if((await admin.send(new GetBucketAclCommand({Bucket:bucket}))).Owner?.ID!==root.accessKeyId)fail('STORAGE_BUCKET_OWNER_INVALID');
  }
  const photoPolicy={Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:['petcore-app','petcore-backup'],Action:['s3:ListBucket','s3:GetBucketLocation'],Resource:'arn:aws:s3:::petcore-fotos'},{Effect:'Allow',Principal:'petcore-app',Action:['s3:GetObject','s3:PutObject','s3:DeleteObject'],Resource:'arn:aws:s3:::petcore-fotos/*'},{Effect:'Allow',Principal:'petcore-backup',Action:'s3:GetObject',Resource:'arn:aws:s3:::petcore-fotos/*'}]};
  const backupPolicy={Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:'petcore-backup',Action:['s3:ListBucket','s3:GetBucketLocation'],Resource:'arn:aws:s3:::petcore-backups'},{Effect:'Allow',Principal:'petcore-backup',Action:['s3:GetObject','s3:PutObject','s3:DeleteObject'],Resource:'arn:aws:s3:::petcore-backups/petcore/*'}]};
  for(const [Bucket,policy]of [['petcore-fotos',photoPolicy],['petcore-backups',backupPolicy]])await admin.send(new PutBucketPolicyCommand({Bucket,Policy:JSON.stringify(policy)}));
  const key='migration-checks/'+run+'/probe.bin',bytes=Buffer.from('PetCore private storage '+run),metadata={'petcore-migration':run};keys.push(key);
  await app.send(new PutObjectCommand({Bucket:'petcore-fotos',Key:key,Body:bytes,ContentType:'application/octet-stream',Metadata:metadata,IfNoneMatch:'*'}));
  let conditional=false;try{await app.send(new PutObjectCommand({Bucket:'petcore-fotos',Key:key,Body:Buffer.from('overwrite'),IfNoneMatch:'*'}));}catch(error){if(status(error)===412)conditional=true;else throw error;}if(!conditional)fail('STORAGE_CONDITIONAL_WRITE_UNSUPPORTED');
  const read=await backup.send(new GetObjectCommand({Bucket:'petcore-fotos',Key:key}));if(!Buffer.from(await read.Body.transformToByteArray()).equals(bytes)||read.Metadata?.['petcore-migration']!==run)fail('STORAGE_READBACK_FAILED');
  const race='migration-checks/'+run+'/race.bin';keys.push(race);
  const raced=await Promise.allSettled([0,1].map(n=>app.send(new PutObjectCommand({Bucket:'petcore-fotos',Key:race,Body:Buffer.from(String(n)),Metadata:metadata,IfNoneMatch:'*'}))));
  if(raced.filter(r=>r.status==='fulfilled').length!==1||raced.filter(r=>r.status==='rejected'&&status(r.reason)===412).length!==1)fail('STORAGE_CONCURRENT_CREATE_UNSAFE');
  await denied(()=>backup.send(new PutObjectCommand({Bucket:'petcore-fotos',Key:key,Body:bytes})));
  await denied(()=>backup.send(new DeleteObjectCommand({Bucket:'petcore-fotos',Key:key})));
  await denied(()=>app.send(new HeadBucketCommand({Bucket:'petcore-backups'})));
  await denied(()=>app.send(new GetBucketPolicyCommand({Bucket:'petcore-fotos'})));
  const outside='legacy-railway/'+run;backupKeys.push(outside);await denied(()=>backup.send(new PutObjectCommand({Bucket:'petcore-backups',Key:outside,Body:bytes})));
  const backupKey='petcore/migration-checks/'+run;backupKeys.push(backupKey);await backup.send(new PutObjectCommand({Bucket:'petcore-backups',Key:backupKey,Body:bytes,Metadata:metadata,IfNoneMatch:'*'}));
  const anonymous=await fetch('http://127.0.0.1:7070/petcore-fotos/'+key,{signal:AbortSignal.timeout(5000)});if(anonymous.status!==403)fail('STORAGE_ANONYMOUS_READ_ALLOWED');
  const unauthorizedAdmin=await signedAdmin('/list-users','',{accessKeyId:'petcore-app',secretAccessKey:state.STORAGE_APP_SECRET_KEY});if(unauthorizedAdmin.status!==403)fail('STORAGE_ADMIN_NOT_RESTRICTED');
  const result={ok:true,event:'petcore_storage_verified',conditionalWrite:true,concurrentCreate:true,metadataPreserved:true,readbackVerified:true,accountsRestricted:true,anonymousDenied:true,adminRestricted:true};
  for(const key of keys)await app.send(new DeleteObjectCommand({Bucket:'petcore-fotos',Key:key}));keys.length=0;
  for(const key of backupKeys)await admin.send(new DeleteObjectCommand({Bucket:'petcore-backups',Key:key}));backupKeys.length=0;
  fs.writeFileSync('/private/STORAGE-COMPLETE.json',JSON.stringify(result),{mode:0o600});console.log(JSON.stringify({...result,probeCleanupComplete:true}));
 }finally{
  for(const key of keys)await admin.send(new DeleteObjectCommand({Bucket:'petcore-fotos',Key:key})).catch(()=>{});
  for(const key of backupKeys)await admin.send(new DeleteObjectCommand({Bucket:'petcore-backups',Key:key})).catch(()=>{});
  admin.destroy();app.destroy();backup.destroy();
 }
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^STORAGE_[A-Z_]+$/.test(error.code||'')?error.code:'STORAGE_INITIALIZATION_FAILED',httpStatus:status(error)||null}));process.exitCode=1;});
