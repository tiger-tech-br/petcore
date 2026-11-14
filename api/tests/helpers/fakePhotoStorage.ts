import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {Readable} from 'node:stream';
import {GetObjectCommand,PutObjectCommand,DeleteObjectCommand,HeadObjectCommand,ListObjectsV2Command,type S3Client} from '@aws-sdk/client-s3';
import {storageFingerprint,type PhotoStorage} from '../../src/photoBackup.ts';
export class FakeObjectStore {
 objects=new Map<string,Buffer>();metadata=new Map<string,Record<string,string>>();writes:string[]=[];deletes:string[]=[];failDelete:string|null=null;
 async send(command:any){
  const key=command.input.Key as string;
  if(command instanceof ListObjectsV2Command){const keys=[...this.objects.keys()].slice(0,1);return {KeyCount:keys.length,Contents:keys.map(Key=>({Key})),IsTruncated:false};}
  if(command instanceof GetObjectCommand){const value=this.objects.get(key);if(!value)throw Object.assign(new Error(),{name:'NoSuchKey',$metadata:{httpStatusCode:404}});return {Body:Readable.from([value]),ContentLength:value.length};}
  if(command instanceof HeadObjectCommand){const value=this.objects.get(key);if(!value)throw Object.assign(new Error(),{name:'NotFound',$metadata:{httpStatusCode:404}});return {Metadata:this.metadata.get(key)??{},ContentLength:value.length};}
  if(command instanceof PutObjectCommand){
   if(command.input.IfNoneMatch==='*'&&this.objects.has(key))throw Object.assign(new Error(),{name:'PreconditionFailed',$metadata:{httpStatusCode:412}});
   const parts:Buffer[]=[];const input=command.input.Body;
   if(Buffer.isBuffer(input))parts.push(input);else for await(const chunk of input as AsyncIterable<Uint8Array>)parts.push(Buffer.from(chunk));
   this.objects.set(key,Buffer.concat(parts));this.metadata.set(key,command.input.Metadata??{});this.writes.push(key);return {};
  }
  if(command instanceof DeleteObjectCommand){if(this.failDelete===key)throw Object.assign(new Error(),{code:'SIMULATED_STORAGE_FAILURE'});this.objects.delete(key);this.metadata.delete(key);this.deletes.push(key);return {};}
  throw Error('Unexpected object operation in isolated test');
 }
 storage(name:string):PhotoStorage{return {client:this as unknown as S3Client,bucket:name,fingerprint:storageFingerprint('https://storage.example.test',name)};}
}
export async function ownTemporary(run:(directory:string)=>Promise<void>){
 const root=resolve(tmpdir()),directory=await mkdtemp(join(root,'petcore-photo-test-'));
 try{await run(directory);}finally{if(dirname(resolve(directory))!==root||!basename(directory).startsWith('petcore-photo-test-'))throw Error('Unsafe test cleanup');await rm(directory,{recursive:true,force:true});}
}
