import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationLabel,navigationLink,trackingQuality,type TrackingPosition} from '../src/trackingTypes.ts';

const now=Date.parse('2026-11-27T15:00:00Z');
function position(captured=now,received=now):TrackingPosition{return{latitude:-23.65,longitude:-46.53,accuracy:10,captured_at:new Date(captured).toISOString(),received_at:new Date(received).toISOString()};}

test('a posição perde o estado atual depois de noventa segundos, mesmo com uma resposta HTTP recente',()=>{
 assert.equal(trackingQuality(position(),now),'live');
 assert.equal(trackingQuality(position(now-90001,now),now),'stale');
 assert.equal(trackingQuality(position(now,now-90001),now),'stale');
});
test('posição inexistente, horários inválidos ou futuros não são anunciados como localização atual',()=>{
 assert.equal(trackingQuality(null,now),'waiting');
 assert.equal(trackingQuality({...position(),captured_at:'invalid'},now),'stale');
 assert.equal(trackingQuality(position(now+60000,now),now),'stale');
 assert.equal(trackingQuality(position(now,now+60000),now),'stale');
});
test('a navegação usa somente Google Maps HTTPS e codifica um endereço como destino',()=>{
 const link=navigationLink({address:'Rua Exemplo, 10 & apto #2',latitude:null,longitude:null});
 assert.ok(link);const target=new URL(link);assert.equal(target.origin,'https://www.google.com');assert.equal(target.pathname,'/maps/dir/');assert.equal(target.searchParams.get('api'),'1');assert.equal(target.searchParams.get('destination'),'Rua Exemplo, 10 & apto #2');assert.equal(target.searchParams.get('travelmode'),'driving');assert.equal(target.hash,'');
});
test('coordenadas confirmadas são usadas quando válidas; uma origem desconhecida não é inventada',()=>{
 const pin=navigationLink({address:'Endereço',latitude:-23.65,longitude:-46.53});assert.ok(pin);assert.equal(new URL(pin).searchParams.get('destination'),'-23.65,-46.53');
 const fallback=navigationLink({address:'Destino confirmado',latitude:100,longitude:0});assert.ok(fallback);assert.equal(new URL(fallback).searchParams.get('destination'),'Destino confirmado');
 assert.equal(navigationLink({address:' ',latitude:null,longitude:null}),null);
 assert.equal(destinationLabel({address:'',latitude:-23.65,longitude:-46.53}),'Destino informado por coordenadas');
 assert.equal(destinationLabel({address:'',latitude:null,longitude:null}),'Destino ainda não informado pela equipe.');
});
