import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import multer from 'multer';
import {z} from 'zod';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {pool,auth,permit,tenant,ensure,tx,lockTutor,sha} from './core.js';
import {requireSubscriptionWrite} from './commercialService.js';
import {preparePetPhoto} from './petPhoto.js';
import type {RequestHandler} from 'express';
const router=Router();router.use('/pets',auth,permit('pets'),requireSubscriptionWrite);
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
function store(){
 const endpoint=process.env.OBJECT_STORAGE_ENDPOINT,bucket=process.env.OBJECT_STORAGE_BUCKET,key=process.env.OBJECT_STORAGE_ACCESS_KEY,secret=process.env.OBJECT_STORAGE_SECRET_KEY;
 ensure(endpoint&&bucket&&key&&secret,503,'Armazenamento em nuvem não configurado. Configure as variáveis OBJECT_STORAGE_* no servidor.');
 const client=new S3Client({region:process.env.OBJECT_STORAGE_REGION||'auto',endpoint,forcePathStyle:true,
  credentials:{accessKeyId:key,secretAccessKey:secret}});
 return {client,bucket};
}
let activeUploads=0;
const uploadSlot:RequestHandler=(req,res,next)=>{
 if(activeUploads>=2){res.status(429).json({error:'Estamos processando outras fotos. Aguarde alguns segundos.'});return;}
 activeUploads++;let released=false;const release=()=>{if(!released){released=true;activeUploads--;}};
 res.once('finish',release);res.once('close',release);next();
};
const uploadLimit:RequestHandler=async(req,_res,next)=>{
 try{const count=await pool.query(`INSERT INTO auth_rate_limits(key) VALUES($1) ON CONFLICT(key) DO UPDATE
  SET attempts=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempts+1 END,
  window_started=CASE WHEN auth_rate_limits.window_started<now()-interval '15 minutes' THEN now() ELSE auth_rate_limits.window_started END RETURNING attempts`,[sha('photo:'+req.access!.userId)]);
  ensure(count.rows[0].attempts<=30,429,'Muitas fotos enviadas. Aguarde alguns minutos.');next();}catch(error){next(error);}
};
router.post('/pets/:id/photo',uploadLimit,uploadSlot,upload.single('photo'),async(req,res)=>{
 const c=tenant(req),id=z.uuid().parse(req.params.id);
 ensure(req.file,422,'Escolha uma imagem JPEG, PNG ou WebP até 5 MB.');
 const photo=await preparePetPhoto(req.file.buffer);
 const target=(await pool.query('SELECT tutor_id FROM pets WHERE tenant_id=$1 AND id=$2',[c,id])).rows[0];ensure(target,404,'Pet não encontrado.');
 const {client,bucket}=store(),key=`tenants/${c}/pets/${id}/${randomUUID()}.${photo.extension}`;let stored=false;
 try{await tx(async db=>{
  await lockTutor(db,c,target.tutor_id);
  const prev=(await db.query('SELECT tutor_id,photo_key FROM pets WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[c,id])).rows[0];
  ensure(prev?.tutor_id===target.tutor_id,409,'O cadastro mudou. Atualize a tela antes de enviar a foto.');
  await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:photo.body,ContentType:photo.mime}),{abortSignal:AbortSignal.timeout(15000)});stored=true;
  await db.query('UPDATE pets SET photo_key=$3 WHERE tenant_id=$1 AND id=$2',[c,id,key]);
  if(prev.photo_key)await db.query('INSERT INTO object_deletion_jobs(tenant_id,request_id,object_key) VALUES($1,NULL,$2) ON CONFLICT(tenant_id,object_key) DO NOTHING',[c,prev.photo_key]);
 });}catch(error){
  if(stored)try{await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(10000)});}catch{await pool.query('INSERT INTO object_deletion_jobs(tenant_id,request_id,object_key) VALUES($1,NULL,$2) ON CONFLICT DO NOTHING',[c,key]).catch(()=>{});}
  throw error;
 }
 res.status(201).json({ok:true});
});
router.get('/pets/:id/photo-url',async(req,res)=>{
 const c=tenant(req),id=z.uuid().parse(req.params.id);
 const row=await pool.query('SELECT photo_key FROM pets WHERE tenant_id=$1 AND id=$2',[c,id]);ensure(row.rowCount,404,'Pet não encontrado.');ensure(row.rows[0].photo_key,404,'Pet sem foto.');
 ensure(row.rows[0].photo_key.startsWith(`tenants/${c}/pets/${id}/`),404,'Foto indisponível.');
 const {client,bucket}=store();const url=await getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:row.rows[0].photo_key}),{expiresIn:900});res.json({url,expiresInSeconds:900});
});
export default router;
