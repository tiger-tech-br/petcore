import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pool, sendError } from './core.js';
import authRoutes from './authRoutes.js';
import dataRoutes from './dataRoutes.js';
import calendarRoutes from './calendarRoutes.js';
import fileRoutes from './fileRoutes.js';
import crmRoutes from './crmRoutes.js';
import taxiDogRoutes from './taxiDogRoutes.js';
import businessRoutes from './businessRoutes.js';
import privacyRoutes from './privacyRoutes.js';
import commercialRoutes,{publicCommercial} from './commercialRoutes.js';
import {createOriginGuard} from './originGuard.js';

export function validateRuntimeConfiguration(env:NodeJS.ProcessEnv=process.env){
 if(env.NODE_ENV!=='production')return;
 let origin:URL;
 try{origin=new URL(env.APP_ORIGIN?.trim()||'');}catch{throw new Error('Configure APP_ORIGIN com a origem HTTPS pública do PetCore antes de iniciar em produção.');}
 if(origin.protocol!=='https:'||origin.hostname.includes('*')||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash){
  throw new Error('APP_ORIGIN de produção deve ser uma origem HTTPS sem credenciais, caminhos ou curingas.');
 }
}

export function createApp(){
 const app=express();const prod=process.env.NODE_ENV==='production';
 if(prod)app.set('trust proxy',1);
 app.disable('x-powered-by');
 // A correlação é emitida pelo servidor, sem copiar identificadores arbitrários
 // recebidos em cabeçalhos controlados pelo cliente.
 app.use((req,res,next)=>{req.requestId=randomUUID();res.set('X-Request-Id',req.requestId);next();});
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use(helmet({contentSecurityPolicy:prod?undefined:false}));
 app.use(express.json({limit:'100kb'}));
 const PgStore=connectPgSimple(session);
 app.use(session({name:'petcore.sid',store:new PgStore({pool,createTableIfMissing:true}),
  secret:process.env.SESSION_SECRET!,resave:false,saveUninitialized:false,rolling:true,
  cookie:{httpOnly:true,sameSite:'lax',secure:prod,maxAge:8*60*60*1000,path:'/'}}));
 app.use('/api',createOriginGuard(process.env.APP_ORIGIN,process.env.APP_ALLOWED_ORIGINS));
 app.get('/api/health',async(_req,res)=>{await pool.query('SELECT 1');res.json({ok:true,database:true});});
 app.use('/api/auth',authRoutes);
 app.use('/api/public',publicCommercial);
 app.use('/api/commercial',commercialRoutes);
 app.use('/api/privacy',privacyRoutes);
 app.use('/api/business',businessRoutes);
 app.use('/api/crm',crmRoutes);
 app.use('/api/taxi-dog',taxiDogRoutes);
 app.use('/api',dataRoutes);
 app.use('/api',calendarRoutes);
 app.use('/api',fileRoutes);
 app.use('/api',(_req,res)=>res.status(404).json({error:'Rota não encontrada.'}));
 if(prod){
  const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../web/dist');
  app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
 }
 app.use(sendError);return app;
}
if(process.env.NODE_ENV!=='test'){
 validateRuntimeConfiguration();
 const port=Number(process.env.PORT||4000);
 const server=createApp().listen(port,()=>console.log(`PetCore API disponível na porta ${port}`));
 let closing=false;
 const shutdown=()=>{
  if(closing)return;closing=true;
  const deadline=setTimeout(()=>{server.closeAllConnections();process.exit(1);},20000);deadline.unref();
  server.close(error=>{
   if(error)process.exitCode=1;
   void pool.end().then(()=>clearTimeout(deadline)).catch(()=>{process.exitCode=1;clearTimeout(deadline);console.error('PetCore: falha ao encerrar conexões.');});
  });
  server.closeIdleConnections();
 };
 process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
