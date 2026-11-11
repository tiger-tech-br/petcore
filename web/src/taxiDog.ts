import {money,zonedToISO} from './api';
import {calendarWallTime} from './calendarTime';

export type TaxiMode='pickup'|'dropoff'|'round_trip';
export type TaxiLeg='pickup'|'dropoff';
export type TaxiStatus='scheduled'|'en_route'|'with_pet'|'completed'|'cancelled';
export type TaxiDriver={id:string;name:string;phone?:string;active?:boolean};
export type TaxiService={id:string;name:string;price_cents:number;transport_mode:TaxiMode;service_type?:string;active?:boolean};
export type TaxiOptions={enabled:boolean;can_manage?:boolean;timezone?:string;server_now?:string;services:TaxiService[];drivers:TaxiDriver[]};
export type TaxiLegForm={driver_id:string;starts_at:string;ends_at:string};
export type TaxiForm={enabled:boolean;service_id:string;address:string;reference:string;notes:string;pickup:TaxiLegForm;dropoff:TaxiLegForm};
export type TaxiDraft={service_id:string;address:string;reference:string;notes:string;pickup?:TaxiLegForm;dropoff?:TaxiLegForm};
export type TaxiTrip={id:string;booking_id:string;appointment_id:string;leg:TaxiLeg;driver_id:string;driver_name:string;starts_at:string;ends_at:string;status:TaxiStatus;pet_name:string;tutor_name:string;tutor_phone:string;address:string;reference:string;notes:string;appointment_starts_at:string;appointment_ends_at:string;service_name:string;price_cents:number};
export type TaxiBooking={id:string;appointment_id:string;service_id:string;service_name:string;price_cents:number;mode:TaxiMode;address:string;reference:string;notes:string;cancelled_at:string|null;editable:boolean;trips:TaxiTrip[]};

export const taxiModeLabel=(mode:TaxiMode)=>({pickup:'Busca',dropoff:'Entrega',round_trip:'Busca e entrega'}[mode]);
export const taxiServiceLabel=(service:TaxiService)=>`${service.name} · ${taxiModeLabel(service.transport_mode)} · ${money(service.price_cents)}`;
export const taxiLegLabel=(leg:TaxiLeg)=>leg==='pickup'?'Busca do pet':'Entrega ao tutor';
export function taxiStatusLabel(status:TaxiStatus,leg:TaxiLeg){
 if(status==='scheduled')return leg==='pickup'?'Busca agendada':'Entrega agendada';
 if(status==='en_route')return 'A caminho da busca';
 if(status==='with_pet')return leg==='pickup'?'Pet recolhido':'A caminho da entrega';
 if(status==='completed')return leg==='pickup'?'No pet shop':'Entregue ao tutor';
 return 'Transporte cancelado';
}
export function nextTaxiAction(trip:Pick<TaxiTrip,'status'|'leg'>):{status:TaxiStatus;label:string}|null{
 if(trip.status==='scheduled')return trip.leg==='pickup'?{status:'en_route',label:'Sair para busca'}:{status:'with_pet',label:'Sair para entrega'};
 if(trip.status==='en_route'&&trip.leg==='pickup')return {status:'with_pet',label:'Registrar pet recolhido'};
 if(trip.status==='with_pet')return {status:'completed',label:trip.leg==='pickup'?'Confirmar chegada ao pet shop':'Confirmar entrega ao tutor'};
 return null;
}
export function emptyTaxiForm(start:string,timezone:string,duration=60):TaxiForm{
 let at=Date.now()+3600000;try{at=Date.parse(zonedToISO(start,timezone));}catch{}
 const wall=(offset:number)=>calendarWallTime(at+offset*60000,timezone);
 return {enabled:false,service_id:'',address:'',reference:'',notes:'',pickup:{driver_id:'',starts_at:wall(-30),ends_at:wall(0)},dropoff:{driver_id:'',starts_at:wall(duration),ends_at:wall(duration+30)}};
}
export function taxiFormFromBooking(booking:TaxiBooking|null,start:string,timezone:string,duration=60):TaxiForm{
 const form=emptyTaxiForm(start,timezone,duration);
 if(!booking||booking.cancelled_at)return form;
 const next={...form,enabled:true,service_id:booking.service_id,address:booking.address,reference:booking.reference,notes:booking.notes};
 for(const trip of booking.trips)next[trip.leg]={driver_id:trip.driver_id,starts_at:calendarWallTime(trip.starts_at,timezone),ends_at:calendarWallTime(trip.ends_at,timezone)};
 return next;
}
export function taxiDraftFromForm(form:TaxiForm,services:TaxiService[],timezone:string,booking?:TaxiBooking|null):TaxiDraft|null{
 if(!form.enabled)return null;
 const service=booking&&!booking.cancelled_at&&booking.service_id===form.service_id?{id:booking.service_id,transport_mode:booking.mode}:services.find(item=>item.id===form.service_id);
 if(!service)throw Error('Selecione um serviço de Táxi Dog.');
 const result:TaxiDraft={service_id:service.id,address:form.address.trim(),reference:form.reference.trim(),notes:form.notes.trim()};
 for(const leg of ['pickup','dropoff'] as const){
  if(service.transport_mode!=='round_trip'&&service.transport_mode!==leg)continue;
  const item=form[leg];
  if(!item.driver_id)throw Error(`Escolha o motorista para ${leg==='pickup'?'a busca':'a entrega'}.`);
  result[leg]={driver_id:item.driver_id,starts_at:zonedToISO(item.starts_at,timezone),ends_at:zonedToISO(item.ends_at,timezone)};
 }
 return result;
}
