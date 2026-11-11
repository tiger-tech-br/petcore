import {Truck} from 'lucide-react';
import {money,zonedToISO} from './api';
import {calendarWallTime} from './calendarTime';
import {taxiLegLabel,taxiServiceLabel,type TaxiBooking,type TaxiForm,type TaxiOptions,type TaxiService} from './taxiDog';

type Props={value:TaxiForm;onChange:(value:TaxiForm)=>void;options:TaxiOptions;timezone:string;minimumTime:string;appointmentStart:string;duration:number;disabled?:boolean;booking?:TaxiBooking|null};
export default function TaxiDogFields({value,onChange,options,timezone,minimumTime,appointmentStart,duration,disabled=false,booking}:Props){
 const locked=booking?.editable===false&&!booking.cancelled_at;
 const frozen=disabled||locked;
 const snapshot:TaxiService|undefined=booking&&!booking.cancelled_at?{id:booking.service_id,name:booking.service_name,price_cents:booking.price_cents,transport_mode:booking.mode}:undefined;
 const services:TaxiService[]=snapshot?[...options.services.filter(item=>item.id!==snapshot.id),snapshot]:options.services;
 const drivers=[...options.drivers];
 for(const trip of booking?.trips||[])if(!drivers.some(item=>item.id===trip.driver_id))drivers.push({id:trip.driver_id,name:trip.driver_name,active:false});
 const selected=services.find(item=>item.id===value.service_id);
 let appointmentEnd=appointmentStart;
 try{appointmentEnd=calendarWallTime(Date.parse(zonedToISO(appointmentStart,timezone))+duration*60000,timezone);}catch{}
 return <fieldset className="taxi-fields full-span">
  <legend><Truck size={20}/>Táxi Dog</legend>
  <label className="taxi-check"><input type="checkbox" checked={value.enabled} disabled={frozen} onChange={event=>onChange({...value,enabled:event.target.checked})}/><span>Precisa buscar ou levar o pet?</span></label>
  {locked&&<p className="taxi-note">O planejamento já possui etapas registradas ou uma comanda. Acompanhe as viagens restantes na página Táxi Dog.</p>}
  {value.enabled&&<>
   {!services.length&&<p className="taxi-note">Cadastre em Serviços um item do tipo Táxi Dog, com preço e modalidade de transporte.</p>}
   {!options.drivers.some(item=>item.active!==false)&&!locked&&<p className="taxi-note">Cadastre um motorista ativo na página Táxi Dog antes de reservar o transporte.</p>}
   <p className="taxi-note">Reserve tempo para o trajeto antes do atendimento. Se a busca sugerida já passou, escolha um atendimento mais tarde e ajuste a saída e a chegada.</p>
   <div className="taxi-fields-grid">
    <label>Serviço de transporte<select required value={value.service_id} disabled={frozen} onChange={event=>onChange({...value,service_id:event.target.value})}><option value="">Selecione o serviço</option>{services.map(item=><option key={item.id} value={item.id}>{taxiServiceLabel(item)}</option>)}</select></label>
    <label>Endereço de busca / entrega<textarea required minLength={8} maxLength={600} value={value.address} disabled={frozen} placeholder="Rua, número, bairro e cidade" onChange={event=>onChange({...value,address:event.target.value})}/></label>
    <label>Referência ou complemento<input maxLength={300} value={value.reference} disabled={frozen} placeholder="Apartamento, portaria ou ponto de referência" onChange={event=>onChange({...value,reference:event.target.value})}/></label>
    <label>Orientações para o transporte<textarea maxLength={1000} value={value.notes} disabled={frozen} onChange={event=>onChange({...value,notes:event.target.value})}/></label>
   </div>
   {selected&&<>
    {(['pickup','dropoff'] as const).filter(leg=>selected.transport_mode==='round_trip'||selected.transport_mode===leg).map(leg=><fieldset className="taxi-leg-fields" key={leg}><legend>{taxiLegLabel(leg)}</legend><div className="taxi-fields-grid">
     <label>Motorista — {leg==='pickup'?'busca':'entrega'}<select required value={value[leg].driver_id} disabled={frozen} onChange={event=>onChange({...value,[leg]:{...value[leg],driver_id:event.target.value}})}><option value="">Selecione o motorista</option>{drivers.filter(item=>item.active!==false||item.id===value[leg].driver_id).map(item=><option key={item.id} value={item.id}>{item.name}{item.active===false?' (inativo)':''}</option>)}</select></label>
     <label>Saída — {leg==='pickup'?'busca':'entrega'}<input required type="datetime-local" value={value[leg].starts_at} min={leg==='dropoff'&&appointmentEnd>minimumTime?appointmentEnd:minimumTime} max={leg==='pickup'?appointmentStart:undefined} disabled={frozen} onChange={event=>onChange({...value,[leg]:{...value[leg],starts_at:event.target.value}})}/></label>
     <label>Chegada prevista — {leg==='pickup'?'pet shop':'tutor'}<input required type="datetime-local" value={value[leg].ends_at} min={value[leg].starts_at||minimumTime} max={leg==='pickup'?appointmentStart:undefined} disabled={frozen} onChange={event=>onChange({...value,[leg]:{...value[leg],ends_at:event.target.value}})}/></label>
    </div><p className="taxi-note">{leg==='pickup'?'A chegada ao pet shop precisa ocorrer até o início do atendimento.':'A saída para entrega precisa ocorrer após o término previsto do atendimento.'}</p></fieldset>)}
    <p className="taxi-charge"><strong>Transporte: {money(booking&&!booking.cancelled_at&&booking.service_id===selected.id?booking.price_cents:selected.price_cents)}</strong><span>O valor acompanha o atendimento ao importar para a comanda. Os horários do motorista não ocupam a agenda do banhista ou tosador.</span></p>
   </>}
  </>}
 </fieldset>;
}
