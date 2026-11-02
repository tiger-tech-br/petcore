// Banco exclusivo de testes; este arquivo nunca usa DATABASE_URL como alternativa.
import {after, before, describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import pg from 'pg';
import argon2 from 'argon2';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !decodeURIComponent(new URL(testUrl).pathname).endsWith('_test')) {
  throw new Error('CRM: configure TEST_DATABASE_URL com banco exclusivo terminado em _test e aplique as migrations nele.');
}
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'petcore-crm-integration-only-' + randomUUID() + randomUUID();
process.env.DATABASE_SSL ??= new URL(testUrl).searchParams.has('sslmode') ? 'true' : 'false';
const {createApp} = await import('../src/server.js');
const {pool: appPool} = await import('../src/core.js');
const db = new pg.Pool({connectionString: testUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? {rejectUnauthorized: true} : undefined});

type Reply = {code: number; data: any; headers: Headers};
const ids = {
  tenantA: randomUUID(), tenantB: randomUUID(),
  adminA: randomUUID(), adminB: randomUUID(), crmStaff: randomUUID(), noCrmStaff: randomUUID(),
  active: randomUUID(), inactive: randomUUID(), never: randomUUID(), future: randomUUID(), foreign: randomUUID(),
  activePet: randomUUID(), secondPet: randomUUID(), inactivePet: randomUUID(), neverPet: randomUUID(), futurePet: randomUUID(),
  professional: randomUUID(), service: randomUUID()
};
const userIds = [ids.adminA, ids.adminB, ids.crmStaff, ids.noCrmStaff];
const tenantIds = [ids.tenantA, ids.tenantB];
const tag = randomUUID().slice(0, 8);
// A fixture recebe HTTP exclusivamente pelo loopback. Um IP documental único
// separa o contador de login desta execução dos de outras suítes/execuções.
// A confiança no proxy e este cabeçalho só existem no app criado pelo teste.
const sourceIp = `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::1`;
const loginRateLimitKey = createHash('sha256').update('/login:' + sourceIp).digest('hex');
const password = 'CRM-test-password-' + randomUUID();
const emails = {adminA: `crm-owner-a-${tag}@example.test`, adminB: `crm-owner-b-${tag}@example.test`,
  crmStaff: `crm-staff-${tag}@example.test`, noCrmStaff: `crm-no-access-${tag}@example.test`};
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
let base = '', cookieA = '', cookieB = '', crmCookie = '', noCrmCookie = '';
const now = Date.now();
const when = (days: number, hours = 0) => new Date(now + days * 86400000 + hours * 3600000).toISOString();

async function call(path: string, method = 'GET', body?: unknown, cookie = cookieA): Promise<Reply> {
  const response = await fetch(base + '/api' + path, {method,
    headers: {'X-PetCore-Request': '1', 'Content-Type': 'application/json', 'X-Forwarded-For': sourceIp, Cookie: cookie},
    body: body === undefined ? undefined : JSON.stringify(body)});
  return {code: response.status, data: await response.json(), headers: response.headers};
}
async function login(email: string) {
  const response = await call('/auth/login', 'POST', {email, password}, '');
  assert.equal(response.code, 200, 'Login da conta fictícia deve funcionar.');
  const cookie = (response.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookie.startsWith('petcore.sid='));
  return cookie;
}
async function addAppointment(tutor: string, pet: string, status: string, start: string) {
  const appointmentId = randomUUID();
  await db.query(`INSERT INTO appointments(id,tenant_id,tutor_id,pet_id,professional_id,starts_at,ends_at,status,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$6::timestamptz+interval '1 hour',$7,$8)`,
    [appointmentId, ids.tenantA, tutor, pet, ids.professional, start, status, ids.adminA]);
  await db.query(`INSERT INTO appointment_services(tenant_id,appointment_id,service_id,position,price_cents,duration_minutes)
    VALUES($1,$2,$3,1,6500,60)`, [ids.tenantA, appointmentId, ids.service]);
}
async function createTask(tutor = ids.active, cookie = cookieA, due = when(2)) {
  const result = await call(`/crm/clients/${tutor}/tasks`, 'POST',
    {title: 'Combinar próximo banho', notes: 'Tutor pediu retorno por telefone.', due_at: due}, cookie);
  assert.equal(result.code, 201);
  return result.data;
}

