// Private, off-VPS copy using the same bounded/readback-verified archive format.
// Run from the project folder; credentials are read from the private local file.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {S3Client} from '@aws-sdk/client-s3';
import {archiveRailwayStorage} from './archive-railway-storage.mjs';

export async function archiveHostingerStorage(output){
 const state=JSON.parse(await readFile(new URL('../deploy/private/vps-data-secrets-20261120.json',import.meta.url),'utf8'));
 if(!state.STORAGE_ROOT_ACCESS_KEY||!state.STORAGE_ROOT_SECRET_KEY)throw Error('HOSTINGER_ARCHIVE_CONFIGURATION_MISSING');
 const clients=[];
 try{
  const stores=[['photos','petcore-fotos'],['backups','petcore-backups']].map(([alias,bucket])=>{
   const client=new S3Client({endpoint:'https://petcore.tigertech.dev.br',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:state.STORAGE_ROOT_ACCESS_KEY,secretAccessKey:state.STORAGE_ROOT_SECRET_KEY}});clients.push(client);return{alias,bucket,client};
  });
  return await archiveRailwayStorage({output,stores});
 }finally{clients.forEach(c=>c.destroy());}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  if(process.argv.length!==3)throw Error('HOSTINGER_ARCHIVE_PRIVATE_OUTPUT_REQUIRED');
  console.log(JSON.stringify(await archiveHostingerStorage(process.argv[2])));
 }catch(error){console.error(JSON.stringify({ok:false,code:/^[A-Z_]{2,80}$/.test(error.code||error.message||'')?error.code||error.message:'HOSTINGER_ARCHIVE_FAILED'}));process.exitCode=1;}
}
