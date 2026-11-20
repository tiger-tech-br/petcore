// Preserve the inspected HTTPS setup and route signed object requests unchanged.
const fs=require('node:fs'),crypto=require('node:crypto');
try{
 const original=fs.readFileSync('/previous/Caddyfile.original');
 const config=JSON.parse(fs.readFileSync('/previous/caddy.json','utf8'));
 const candidates=[];
 function walk(value){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value.match)&&value.match.some(m=>Array.isArray(m.host)&&m.host.includes('petcore.tigertech.dev.br')))candidates.push(value);
  for(const child of Object.values(value))if(Array.isArray(child))child.forEach(walk);else walk(child);
 }
 walk(config);
 if(candidates.length!==1||candidates[0].match.some(m=>m.host?.some(h=>h!=='petcore.tigertech.dev.br')))throw Error('PROXY_HOST_ROUTE_AMBIGUOUS');
 const route=candidates[0],subroute=route.handle?.find(h=>h.handler==='subroute');
 if(!subroute?.routes?.length||!JSON.stringify(subroute).includes('app:4000'))throw Error('PROXY_APP_ROUTE_MISSING');
 subroute.routes.unshift({match:[{path:['/petcore-fotos','/petcore-fotos/*','/petcore-backups','/petcore-backups/*']}],handle:[{handler:'reverse_proxy',upstreams:[{dial:'petcore-object-storage:7070'}]}],terminal:true});
 fs.writeFileSync('/candidate/caddy.json',JSON.stringify(config),{flag:'wx',mode:0o444});
 console.log(JSON.stringify({ok:true,event:'petcore_proxy_candidate_prepared',originalFileSha256:crypto.createHash('sha256').update(original).digest('hex'),preservesHost:true,preservesPath:true,existingTLSKept:true,hosts:['petcore.tigertech.dev.br']}));
}catch(error){console.error(JSON.stringify({ok:false,code:/^PROXY_[A-Z_]+$/.test(error.message||'')?error.message:'PROXY_PREPARATION_FAILED'}));process.exitCode=1;}
