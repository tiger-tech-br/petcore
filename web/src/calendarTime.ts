export const schedulingTimezone='America/Sao_Paulo';

// Datas dos campos são sempre da empresa, independentemente do fuso do aparelho.
export function calendarWallTime(value:Date|string|number,timezone=schedulingTimezone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function minimumAppointmentTime(timezone=schedulingTimezone,now=Date.now()){
 return calendarWallTime(Math.floor(now/60000)*60000+60000,timezone);
}

export function defaultAppointmentTime(date:string,timezone=schedulingTimezone,now=Date.now()){
 const currentDay=calendarWallTime(now,timezone).slice(0,10);
 const targetDay=date&&date>=currentDay?date:currentDay;
 const morning=`${targetDay}T09:00`;
 if(morning>=minimumAppointmentTime(timezone,now))return morning;
 const nextQuarter=calendarWallTime(Math.floor(now/900000)*900000+900000,timezone);
 // Ao virar o dia, retoma o horário inicial usual no novo dia.
 return nextQuarter.slice(0,10)>currentDay?`${nextQuarter.slice(0,10)}T09:00`:nextQuarter;
}

export function defaultWaitlistAppointmentTime(earliest:string,latest:string,durationMinutes:number,timezone=schedulingTimezone,now=Date.now()){
 const earliestTime=Date.parse(earliest),latestTime=Date.parse(latest);
 if(!Number.isFinite(earliestTime)||!Number.isFinite(latestTime)||!Number.isFinite(durationMinutes)||durationMinutes<0)return null;
 const firstMinute=Math.max(Math.ceil(earliestTime/60000)*60000,Math.floor(now/60000)*60000+60000);
 const fits=(start:number)=>start<latestTime&&start+durationMinutes*60000<=latestTime;
 if(!fits(firstMinute))return null;
 const preferred=earliestTime>now?firstMinute:Math.max(firstMinute,Math.floor(now/900000)*900000+900000);
 return calendarWallTime(fits(preferred)?preferred:firstMinute,timezone);
}
