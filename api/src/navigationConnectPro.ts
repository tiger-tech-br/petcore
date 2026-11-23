/**
 * Navigation Connect Pro transport adapter. Server only.
 * No direct device GPS, external calls at import, or automatic retries.
 * Callers must authorize the assigned driver/tenant, reserve usage and persist
 * trip identity before invoking this adapter. Never log tokens or payloads.
 */
export type NavigationApp = 'google_maps' | 'waze';
export type NavigationVehicle = 'car' | 'motorcycle';
export function navigationMode(vehicle:NavigationVehicle):'connect_pro'|'external_only'{
 if(vehicle==='car')return 'connect_pro';
 if(vehicle==='motorcycle')return 'external_only';
 throw new NavigationConnectError('invalid_input');
}
type AccessToken = () => Promise<string>;
type Options = {projectId:string; androidAppId:string; accessToken:AccessToken; fetcher?:typeof fetch};
const uuidV4=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const host='https://navigationconnect.googleapis.com';
export const PRO_UPDATE_INTERVAL_MS=60_000;
export const PRO_STALE_AFTER_MS=150_000;
const obj=(x:unknown):Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const finite=(x:unknown,min:number,max:number):number|null=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;
const timestamp=(x:unknown):number|null=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
export class NavigationConnectError extends Error {
 constructor(public readonly code:'disabled'|'invalid_input'|'unavailable'|'invalid_response',public readonly status?:number){
  super('Navigation Connect: '+code);this.name='NavigationConnectError';
 }
}
export function navigationLaunchUrl(app:NavigationApp,destination:{latitude:number;longitude:number},tripToken?:string,vehicle:NavigationVehicle='car'):string{
 const mode=navigationMode(vehicle);
 if(mode==='external_only'&&tripToken!==undefined)throw new NavigationConnectError('invalid_input');
 const lat=finite(destination.latitude,-90,90),lng=finite(destination.longitude,-180,180);
 if(lat===null||lng===null||!['google_maps','waze'].includes(app)||tripToken!==undefined&&(!tripToken||tripToken.length>4096||/[\x00-\x20]/.test(tripToken)))throw new NavigationConnectError('invalid_input');
 const point=lat+','+lng;
 const url=new URL(app==='google_maps'?'https://www.google.com/maps/dir/':'https://waze.com/ul');
 if(app==='google_maps'){url.searchParams.set('api','1');url.searchParams.set('destination',point);url.searchParams.set('travelmode',vehicle==='motorcycle'?'two-wheeler':'driving');url.searchParams.set('dir_action','navigate');if(tripToken)url.searchParams.set('action_token',tripToken);}
 else{url.searchParams.set('ll',point);url.searchParams.set('navigate','yes');url.searchParams.set('vehicle_type',vehicle==='motorcycle'?'motorcycle':'private');if(tripToken)url.searchParams.set('external_trip_token',tripToken);}
 return url.toString();
}
export function readProTrip(raw:unknown,now:number){
 const trip=obj(raw),execution=obj(trip.execution),location=obj(execution.location),point=obj(location.point);
 const state=typeof trip.state==='string'?trip.state:'UNKNOWN';
 const latitude=finite(point.latitude,-90,90),longitude=finite(point.longitude,-180,180),sourceTime=timestamp(location.sourceTime);
 const fresh=state==='ENROUTE'&&sourceTime!==null&&Number.isFinite(now)&&sourceTime<=now+5000&&now-sourceTime<PRO_STALE_AFTER_MS&&latitude!==null&&longitude!==null;
 const duration=typeof execution.remainingDuration==='string'&&/^\d+(\.\d{1,9})?s$/.test(execution.remainingDuration)?finite(Number(execution.remainingDuration.slice(0,-1)),0,86400*7):null;
 return {state,visibility:fresh?'live':state==='ENROUTE'&&sourceTime!==null&&sourceTime<=now?'stale':'unavailable',
  lastUpdate:sourceTime,position:fresh?{latitude:latitude!,longitude:longitude!}:null,
  remainingDistanceMeters:fresh?finite(execution.remainingDistanceMeters,0,10000000):null,
  remainingDurationSeconds:fresh?duration:null,
  estimatedArrival:fresh&&duration!==null?sourceTime!+duration*1000:null};
}
export function createNavigationConnectPro(options:Options){
 if(!/^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{6,20})$/.test(options.projectId)||!/^([a-zA-Z][a-zA-Z0-9_]*\.)+[a-zA-Z][a-zA-Z0-9_]*$/.test(options.androidAppId))throw new NavigationConnectError('invalid_input');
 const fetcher=options.fetcher??fetch;
 const base=host+'/v1/projects/'+options.projectId+'/trips';
 async function request(url:string,method:'GET'|'POST',body?:unknown):Promise<Record<string,unknown>>{
  try{
   const access=await options.accessToken();
   if(!access||/[\r\n]/.test(access))throw new NavigationConnectError('disabled');
   const response=await fetcher(url,{method,headers:{Authorization:'Bearer '+access,'Content-Type':'application/json','X-Goog-User-Project':options.projectId},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store'});
   if(!response.ok)throw new NavigationConnectError('unavailable',response.status);
   return obj(await response.json());
  }catch(error){if(error instanceof NavigationConnectError)throw error;throw new NavigationConnectError('unavailable');}
 }
 function validId(id:string){if(!uuidV4.test(id))throw new NavigationConnectError('invalid_input');}
 function checkName(raw:Record<string,unknown>,id:string){
  if(typeof raw.name!=='string'||!/^projects\/[0-9]+\/trips\/[a-f0-9-]+$/i.test(raw.name)||raw.name.split('/').at(-1)?.toLowerCase()!==id.toLowerCase())throw new NavigationConnectError('invalid_response');
  if(/^\d+$/.test(options.projectId)&&raw.name.split('/')[1]!==options.projectId)throw new NavigationConnectError('invalid_response');
 }
 return {
  async createTrip(tripId:string,now=Date.now(),vehicle:NavigationVehicle='car'){
   if(navigationMode(vehicle)!=='connect_pro')throw new NavigationConnectError('invalid_input');
   validId(tripId);
   // Default TripConfig only: no Enterprise flags and no paid Pub/Sub.
   const raw=await request(base+'?tripId='+encodeURIComponent(tripId),'POST',{androidAppId:options.androidAppId,config:{}});
   checkName(raw,tripId);
   const auth=obj(raw.authToken),expiresAt=timestamp(auth.expireTime);
   if(typeof auth.token!=='string'||!auth.token||auth.token.length>4096||/[\x00-\x20]/.test(auth.token)||expiresAt===null||expiresAt<=now)throw new NavigationConnectError('invalid_response');
   return {tripId,token:auth.token,expiresAt};
  },
  async getTrip(tripId:string,now=Date.now()){
   validId(tripId);
   const raw=await request(base+'/'+encodeURIComponent(tripId),'GET');
   checkName(raw,tripId);
   return readProTrip(raw,now);
  }
 };
}
