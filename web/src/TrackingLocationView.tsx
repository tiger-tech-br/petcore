import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {Clock3,MapPin,Navigation} from 'lucide-react';
import {trackingQuality,trackingTime,type TrackingPosition,type TrackingStatus} from './trackingTypes';
import './styles/_tracking.scss';

type Props={position:TrackingPosition|null;status:TrackingStatus;label?:string};
export default function TrackingLocationView({position,status,label='Localização do motorista'}:Props){
 const surface=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),marker=useRef<L.Marker|null>(null),accuracy=useRef<L.Circle|null>(null),tiles=useRef<L.TileLayer|null>(null);
 const [now,setNow]=useState(Date.now),[mapError,setMapError]=useState(false);
 const valid=Boolean(position&&[position.latitude,position.longitude,position.accuracy].every(Number.isFinite)&&Math.abs(position.latitude)<=90&&Math.abs(position.longitude)<=180&&position.accuracy>=0);
 const stale=status==='stale'||Boolean(position&&trackingQuality(position,now)==='stale');
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{
  if(!surface.current||!valid||!position)return;
  const ownMap=L.map(surface.current,{zoomControl:true,scrollWheelZoom:false,attributionControl:true}).setView([position.latitude,position.longitude],position.accuracy>1000?12:15);
  setMapError(false);
  tiles.current=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{minZoom:2,maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'}).on('tileerror',()=>setMapError(true)).addTo(ownMap);
  ownMap.attributionControl.setPrefix(false);map.current=ownMap;
  const icon=L.divIcon({className:'tracking-map-marker',html:'<span aria-hidden="true"></span>',iconSize:[24,24],iconAnchor:[12,12]});
  marker.current=L.marker([position.latitude,position.longitude],{icon,keyboard:false}).addTo(ownMap);
  accuracy.current=L.circle([position.latitude,position.longitude],{radius:Math.min(position.accuracy,50000),color:'#009da7',fillOpacity:0.12,weight:1}).addTo(ownMap);
  const observer=new ResizeObserver(()=>ownMap.invalidateSize());observer.observe(surface.current);
  return()=>{observer.disconnect();ownMap.remove();if(map.current===ownMap){map.current=null;marker.current=null;accuracy.current=null;tiles.current=null;}};
 },[valid]);
 useEffect(()=>{
  if(!valid||!position||!map.current)return;
  const point:L.LatLngExpression=[position.latitude,position.longitude];marker.current?.setLatLng(point);accuracy.current?.setLatLng(point).setRadius(Math.min(position.accuracy,50000));
  map.current.panTo(point,{animate:false});
 },[position,valid]);
 return <section className={`tracking-location${stale?' is-stale':''}`} aria-label={label}>
  {valid&&position?<>
   <p className={`tracking-live-state ${stale?'is-stale':''}`} role="status"><span/>{stale?'Última posição recebida · sem atualização recente':'Localização atualizada durante a viagem'}</p>
   <div ref={surface} className="tracking-map" role="img" aria-label={`${label}. Use os dados de atualização abaixo para conferir a posição.`}/>
   {mapError&&<div className="tracking-warning" role="status"><p>Não foi possível carregar parte do mapa. A hora, a precisão e as coordenadas recebidas continuam disponíveis abaixo.</p><button className="ghost-btn" type="button" onClick={()=>{setMapError(false);tiles.current?.redraw();}}>Tentar carregar o mapa</button></div>}
   <dl className="tracking-position-details"><div><dt><Clock3 size={18}/>Última atualização</dt><dd>{trackingTime(position.received_at)}</dd></div><div><dt><Navigation size={18}/>Precisão estimada</dt><dd>{Math.round(position.accuracy)} metros</dd></div></dl>
   {stale&&<p className="tracking-warning">Esta posição pode ter mudado. Aguarde uma nova atualização; ela não indica onde o motorista está agora.</p>}
   <details className="tracking-coordinate-details"><summary>Ver coordenadas recebidas</summary><p>{position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}</p></details>
  </>:<div className="tracking-map-empty"><MapPin size={35}/><strong>{status==='ended'?'Compartilhamento encerrado':'Aguardando a localização'}</strong><p>{status==='ended'?'O ponto do motorista não está mais disponível.':'O motorista precisa iniciar o compartilhamento e ter sinal de localização e conexão.'}</p></div>}
 </section>;
}
