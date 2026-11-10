import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarWallTime,defaultAppointmentTime,defaultWaitlistAppointmentTime,minimumAppointmentTime} from '../src/calendarTime.ts';

const zone='America/Sao_Paulo';
test('novo agendamento abandona a data antiga e mantém o dia futuro selecionado',()=>{
 const now=Date.parse('2026-11-10T11:07:10Z');
 assert.equal(defaultAppointmentTime('2025-01-01',zone,now),'2026-11-10T09:00');
 assert.equal(defaultAppointmentTime('2026-12-22',zone,now),'2026-12-22T09:00');
});

test('horário inicial após as 09:00 usa o próximo quarto de hora futuro',()=>{
 const now=Date.parse('2026-11-10T16:07:10Z');
 assert.equal(defaultAppointmentTime('2026-11-10',zone,now),'2026-11-10T13:15');
 assert.equal(minimumAppointmentTime(zone,now),'2026-11-10T13:08');
 assert.equal(defaultAppointmentTime('',zone,Date.parse('2026-11-10T16:15:00Z')),'2026-11-10T13:30');
});

test('virada de ano usa o novo dia da empresa sem depender do fuso do aparelho',()=>{
 const now=Date.parse('2027-01-01T02:59:30Z');
 assert.equal(calendarWallTime(now,zone),'2026-12-31T23:59');
 assert.equal(minimumAppointmentTime(zone,now),'2027-01-01T00:00');
 assert.equal(defaultAppointmentTime('2026-12-01',zone,now),'2027-01-01T09:00');
 assert.equal(defaultAppointmentTime('2026-12-01','Pacific/Kiritimati',now),'2027-01-01T17:00');
});

test('encaixe pela manhã mantém o próximo horário futuro dentro da janela do tutor',()=>{
 const now=Date.parse('2026-11-10T10:04:10Z');
 assert.equal(defaultWaitlistAppointmentTime('2026-11-10T07:00:00-03:00','2026-11-10T08:00:00-03:00',30,zone,now),'2026-11-10T07:15');
 // Se o próximo quarto de hora não couber, ainda oferece o primeiro minuto que cabe.
 assert.equal(defaultWaitlistAppointmentTime('2026-11-10T07:00:00-03:00','2026-11-10T07:20:00-03:00',10,zone,now),'2026-11-10T07:05');
});

test('encaixe respeita o início futuro e sinaliza janela encerrada ou curta demais',()=>{
 const now=Date.parse('2026-11-10T10:04:10Z');
 assert.equal(defaultWaitlistAppointmentTime('2026-11-11T08:03:00-03:00','2026-11-11T09:00:00-03:00',30,zone,now),'2026-11-11T08:03');
 assert.equal(defaultWaitlistAppointmentTime('2026-11-10T06:00:00-03:00','2026-11-10T07:00:00-03:00',30,zone,now),null);
 assert.equal(defaultWaitlistAppointmentTime('2026-11-10T07:00:00-03:00','2026-11-10T07:10:00-03:00',10,zone,now),null);
});
