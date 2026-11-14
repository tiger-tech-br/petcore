import type {Request,Response,NextFunction} from 'express';
import {Pool,type PoolClient} from 'pg';
import {mkdtemp,chmod,lstat,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {z} from 'zod';
import {pool,ensure,sha} from './core.js';
import {confirmPassword} from './reauth.js';
import {directDatabaseLockOptions} from './databaseLocks.js';

const EXPORT_LOCK=719381013;
export const TENANT_EXPORT_DOWNLOAD_MAX_BYTES=128*1024*1024;
type ExportResult={archivePath:string;completeOperationalData:boolean;[key:string]:unknown};
type Exporter=(args:string[],dependencies:{signal:AbortSignal})=>Promise<ExportResult>;
const inputSchema=z.object({password:z.string().min(1).max(200),ticket_id:z.uuid(),identity_verified:z.literal(true)}).strict();

async function executeExport(args:string[],dependencies:{signal:AbortSignal}):Promise<ExportResult>{
 const moduleUrl=new URL('../scripts/export-tenant.mjs',import.meta.url).href;
 const module=await import(moduleUrl);return module.exportTenant(args,dependencies);
}
async function admissionPool(){
 // Session advisory locks require a direct connection, not PgBouncer transaction pooling.
 const database=new Pool({...directDatabaseLockOptions(),query_timeout:30000,application_name:'petcore-tenant-export-download'});
 database.on('error',()=>console.error(JSON.stringify({event:'tenant_export_admission_connection_lost'})));
 return database;
}
async function removeDownloadDirectory(directory:string){
 const parent=await realpath(tmpdir()),target=await realpath(directory),info=await lstat(directory);
 if(info.isSymbolicLink()||dirname(target)!==parent||!basename(target).startsWith('petcore-tenant-download-'))throw Error('TENANT_EXPORT_CLEANUP_PATH_INVALID');
 await rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
function failureMessage(cause:unknown){
 const code=(cause as {code?:string})?.code;
 if(code==='TENANT_EXPORT_REQUIRES_BATCH_REVIEW')return {status:413,message:'Este volume precisa de exportação assistida em lotes. Reduza o escopo com a operação da plataforma.'};
 if(code==='TENANT_EXPORT_REFERENCE_COMPANY_MISMATCH')return {status:404,message:'Solicitação não encontrada para este pet shop.'};
 if(code==='TENANT_EXPORT_PLATFORM_OPERATOR_REQUIRED'||code==='TENANT_EXPORT_OPERATOR_ACCESS_CHANGED')return {status:403,message:'O acesso de operação mudou. Entre novamente antes de exportar.'};
 if(['TENANT_EXPORT_SCHEMA_BUSY','TENANT_EXPORT_PHOTO_CLEANUP_BUSY'].includes(code??''))return {status:409,message:'Uma manutenção está em andamento. Tente preparar a exportação novamente em alguns minutos.'};
 return {status:503,message:'Não foi possível preparar a exportação completa. Tente novamente ou confira a operação antes de repetir.'};
}

export async function tenantExportRequests(req:Request,res:Response,next:NextFunction){
 try{
  ensure(req.access?.role==='platform',403,'Área exclusiva da plataforma.');const company=z.uuid().parse(req.params.id);
  ensure((await pool.query('SELECT 1 FROM tenants WHERE id=$1',[company])).rowCount,404,'Empresa não encontrada.');
  const result=await pool.query('SELECT id,subject,status,created_at FROM support_tickets WHERE tenant_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 100',[company]);
  res.set('Cache-Control','no-store').json({items:result.rows});
 }catch(error){next(error);}
}

// Factory injection is available only to trusted server/test code, never from a
// request or environment setting. The production route always uses executeExport.
export function createTenantExportHandler({exporter=executeExport}:{exporter?:Exporter}={}){
 return async(req:Request,res:Response,next:NextFunction)=>{
  const controller=new AbortController();let client:PoolClient|undefined,admission:Pool|undefined,directory:string|undefined,locked=false,clientLost=false;
  const abort=()=>controller.abort();const close=()=>{if(!res.writableFinished)abort();};
  const connectionLost=()=>{clientLost=true;abort();if(!res.writableFinished)res.destroy();};
  req.once('aborted',abort);res.once('close',close);
  const deadline=setTimeout(()=>{abort();res.destroy();},10*60*1000);deadline.unref();
  try{
   ensure(req.access,401,'Faça login novamente.');ensure(req.access.role==='platform',403,'Área exclusiva da plataforma.');
   const company=z.uuid().parse(req.params.id),input=inputSchema.parse(req.body),operator=req.access.userId;
   await confirmPassword(req,input.password);
   if(req.aborted||controller.signal.aborted)return;
   admission=await admissionPool();client=await admission.connect();client.on('error',connectionLost);
   locked=(await client.query('SELECT pg_try_advisory_lock($1) AS locked',[EXPORT_LOCK])).rows[0].locked;
   ensure(locked,429,'Outra exportação está sendo preparada. Aguarde a conclusão para iniciar outra.');
   ensure((await client.query('SELECT 1 FROM tenants WHERE id=$1',[company])).rowCount,404,'Empresa não encontrada.');
   ensure((await client.query('SELECT 1 FROM support_tickets WHERE tenant_id=$1 AND id=$2',[company,input.ticket_id])).rowCount,404,'Solicitação não encontrada para este pet shop.');
   const attempt=await client.query(`INSERT INTO auth_rate_limits(key) VALUES($1)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.window_started<now()-interval '1 hour' THEN 1 ELSE auth_rate_limits.attempts+1 END,
    window_started=CASE WHEN auth_rate_limits.window_started<now()-interval '1 hour' THEN now() ELSE auth_rate_limits.window_started END RETURNING attempts`,[sha('tenant-export:'+operator)]);
   ensure(attempt.rows[0].attempts<=3,429,'O limite de exportações deste período foi atingido. Aguarde uma hora antes de preparar outra.');
   directory=await mkdtemp(join(tmpdir(),'petcore-tenant-download-'));await chmod(directory,0o700);
   const archivePath=join(directory,'company.tar.gz');
   let result:ExportResult;
   try{result=await exporter(['--tenant',company,'--operator',operator,'--reference','support:'+input.ticket_id,'--identity-verified','YES','--confirm-export','YES','--output',archivePath],{signal:controller.signal});}
   catch(error){
    if(controller.signal.aborted)return;
    const failure=failureMessage(error);console.error(JSON.stringify({event:'tenant_export_failed',code:/^[A-Z0-9_]{2,80}$/.test((error as {code?:string})?.code??'')?(error as {code:string}).code:'TENANT_EXPORT_FAILED'}));
    ensure(false,failure.status,failure.message);
   }
   if(controller.signal.aborted||req.aborted)return;
   ensure(result!.completeOperationalData&&resolve(result!.archivePath)===resolve(archivePath),503,'A preparação não produziu uma exportação completa.');
   const file=await lstat(archivePath);ensure(file.isFile()&&!file.isSymbolicLink(),503,'Arquivo de exportação indisponível.');
   ensure(file.size>0&&file.size<=TENANT_EXPORT_DOWNLOAD_MAX_BYTES,413,'O arquivo é grande para download no painel. Solicite a preparação em lotes pela operação da plataforma.');
   res.set({'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Type':'application/gzip'});
   await new Promise<void>((resolveDownload,reject)=>{
    res.download(archivePath,`PetCore-empresa-${company}.tar.gz`,{headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Content-Type':'application/gzip'}},error=>error?reject(Object.assign(Error('Não foi possível concluir o envio do arquivo. Prepare a exportação novamente.'),{status:503})):resolveDownload());
   });
  }catch(error){if(!req.aborted&&!res.destroyed&&!controller.signal.aborted)next(error);}
  finally{
   clearTimeout(deadline);abort();req.removeListener('aborted',abort);res.removeListener('close',close);
   if(directory)await removeDownloadDirectory(directory).catch(()=>console.error(JSON.stringify({event:'tenant_export_cleanup_failed'})));
   if(locked)await client?.query('SELECT pg_advisory_unlock($1)',[EXPORT_LOCK]).catch(()=>{});
   client?.removeListener('error',connectionLost);client?.release(clientLost);await admission?.end();
  }
 };
}