describe('CRM: persistência, indicadores e isolamento por empresa', {concurrency: false}, () => {
  before(async () => {
    const hash = await argon2.hash(password, {type: argon2.argon2id});
    await db.query(`INSERT INTO tenants(id,name,timezone) VALUES($1,$2,'America/Manaus'),($3,$4,'America/Sao_Paulo')`,
      [ids.tenantA, `CRM A ${tag}`, ids.tenantB, `CRM B ${tag}`]);
    for (const key of ['adminA', 'adminB', 'crmStaff', 'noCrmStaff'] as const) {
      await db.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',
        [ids[key], `Usuário CRM ${key}`, emails[key], hash]);
    }
    await db.query(`INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES
      ($1,$2,'admin','{}'),($3,$4,'admin','{}'),($1,$5,'employee',ARRAY['crm']),($1,$6,'employee',ARRAY['tutors'])`,
      [ids.tenantA, ids.adminA, ids.tenantB, ids.adminB, ids.crmStaff, ids.noCrmStaff]);
    for (const [id, name, phone] of [
      [ids.active, `Ana ativa ${tag}`, '11911110001'], [ids.inactive, `Bruna ausente ${tag}`, '11911110002'],
      [ids.never, `Carlos sem visita ${tag}`, '11911110003'], [ids.future, `Dora futura ${tag}`, '11911110004']
    ]) {
      await db.query('INSERT INTO tutors(id,tenant_id,name,phone,email,notes) VALUES($1,$2,$3,$4,$5,$6)',
        [id, ids.tenantA, name, phone, `${id}@example.test`, 'Observação pré-existente do cadastro.']);
    }
    await db.query('INSERT INTO tutors(id,tenant_id,name,email) VALUES($1,$2,$3,$4)',
      [ids.foreign, ids.tenantB, `SEGREDO CRM B ${tag}`, `foreign-${tag}@example.test`]);
    for (const [id, tutor, name] of [[ids.activePet, ids.active, 'Luna'], [ids.secondPet, ids.active, 'Bob'],
      [ids.inactivePet, ids.inactive, 'Mel'], [ids.neverPet, ids.never, 'Thor'], [ids.futurePet, ids.future, 'Nina']]) {
      await db.query(`INSERT INTO pets(id,tenant_id,tutor_id,name,species,size) VALUES($1,$2,$3,$4,'Cão','medio')`,
        [id, ids.tenantA, tutor, name]);
    }
    await db.query('INSERT INTO professionals(id,tenant_id,name) VALUES($1,$2,$3)', [ids.professional, ids.tenantA, 'Profissional CRM']);
    await db.query(`INSERT INTO services(id,tenant_id,name,price_cents,duration_minutes) VALUES($1,$2,'Banho CRM',6500,60)`,
      [ids.service, ids.tenantA]);
    await addAppointment(ids.active, ids.activePet, 'done', when(-10));
    await addAppointment(ids.active, ids.secondPet, 'done', when(-5));
    await addAppointment(ids.active, ids.activePet, 'confirmed', when(3));
    await addAppointment(ids.inactive, ids.inactivePet, 'done', when(-80));
    await addAppointment(ids.never, ids.neverPet, 'cancelled', when(-2));
    await addAppointment(ids.never, ids.neverPet, 'pending', when(-1));
    await addAppointment(ids.never, ids.neverPet, 'done', when(10));
    await addAppointment(ids.future, ids.futurePet, 'pending', when(4));
    const app = createApp();
    app.set('trust proxy', 'loopback');
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    base = `http://127.0.0.1:${address.port}`;
    cookieA = await login(emails.adminA);
    cookieB = await login(emails.adminB);
    for(const sessionCookie of [cookieA,cookieB]) {
      const response=await fetch(base+'/api/commercial/onboarding',{method:'POST',headers:{'Content-Type':'application/json','X-PetCore-Request':'1',Cookie:sessionCookie},body:JSON.stringify({plan:'free'})});assert.equal(response.status,200);
    }
    crmCookie = await login(emails.crmStaff);
    noCrmCookie = await login(emails.noCrmStaff);
  });

  after(async () => {
    if (server) {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    }
    try {
      // Somente UUIDs desta execução; nunca apaga tabelas ou registros de outros testes.
      await db.query('DELETE FROM crm_contacts WHERE tenant_id=ANY($1::uuid[])', [tenantIds]);
      await db.query('DELETE FROM crm_tasks WHERE tenant_id=ANY($1::uuid[])', [tenantIds]);
      await db.query('DELETE FROM appointment_services WHERE tenant_id=ANY($1::uuid[])', [tenantIds]);
      await db.query('DELETE FROM appointments WHERE tenant_id=ANY($1::uuid[])', [tenantIds]);
      await db.query('DELETE FROM pets WHERE tenant_id=ANY($1::uuid[])', [tenantIds]);
      await db.query('DELETE FROM tutors WHERE tenant_id=ANY($1::uuid[])', [tenantIds]);
      await db.query('DELETE FROM services WHERE tenant_id=ANY($1::uuid[])', [tenantIds]);
      await db.query('DELETE FROM professionals WHERE tenant_id=ANY($1::uuid[])', [tenantIds]);
      await db.query('DELETE FROM memberships WHERE tenant_id=ANY($1::uuid[])', [tenantIds]);
      await db.query('DELETE FROM "session" WHERE sess->>\'userId\'=ANY($1::text[])', [userIds]);
      await db.query('DELETE FROM auth_rate_limits WHERE key=$1', [loginRateLimitKey]);
      await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
      await db.query('DELETE FROM tenants WHERE id=ANY($1::uuid[])', [tenantIds]);
    } finally {
      await Promise.all([db.end(), appPool.end()]);
    }
  });

  test('indicadores usam somente visitas concluídas no passado e preservam o fuso da empresa', async () => {
    const result = await call('/crm/clients');
    assert.equal(result.code, 200);
    assert.equal(result.data.timezone, 'America/Manaus');
    assert.equal(result.data.total, 4);
    assert.deepEqual(result.data.summary, {clients: 4, withoutVisits: 2, inactive: 1, pendingTasks: 0, overdueTasks: 0});
    const active = result.data.items.find((item: any) => item.id === ids.active);
    assert.equal(active.pet_count, 2);
    assert.equal(active.completed_visits, 2);
    assert.equal(new Date(active.last_visit_at).toISOString(), when(-5));
    assert.equal(new Date(active.next_appointment_at).toISOString(), when(3));
    const never = result.data.items.find((item: any) => item.id === ids.never);
    assert.equal(never.completed_visits, 0);
    assert.equal(never.last_visit_at, null);
    assert.equal(never.next_appointment_at, null);
  });

  test('segmentos, busca e paginação não mudam os indicadores globais da empresa', async () => {
    const inactive = await call('/crm/clients?segment=inactive&inactive_days=60');
    assert.equal(inactive.code, 200);
    assert.deepEqual(inactive.data.items.map((item: any) => item.id), [ids.inactive]);
    const longer = await call('/crm/clients?segment=inactive&inactive_days=90');
    assert.equal(longer.code, 200);
    assert.equal(longer.data.total, 0);
    const never = await call('/crm/clients?segment=without_visits');
    assert.deepEqual(never.data.items.map((item: any) => item.id).sort(), [ids.never, ids.future].sort());
    const phone = await call('/crm/clients?q=11911110002');
    assert.equal(phone.code, 200);
    assert.deepEqual(phone.data.items.map((item: any) => item.id), [ids.inactive]);
    assert.equal(phone.data.summary.clients, 4);
    const first = await call('/crm/clients?page=1&page_size=2');
    const second = await call('/crm/clients?page=2&page_size=2');
    assert.equal(first.data.total, 4);
    assert.equal(first.data.pageSize, 2);
    assert.equal(second.data.page, 2);
    assert.equal(new Set([...first.data.items, ...second.data.items].map((item: any) => item.id)).size, 4);
    const emptyPage = await call('/crm/clients?page=3&page_size=2');
    assert.equal(emptyPage.data.total, 4);
    assert.deepEqual(emptyPage.data.items, []);
    assert.equal((await call('/crm/clients?q=' + encodeURIComponent("' OR 1=1 --"))).data.total, 0);
  });

  test('ficha consolida pets e atendimentos da mesma empresa', async () => {
    const detail = await call(`/crm/clients/${ids.active}`);
    assert.equal(detail.code, 200);
    assert.equal(detail.data.client.id, ids.active);
    assert.equal(detail.data.client.notes, 'Observação pré-existente do cadastro.');
    assert.deepEqual(detail.data.pets.map((pet: any) => pet.name).sort(), ['Bob', 'Luna']);
    assert.equal(detail.data.appointments.length, 3);
    assert.ok(detail.data.appointments.every((item: any) => item.service_names.includes('Banho CRM')));
    assert.deepEqual(detail.data.contacts, []);
    assert.deepEqual(detail.data.tasks, []);
    assert.equal(detail.data.timezone, 'America/Manaus');
  });

  test('cada empresa só lê sua própria carteira, ficha e tarefas', async () => {
    const list = await call('/crm/clients', 'GET', undefined, cookieB);
    assert.equal(list.code, 200);
    assert.equal(list.data.total, 1);
    assert.deepEqual(list.data.items.map((item: any) => item.id), [ids.foreign]);
    assert.equal((await call(`/crm/clients/${ids.active}`, 'GET', undefined, cookieB)).code, 404);
    assert.equal((await call(`/crm/clients/${ids.foreign}`)).code, 404);
    assert.equal((await call(`/crm/clients?q=${tag}`, 'GET', undefined, cookieB)).data.total, 1);
  });

  test('CRM exige sessão e permissão própria; acesso a clientes sozinho não concede CRM', async () => {
    assert.equal((await call('/crm/clients', 'GET', undefined, '')).code, 401);
    assert.equal((await call('/crm/tasks', 'GET', undefined, '')).code, 401);
    assert.equal((await call('/crm/clients', 'GET', undefined, noCrmCookie)).code, 403);
    assert.equal((await call(`/crm/clients/${ids.active}`, 'GET', undefined, noCrmCookie)).code, 403);
    assert.equal((await call(`/crm/clients/${ids.active}/contacts`, 'POST',
      {channel: 'phone', summary: 'Sem permissão', occurred_at: when(-1)}, noCrmCookie)).code, 403);
    assert.equal((await call('/crm/clients', 'GET', undefined, crmCookie)).code, 200);
    assert.equal((await call('/data/tutors', 'GET', undefined, crmCookie)).code, 403);
  });

  test('contato é persistido com autor da sessão e aparece em outra sessão autorizada', async () => {
    const occurred = when(-1, 2);
    const result = await call(`/crm/clients/${ids.active}/contacts`, 'POST',
      {channel: 'phone', summary: 'Tutor confirmou que deseja combinar a próxima visita.', occurred_at: occurred}, crmCookie);
    assert.equal(result.code, 201);
    assert.equal(result.data.channel, 'phone');
    assert.equal(result.data.created_by_name, 'Usuário CRM crmStaff');
    const detail = await call(`/crm/clients/${ids.active}`);
    const contact = detail.data.contacts.find((item: any) => item.id === result.data.id);
    assert.equal(contact.summary, 'Tutor confirmou que deseja combinar a próxima visita.');
    assert.equal(new Date(contact.occurred_at).toISOString(), occurred);
    assert.equal(new Date(detail.data.client.last_contact_at).toISOString(), occurred);
  });

  test('tarefa registra horário com offset e passa por concluir, reabrir e cancelar', async () => {
    const wallWithOffset = '2032-02-20T09:30:00-04:00';
    const task = await createTask(ids.active, crmCookie, wallWithOffset);
    assert.equal(task.status, 'open');
    assert.equal(task.created_by_name, 'Usuário CRM crmStaff');
    assert.equal(new Date(task.due_at).toISOString(), '2032-02-20T13:30:00.000Z');
    assert.equal(task.completed_at, null);
    const done = await call(`/crm/tasks/${task.id}`, 'PATCH', {status: 'done'});
    assert.equal(done.code, 200);
    assert.equal(done.data.status, 'done');
    assert.ok(Number.isFinite(new Date(done.data.completed_at).getTime()));
    const doneAgain = await call(`/crm/tasks/${task.id}`, 'PATCH', {status: 'done'});
    assert.equal(doneAgain.data.completed_at, done.data.completed_at);
    const reopened = await call(`/crm/tasks/${task.id}`, 'PATCH', {status: 'open'});
    assert.equal(reopened.code, 200);
    assert.equal(reopened.data.status, 'open');
    assert.equal(reopened.data.completed_at, null);
    const cancelled = await call(`/crm/tasks/${task.id}`, 'PATCH', {status: 'cancelled'});
    assert.equal(cancelled.code, 200);
    assert.equal(cancelled.data.status, 'cancelled');
    assert.equal(cancelled.data.completed_at, null);
    const cancelledList = await call('/crm/tasks?filter=cancelled');
    assert.ok(cancelledList.data.items.some((item: any) => item.id === task.id));
    const pendingList = await call('/crm/tasks?filter=open');
    assert.ok(pendingList.data.items.every((item: any) => item.id !== task.id));
  });

  test('tarefas atrasadas, resumo e próximo retorno refletem somente pendências', async () => {
    const late = await createTask(ids.inactive, cookieA, when(-2));
    const upcoming = await createTask(ids.inactive, cookieA, when(2));
    const overdue = await call('/crm/tasks?filter=overdue');
    assert.equal(overdue.code, 200);
    assert.deepEqual(overdue.data.items.map((item: any) => item.id), [late.id]);
    const list = await call('/crm/clients');
    assert.equal(list.data.summary.pendingTasks, 2);
    assert.equal(list.data.summary.overdueTasks, 1);
    const client = list.data.items.find((item: any) => item.id === ids.inactive);
    assert.equal(client.pending_tasks, 2);
    assert.equal(new Date(client.next_task_due_at).toISOString(), when(-2));
    const firstPage = await call('/crm/tasks?filter=open&page_size=1&page=1');
    const secondPage = await call('/crm/tasks?filter=open&page_size=1&page=2');
    assert.equal(firstPage.data.total, 2);
    assert.equal(secondPage.data.pageSize, 1);
    assert.deepEqual([firstPage.data.items[0].id, secondPage.data.items[0].id], [late.id, upcoming.id]);
    await call(`/crm/tasks/${late.id}`, 'PATCH', {status: 'done'});
    const refreshed = await call(`/crm/clients/${ids.inactive}`);
    assert.equal(refreshed.data.client.pending_tasks, 1);
    assert.equal(new Date(refreshed.data.client.next_task_due_at).toISOString(), when(2));
    const done = await call('/crm/tasks?filter=done');
    assert.ok(done.data.items.some((item: any) => item.id === late.id));
    assert.equal((await call('/crm/tasks?filter=overdue')).data.total, 0);
    await call(`/crm/tasks/${upcoming.id}`, 'PATCH', {status: 'cancelled'});
  });

  test('IDs de outra empresa não permitem criar contatos, tarefas ou mudar status', async () => {
    const contact = {channel: 'whatsapp', summary: 'Não pode atravessar empresas', occurred_at: when(-1)};
    const taskBody = {title: 'Acesso indevido', notes: '', due_at: when(1)};
    assert.equal((await call(`/crm/clients/${ids.foreign}/contacts`, 'POST', contact)).code, 404);
    assert.equal((await call(`/crm/clients/${ids.foreign}/tasks`, 'POST', taskBody)).code, 404);
    const foreignTask = await createTask(ids.foreign, cookieB);
    assert.equal((await call(`/crm/tasks/${foreignTask.id}`, 'PATCH', {status: 'done'})).code, 404);
    const foreignList = await call('/crm/tasks', 'GET', undefined, cookieB);
    assert.ok(foreignList.data.items.some((item: any) => item.id === foreignTask.id && item.status === 'open'));
    assert.ok((await call('/crm/tasks?filter=all')).data.items.every((item: any) => item.id !== foreignTask.id));
  });

  test('servidor rejeita autor, empresa e estado forjados e entradas fora dos limites', async () => {
    const contact = {channel: 'email', summary: 'Contato válido', occurred_at: when(-1)};
    for (const extra of [{tenant_id: ids.tenantB}, {created_by: ids.adminB}, {tutor_id: ids.foreign}]) {
      assert.equal((await call(`/crm/clients/${ids.active}/contacts`, 'POST', {...contact, ...extra})).code, 422);
    }
    const task = {title: 'Retorno válido', notes: '', due_at: when(1)};
    assert.equal((await call(`/crm/clients/${ids.active}/tasks`, 'POST', {...task, tenant_id: ids.tenantB})).code, 422);
    assert.equal((await call(`/crm/clients/${ids.active}/tasks`, 'POST', {...task, status: 'done'})).code, 422);
    assert.equal((await call(`/crm/clients/${ids.active}/contacts`, 'POST', {...contact, channel: 'sms'})).code, 422);
    assert.equal((await call(`/crm/clients/${ids.active}/contacts`, 'POST', {...contact, summary: ' '})).code, 422);
    assert.equal((await call(`/crm/clients/${ids.active}/contacts`, 'POST', {...contact, summary: 'x'.repeat(3001)})).code, 422);
    assert.equal((await call(`/crm/clients/${ids.active}/tasks`, 'POST', {...task, title: 'x'.repeat(161)})).code, 422);
    assert.equal((await call(`/crm/clients/${ids.active}/tasks`, 'POST', {...task, due_at: '2026-11-01T12:00'})).code, 422);
    assert.equal((await call(`/crm/tasks/${randomUUID()}`, 'PATCH', {status: 'invalid'})).code, 422);
    for (const query of ['page=0', 'page_size=9999', 'inactive_days=45', 'segment=wrong']) {
      assert.equal((await call('/crm/clients?' + query)).code, 422);
    }
  });

  test('FKs do banco impedem vincular tutor ou autor de outra empresa, mesmo fora da API', async () => {
    const foreignKeyError = (error: unknown) => (error as {code?: string}).code === '23503';
    await assert.rejects(db.query(`INSERT INTO crm_contacts(tenant_id,tutor_id,channel,summary,occurred_at,created_by)
      VALUES($1,$2,'phone','Tutor de outra empresa',now(),$3)`, [ids.tenantA, ids.foreign, ids.adminA]), foreignKeyError);
    await assert.rejects(db.query(`INSERT INTO crm_contacts(tenant_id,tutor_id,channel,summary,occurred_at,created_by)
      VALUES($1,$2,'phone','Autor de outra empresa',now(),$3)`, [ids.tenantA, ids.active, ids.adminB]), foreignKeyError);
    await assert.rejects(db.query(`INSERT INTO crm_tasks(tenant_id,tutor_id,title,due_at,created_by)
      VALUES($1,$2,'Tutor de outra empresa',now(),$3)`, [ids.tenantA, ids.foreign, ids.adminA]), foreignKeyError);
    await assert.rejects(db.query(`INSERT INTO crm_tasks(tenant_id,tutor_id,title,due_at,created_by)
      VALUES($1,$2,'Autor de outra empresa',now(),$3)`, [ids.tenantA, ids.active, ids.adminB]), foreignKeyError);
  });

  test('dados desaparecem imediatamente após revogar a permissão ou inativar o vínculo', async () => {
    await db.query('UPDATE memberships SET permissions=ARRAY[]::text[] WHERE tenant_id=$1 AND user_id=$2', [ids.tenantA, ids.crmStaff]);
    try {
      assert.equal((await call('/crm/clients', 'GET', undefined, crmCookie)).code, 403);
    } finally {
      await db.query("UPDATE memberships SET permissions=ARRAY['crm'],active=false WHERE tenant_id=$1 AND user_id=$2", [ids.tenantA, ids.crmStaff]);
    }
    try {
      assert.equal((await call('/crm/tasks', 'GET', undefined, crmCookie)).code, 403);
    } finally {
      await db.query('UPDATE memberships SET active=true WHERE tenant_id=$1 AND user_id=$2', [ids.tenantA, ids.crmStaff]);
    }
    assert.equal((await call('/crm/clients', 'GET', undefined, crmCookie)).code, 200);
  });
});
