import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationConnectPro,navigationLaunchUrl,readProTrip,NavigationConnectError} from '../src/navigationConnectPro.js';
const id='12345678-1234-4123-8123-123456789abc', now=Date.parse('2026-11-23T18:00:00Z');
const name='projects/123456/trips/'+id;
const point={latitude:-23.5,longitude:-46.5};
const execution={location:{point,sourceTime:new Date(now-30000).toISOString()},remainingDuration:'600s',remainingDistanceMeters:2500};
function mock(response:unknown,status=200){
 const calls:{url:string;init?:RequestInit}[]=[];
 const fetcher:typeof fetch=async(input,init)=>{calls.push({url:String(input),init});return new Response(JSON.stringify(response),{status});};
 const client=createNavigationConnectPro({projectId:'123456',androidAppId:'br.dev.tigertech.petcore',accessToken:async()=> 'fixture-access',fetcher});
 return {calls,client};
}
test('creates trip with strictly Pro configuration',async()=>{
 const {calls,client}=mock({name,authToken:{token:'fixture-token',expireTime:new Date(now+60000).toISOString()}});
 const result=await client.createTrip(id,now);
 assert.deepEqual(result,{tripId:id,token:'fixture-token',expiresAt:now+60000});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://navigationconnect.googleapis.com/v1/projects/123456/trips?tripId='+id);
 assert.deepEqual(JSON.parse(String(calls[0].init?.body)),{androidAppId:'br.dev.tigertech.petcore',config:{}});
});
test('uses proper Google Maps and Waze token parameters; fallback has no token',()=>{
 const maps=new URL(navigationLaunchUrl('google_maps',point,'fixture+token='));
 const waze=new URL(navigationLaunchUrl('waze',point,'fixture+token='));
 assert.equal(maps.searchParams.get('action_token'),'fixture+token=');
 assert.equal(maps.searchParams.get('dir_action'),'navigate');
 assert.equal(waze.searchParams.get('external_trip_token'),'fixture+token=');
 assert.equal(waze.searchParams.get('navigate'),'yes');
 assert.equal(new URL(navigationLaunchUrl('google_maps',point)).searchParams.has('action_token'),false);
 assert.throws(()=>navigationLaunchUrl('waze',{latitude:100,longitude:0}),NavigationConnectError);
});
test('gets authorized provider trip and maps only fresh Pro fields',async()=>{
 const {calls,client}=mock({name,state:'ENROUTE',execution:{...execution,remainingRoute:{ignored:true}}});
 const trip=await client.getTrip(id,now);
 assert.equal(calls[0].init?.method,'GET');assert.equal(trip.visibility,'live');
 assert.deepEqual(trip.position,point);assert.equal(trip.remainingDistanceMeters,2500);
 assert.equal(trip.remainingDurationSeconds,600);assert.equal(trip.estimatedArrival,now+570000);
 assert.equal('remainingRoute' in trip,false);
});
test('stale, future, and ended positions never expose a location',()=>{
 const stale=readProTrip({state:'ENROUTE',execution:{...execution,location:{point,sourceTime:new Date(now-151000).toISOString()}}},now);
 assert.equal(stale.visibility,'stale');assert.equal(stale.position,null);
 const future=readProTrip({state:'ENROUTE',execution:{...execution,location:{point,sourceTime:new Date(now+6000).toISOString()}}},now);
 assert.equal(future.visibility,'unavailable');assert.equal(future.position,null);
 for(const state of ['NEW','FAILED','ARRIVED','CANCELED'])assert.equal(readProTrip({state,execution},now).position,null);
});
test('rejects mismatched trip or project and expired launch token',async()=>{
 for(const raw of [{name:name.replace('123456','999999')},{name:name.replace(id,'another-trip')}]){
  const {client}=mock(raw);await assert.rejects(client.getTrip(id,now),{code:'invalid_response'});
 }
 const {client}=mock({name,authToken:{token:'fixture',expireTime:new Date(now).toISOString()}});
 await assert.rejects(client.createTrip(id,now),{code:'invalid_response'});
});
test('provider error never propagates credentials or response body',async()=>{
 const {client,calls}=mock({secret:'fixture-secret'},403);
 await assert.rejects(client.getTrip(id,now),{message:'Navigation Connect: unavailable',status:403});
 assert.equal(calls.length,1);
});
