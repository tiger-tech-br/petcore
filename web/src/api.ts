export type Obj=Record<string,unknown>;
export async function api<T=any>(url:string,method='GET',body?:unknown):Promise<T>{
 const r=await fetch('/api'+url,{method,credentials:'include',headers:{'Content-Type':'application/json','X-PetCore-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text();let data:any;
 try{data=text?JSON.parse(text):{};}catch{throw Error('Resposta inesperada do servidor.');}
 if(!r.ok)throw Error(data.error||`Falha (${r.status})`);
 return data as T;
}
export const money=(c:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
export const dateTime=(d:string)=>new Date(d).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
// Interpreta o horário digitado como horário da empresa, não do dispositivo do usuário.
export function zonedToISO(wall:string,zone='America/Sao_Paulo'){
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall);if(!match)throw Error('Horário inválido.');
 const [y,m,d,h,mi]=match.slice(1).map(Number);
 const wanted=Date.UTC(y,m-1,d,h,mi);
 const fmt=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts=(dt:Date)=>Object.fromEntries(fmt.formatToParts(dt).map(p=>[p.type,p.value]));
 let guess=wanted;
 for(let i=0;i<3;i++){const p=parts(new Date(guess));const local=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));guess+=wanted-local;}
 const p=parts(new Date(guess));
 if(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`!==wall)throw Error('Horário inexistente no fuso da empresa.');
 return new Date(guess).toISOString();
}
export const startIso=(date:string)=>zonedToISO(date+'T00:00');
export const endIso=(date:string,days=1)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return startIso(d.toISOString().slice(0,10));};
export type Session={user:{id:string;name:string;role:'platform'|'admin'|'employee';tenantId:string|null;companyName?:string;scopeProfessionalId:string|null;permissions:string[]};companies:{id:string;name:string;role:string}[];legal?:{required:boolean;version:string};subscription?:{writable:boolean;access_until:string|null;trial_ends_at:string|null;paid_through:string|null;status:string;onboarding_completed_at:string|null;trial_started_at:string|null;onboarding_plan:string|null;trial_days?:number}|null};
