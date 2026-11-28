export type TrackingKind='taxi'|'delivery';
export type TrackingPosition={latitude:number;longitude:number;accuracy:number;captured_at:string;received_at:string};
export type TrackingStatus='waiting'|'live'|'stale'|'ended';
export type JobTracking={active:boolean;session_id?:string;expires_at?:string;status:TrackingStatus;position:TrackingPosition|null};
export type TransportJob={kind:TrackingKind;id:string;label:string;status:string;driver_id:string|null;driver_name:string|null;address:string;reference:string;destination:{address:string;latitude:number|null;longitude:number|null};tracking:JobTracking;can_start:boolean;next_status?:string;next_label?:string};
export type TrackingGrant={session_id:string;upload_token:string;upload_url:string;stop_url:string;expires_at:string};
export type TrackingShare={token:string;path:string;link:string;expires_at:string};
export type TransportDriver={id:string;name:string;phone:string;active:boolean;user_id:string|null};
export type TransportSettings={tracking_enabled:boolean;shop_address:string;shop_latitude:number|null;shop_longitude:number|null};
export type TransportOptions={drivers:TransportDriver[];users:{id:string;name:string;email:string}[];settings:TransportSettings};
export const trackingJobLabel=(kind:TrackingKind)=>kind==='taxi'?'Transporte do pet':'Entrega de produtos';
export function transportStatus(status:string){return ({scheduled:'Agendado',en_route:'A caminho da busca',with_pet:'Com o pet',completed:'Concluído',preparing:'Preparando',out_for_delivery:'Saiu para entrega',delivered:'Entregue',cancelled:'Cancelado'} as Record<string,string>)[status]??status;}
export function trackingQuality(position:TrackingPosition|null,now=Date.now()){
 if(!position)return 'waiting';
 const received=Date.parse(position.received_at),captured=Date.parse(position.captured_at);
 if(!Number.isFinite(received)||!Number.isFinite(captured)||received>now+30000||captured>now+30000||now-received>90000||now-captured>90000)return 'stale';
 return 'live';
}
export function trackingTime(value:string|undefined|null){return value&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(value)):'Ainda sem atualização';}
export function navigationLink(destination:{address:string;latitude:number|null;longitude:number|null}){
 const pin=typeof destination.latitude==='number'&&typeof destination.longitude==='number'&&Number.isFinite(destination.latitude)&&Number.isFinite(destination.longitude)&&Math.abs(destination.latitude)<=90&&Math.abs(destination.longitude)<=180
  ?`${destination.latitude},${destination.longitude}`:destination.address.trim();
 if(!pin)return null;
 const url=new URL('https://www.google.com/maps/dir/');url.searchParams.set('api','1');url.searchParams.set('destination',pin);url.searchParams.set('travelmode','driving');return url.href;
}
export function destinationLabel(destination:{address:string;latitude:number|null;longitude:number|null}){
 if(destination.address.trim())return destination.address;
 if(typeof destination.latitude==='number'&&typeof destination.longitude==='number'&&Number.isFinite(destination.latitude)&&Number.isFinite(destination.longitude)&&Math.abs(destination.latitude)<=90&&Math.abs(destination.longitude)<=180)return 'Destino informado por coordenadas';
 return 'Destino ainda não informado pela equipe.';
}
