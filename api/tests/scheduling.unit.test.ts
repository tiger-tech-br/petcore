import test from 'node:test';
import assert from 'node:assert/strict';
import {assertFutureAppointmentStart,localSlot} from '../src/scheduling.ts';

test('novos horários precisam ser posteriores ao relógio do servidor',()=>{
 const now=Date.parse('2026-12-31T23:59:00Z');
 for(const value of ['2026-11-10T12:00:00Z','2026-12-31T23:58:59Z','2026-12-31T23:59:00Z']){
  assert.throws(()=>assertFutureAppointmentStart(new Date(value),now),(error:any)=>error.status===422&&/futuros/.test(error.message));
 }
 assert.doesNotThrow(()=>assertFutureAppointmentStart(new Date(now+1),now));
});

test('a regra de futuro compara instantes, inclusive na virada de mês e ano em outro fuso',()=>{
 const now=Date.parse('2026-12-31T23:59:00Z');
 assert.throws(()=>assertFutureAppointmentStart(new Date('2027-01-01T13:58:00+14:00'),now),/futuros/);
 assert.doesNotThrow(()=>assertFutureAppointmentStart(new Date('2027-01-01T14:00:00+14:00'),now));
 assert.throws(()=>assertFutureAppointmentStart(new Date('invalid'),now),/Data inválida/);
});

test('interpreta dia da semana e horário no fuso de São Paulo',()=>{
 const slot=localSlot(new Date('2026-11-02T13:00:00Z'),60,'America/Sao_Paulo');
 assert.deepEqual(slot,{weekday:1,start:600,end:660});
});
test('intervalos contíguos não se sobrepõem',()=>{
 const first=localSlot(new Date('2026-11-02T13:00:00Z'),60,'America/Sao_Paulo');
 const second=localSlot(new Date('2026-11-02T14:00:00Z'),60,'America/Sao_Paulo');
 assert.equal(first.end,second.start);
});
test('recusa serviço que atravessa meia-noite local',()=>{
 assert.throws(()=>localSlot(new Date('2026-11-03T02:30:00Z'),90,'America/Sao_Paulo'),/mesmo dia local/);
});
