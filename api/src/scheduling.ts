export function localSlot(date:Date,duration:number,timezone:string){
 const end=new Date(date.getTime()+duration*60000);
 const fmt=(d:Date)=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
 const parse=(d:Date)=>{const parts=Object.fromEntries(fmt(d).map(p=>[p.type,p.value]));return {weekday:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday)+1, minute:Number(parts.hour)*60+Number(parts.minute)};};
 const s=parse(date),e=parse(end);
 if(s.weekday!==e.weekday||s.weekday<=0)throw Object.assign(new Error('Atendimento precisa começar e terminar no mesmo dia local.'),{status:422});
 return {weekday:s.weekday,start:s.minute,end:e.minute};
}
