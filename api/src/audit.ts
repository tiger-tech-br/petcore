import type {Db} from './core.js';

type AuditEvent={tenantId:string|null;userId:string|null;action:string;entityType?:string;entityId?:string|null;metadata?:Record<string,unknown>};

// Keep an operational trace without copying contact details, notes or secrets.
export async function recordAudit(db:Db,event:AuditEvent) {
 const metadata:Record<string,unknown>={};
 for(const [key,value] of Object.entries(event.metadata??{})) {
  if(/password|secret|token|email|phone|address|summary|notes|payload|body/i.test(key))continue;
  if(typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null)metadata[key]=value;
  else if(typeof value==='string')metadata[key]=value.slice(0,160);
  else if(Array.isArray(value)&&value.every(item=>typeof item==='string'))metadata[key]=value.slice(0,30).map(item=>item.slice(0,80));
 }
 await db.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
  VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[event.tenantId,event.userId,event.action.slice(0,100),event.entityType?.slice(0,80)??null,event.entityId??null,JSON.stringify(metadata)]);
}
