const fs=require('node:fs'),crypto=require('node:crypto');
const {S3Client,ListObjectsV2Command,GetObjectCommand,PutObjectCommand}=require('/app/node_modules/@aws-sdk/client-s3');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const canonical=item=>[item.key,item.size,item.sha256,Object.entries(item.metadata||{}).sort(),...['ContentType','ContentEncoding','ContentDisposition','CacheControl'].map(k=>item[k]||null)];
async function bytes(body,expected){const parts=[];let length=0;for await(const part of body){length+=part.length;if(length>expected||length>8*1024*1024)fail('STORAGE_COPY_SIZE_INVALID');parts.push(Buffer.from(part));}if(length!==expected)fail('STORAGE_COPY_SIZE_INVALID');return Buffer.concat(parts);}
async function main(){
 const state=JSON.parse(fs.readFileSync('/private/operator.json','utf8'));
 const source=new S3Client({endpoint:process.env.BACKUP_STORAGE_ENDPOINT,region:process.env.BACKUP_STORAGE_REGION||'auto',forcePathStyle:true,credentials:{accessKeyId:process.env.BACKUP_STORAGE_ACCESS_KEY,secretAccessKey:process.env.BACKUP_STORAGE_SECRET_KEY},maxAttempts:1});
 const target=new S3Client({endpoint:'http://petcore-object-storage:7070',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:state.STORAGE_ROOT_ACCESS_KEY,secretAccessKey:state.STORAGE_ROOT_SECRET_KEY},maxAttempts:1});
 const bucket=process.env.BACKUP_STORAGE_BUCKET,entries=[];let total=0,token;
 try{
  do{
   const page=await source.send(new ListObjectsV2Command({Bucket:bucket,MaxKeys:1000,...(token?{ContinuationToken:token}:{})}));
   for(const item of page.Contents||[]){
    if(!item.Key||item.Key.split('/').includes('..')||!Number.isSafeInteger(item.Size)||item.Size<0||item.Size>8*1024*1024||entries.length>=5000||total+item.Size>10*1024*1024)fail('STORAGE_COPY_SOURCE_LIMIT');
    const read=await source.send(new GetObjectCommand({Bucket:bucket,Key:item.Key,IfMatch:item.ETag}));
    if(read.ContentLength!==item.Size||read.ETag!==item.ETag)fail('STORAGE_COPY_SOURCE_CHANGED');
    const body=await bytes(read.Body,item.Size),sha256=hash(body),metadata=read.Metadata||{};
    const attributes=Object.fromEntries(['ContentType','ContentEncoding','ContentDisposition','CacheControl'].filter(k=>typeof read[k]==='string').map(k=>[k,read[k]]));
    try{await target.send(new PutObjectCommand({Bucket:'petcore-backups',Key:item.Key,Body:body,Metadata:metadata,...attributes,IfNoneMatch:'*'}));}catch(error){if(error?.$metadata?.httpStatusCode!==412)throw error;}
    const result=await target.send(new GetObjectCommand({Bucket:'petcore-backups',Key:item.Key}));
    const actual={key:item.Key,size:result.ContentLength,sha256:hash(await bytes(result.Body,item.Size)),metadata:result.Metadata||{},...Object.fromEntries(['ContentType','ContentEncoding','ContentDisposition','CacheControl'].filter(k=>typeof result[k]==='string').map(k=>[k,result[k]]))};
    const expected={key:item.Key,size:item.Size,etag:item.ETag,sha256,metadata,...attributes};
    if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(expected)))fail('STORAGE_COPY_READBACK_MISMATCH');
    entries.push(expected);total+=item.Size;
   }
   token=page.IsTruncated?page.NextContinuationToken:undefined;if(page.IsTruncated&&!token)fail('STORAGE_COPY_PAGINATION_INVALID');
  }while(token);
  entries.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  const after=[];token=undefined;
  do{const page=await source.send(new ListObjectsV2Command({Bucket:bucket,MaxKeys:1000,...(token?{ContinuationToken:token}:{})}));for(const item of page.Contents||[]){if(after.length>=5000)fail('STORAGE_COPY_SOURCE_LIMIT');after.push([item.Key,item.Size,item.ETag]);}token=page.IsTruncated?page.NextContinuationToken:undefined;if(page.IsTruncated&&!token)fail('STORAGE_COPY_PAGINATION_INVALID');}while(token);
  after.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  if(JSON.stringify(after)!==JSON.stringify(entries.map(e=>[e.key,e.size,e.etag])))fail('STORAGE_COPY_SOURCE_CHANGED');
  const fingerprint=hash(Buffer.from(JSON.stringify(entries.map(canonical))));
  if(fingerprint!==process.env.EXPECTED_ARCHIVE_FINGERPRINT)fail('STORAGE_COPY_ARCHIVE_MISMATCH');
  const record={ok:true,event:'legacy_storage_copy_verified',objects:entries.length,bytes:total,archiveFingerprint:fingerprint,metadataPreserved:true,readbackVerified:true,sourceModified:false};
  fs.writeFileSync('/private/LEGACY-STORAGE-COMPLETE.json',JSON.stringify(record),{mode:0o600});console.log(JSON.stringify(record));
 }finally{source.destroy();target.destroy();}
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:/^STORAGE_COPY_[A-Z_]+$/.test(error.code||'')?error.code:'STORAGE_COPY_FAILED',httpStatus:error?.$metadata?.httpStatusCode||null}));process.exitCode=1;});
