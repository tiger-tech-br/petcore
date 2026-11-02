import test from 'node:test';
import assert from 'node:assert/strict';
import {localSlot} from '../src/scheduling.ts';

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
