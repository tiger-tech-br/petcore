// Explicit, bounded acceptance probe for the isolated Hostinger preview.
// Does not import the application, migrate, DELETE, send mail, upload or pay.
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {readFile, writeFile, rename, mkdir, open, unlink} from 'node:fs/promises';
import {dirname, resolve, relative, isAbsolute, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'dotenv';
import pg from 'pg';
import argon2 from 'argon2';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PRIVATE = resolve(ROOT, 'deploy/private');
const ORIGIN = 'https://petcore.tigertech.dev.br';
const HOST = 'ep-damp-tree-b6h5kkhc.c-2.sa-east-1.aws.neon.tech';
const BRANCH = 'br-fragrant-frost-b6kr9it0';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EXPECTED_MIGRATIONS = [
 '001_core.sql', '002_notifications.sql', '003_reminder_delivery.sql',
 '004_tutor_email_reminders_opt_in.sql', '005_crm.sql', '006_business.sql',
 '007_privacy.sql', '008_commercial.sql', '009_upload_cleanup.sql',
 '010_contact.sql', '011_operator_identity.sql', '012_petcore_payment_links.sql',
 '013_reminder_consent_order.sql', '014_subscription_recurrence_cancellation.sql',
 '015_taxi_dog.sql', '017_support_email_notifications.sql',
 '018_backup_retention.sql', '019_launch_policy_drafts.sql',
];
const RELEASE_CHECKSUMS = {
 '018_backup_retention.sql': 'd62d821bde6c9250bbcc9d1e4cd7f62a044b5f7732fcfb284ff7dd32dc49e8ad',
 '019_launch_policy_drafts.sql': '0e0f0555ffbe150c1fd74c7b5488070e7c71fa11b5e21686c5c4de5f8e32b5bc',
};
const report = {ok: false, checks: [], retired: false};
let stage = 'arguments', db, client, state, statePath, fileLock;
const sessions = {};

function requireThat(condition, code) {
 if (!condition) throw Object.assign(new Error(code), {code});
}
function privatePath(value) {
 const path = resolve(ROOT, value), rel = relative(PRIVATE, path);
 requireThat(rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), 'QA_PRIVATE_PATH_REQUIRED');
 return path;
}
function runtime(env) {
 const origin = new URL(env.APP_ORIGIN || 'https://invalid.test');
 requireThat(origin.href === ORIGIN + '/', 'QA_PREVIEW_ORIGIN_REQUIRED');
 requireThat(env.EMAIL_PROVIDER === 'none' && env.SUPPORT_EMAILS_ENABLED === 'false'
  && env.SUPPORT_EMAILS_CONFIRM_SEND === 'NO' && env.REMINDER_EMAILS_ENABLED === 'false'
  && env.REMINDER_EMAILS_CONFIRM_SEND === 'NO', 'QA_EMAIL_MUST_BE_DISABLED');
 for (const key of ['EMAIL_API_KEY', 'RESEND_API_KEY', 'OBJECT_STORAGE_ENDPOINT',
  'OBJECT_STORAGE_BUCKET', 'OBJECT_STORAGE_ACCESS_KEY', 'OBJECT_STORAGE_SECRET_KEY']) {
  requireThat(!env[key], 'QA_EXTERNAL_PROVIDER_CREDENTIALS_FORBIDDEN');
 }
 const url = new URL(env.DATABASE_URL || 'postgresql://invalid/missing');
 requireThat(['postgres:', 'postgresql:'].includes(url.protocol), 'QA_DATABASE_PROTOCOL_INVALID');
 url.hostname = url.hostname.replace(/-pooler(?=\.)/, '');
 requireThat(url.hostname === HOST && url.pathname === '/neondb' && (!url.port || url.port === '5432')
  && url.username && url.password && !url.hash, 'QA_ISOLATED_DATABASE_REQUIRED');
 // No URL-provided pg options or alternate service configuration is accepted.
 requireThat([...url.searchParams.keys()].every(key => ['sslmode', 'channel_binding'].includes(key)), 'QA_DATABASE_OPTIONS_INVALID');
 url.searchParams.set('sslmode', 'verify-full');
 return url;
}
const label = (s, suffix) => 'QA_HOSTINGER_' + s.runId + '_' + suffix;
const email = (s, person) => 'qa-' + s.runId + '-' + person + '@example.test';
function validState(s) {
 requireThat(s?.version === 1 && UUID.test(s.runId) && s.origin === ORIGIN && s.branch === BRANCH
  && s.databaseHost === HOST && Number.isFinite(Date.parse(s.createdAt))
  && Number.isFinite(Date.parse(s.startsAt)), 'QA_STATE_INVALID');
 const values = [...Object.values(s.ids || {}), ...Object.values(s.keys || {})];
 requireThat(Object.keys(s.ids || {}).sort().join() === 'a,b,other,owner,staff'
  && Object.keys(s.keys || {}).sort().join() === 'cashClose,cashOpen,payment,product,sale'
  && values.every(id => UUID.test(id)) && new Set(values).size === 10, 'QA_STATE_IDENTIFIERS_INVALID');
 return s;
}
function recordedSuccess(s) {
 return s.completed === true && s.retired === true && s.sessionInvalidationVerified === true
  && Array.isArray(s.checks) && s.checks.includes('retirement_invalidates_staff_session');
}
async function saveState() {
 const pending = statePath + '.next';
 await writeFile(pending, JSON.stringify(state, null, 2) + '\n', {mode: 0o600});
 await rename(pending, statePath);
}
function checked(name) {
 report.checks.push(name);
 console.log(JSON.stringify({event: 'hostinger_qa_check', check: name, ok: true}));
}
async function api(path, {method = 'GET', body, person = 'owner', origin = ORIGIN} = {}) {
 requireThat(/^\/api\/[a-z0-9/?=&%:._-]+$/i.test(path), 'QA_API_PATH_INVALID');
 const response = await fetch(ORIGIN + path, {
  method, redirect: 'error', signal: AbortSignal.timeout(45000),
  headers: {'X-PetCore-Request': '1', Origin: origin, 'Content-Type': 'application/json',
   ...(sessions[person] ? {Cookie: sessions[person]} : {})},
  body: body === undefined ? undefined : JSON.stringify(body),
 });
 const text = await response.text();
 requireThat(text.length <= 2_000_000, 'QA_RESPONSE_TOO_LARGE');
 let data; try { data = JSON.parse(text); } catch { data = undefined; }
 const pathAlias = path.split('?')[0].replace(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi, '{id}');
 return {status: response.status, headers: response.headers, data, text, pathAlias};
}
function expect(reply, status) {
 if (reply.status !== status) report.http = {path: reply.pathAlias, expectedStatus: status, actualStatus: reply.status};
 requireThat(reply.status === status, 'QA_HTTP_STATUS_UNEXPECTED');
 return reply;
}
async function preflight() {
 const health = expect(await api('/api/health', {person: 'anonymous'}), 200);
 requireThat(health.data?.ok === true && health.data?.database === true, 'QA_DATABASE_HEALTH_FAILED');
 expect(await api('/api/auth/me', {person: 'anonymous'}), 401);
 const legal = expect(await api('/api/public/legal', {person: 'anonymous'}), 200);
 requireThat(legal.data?.published === false, 'QA_UNPUBLISHED_PREVIEW_REQUIRED');
 checked('https_database_and_anonymous_session');
}
async function transaction(fn) {
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try { const result = await fn(); await client.query('COMMIT'); return result; }
 catch (error) { await client.query('ROLLBACK'); throw error; }
}
async function ownedFixtures({allowMissing = false} = {}) {
 const tenants = [state.ids.a, state.ids.b], users = [state.ids.owner, state.ids.other, state.ids.staff];
 const found = await client.query('SELECT id,name,active FROM tenants WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [tenants]);
 if (allowMissing && found.rowCount === 0) {
  const unused = await client.query('SELECT count(*)::int AS n FROM users WHERE id=ANY($1::uuid[]) OR email=ANY($2::text[])',
   [users, ['owner', 'other', 'staff'].map(person => email(state, person))]);
  requireThat(unused.rows[0].n === 0, 'QA_FIXTURE_IDENTITY_ALREADY_USED');
  return false;
 }
 requireThat(found.rowCount === 2 && found.rows.every(row => row.name === label(state, row.id === state.ids.a ? 'A' : 'B')), 'QA_FIXTURE_OWNERSHIP_FAILED');
 const accounts = await client.query('SELECT id,email,is_platform_owner FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [users]);
 requireThat(accounts.rowCount === 3 && accounts.rows.every(row => !row.is_platform_owner
  && ['owner', 'other', 'staff'].some(person => state.ids[person] === row.id && row.email === email(state, person))), 'QA_FIXTURE_ACCOUNT_SCOPE_FAILED');
 const members = await client.query('SELECT tenant_id,user_id,role,active FROM memberships WHERE tenant_id=ANY($1::uuid[]) OR user_id=ANY($2::uuid[]) FOR UPDATE', [tenants, users]);
 const expected = [[state.ids.a, state.ids.owner, 'admin'], [state.ids.b, state.ids.other, 'admin'], [state.ids.a, state.ids.staff, 'employee']];
 requireThat(members.rowCount === 3 && expected.every(([tenant, user, role]) => members.rows.some(row => row.tenant_id === tenant && row.user_id === user && row.role === role)), 'QA_FIXTURE_MEMBERSHIP_SCOPE_FAILED');
 return {tenants: found.rows, members: members.rows};
}
async function prepare() {
 await transaction(async () => {
  const previous = await ownedFixtures({allowMissing: true});
  if (previous) {
   requireThat(previous.tenants.every(row => row.active) && previous.members.every(row => row.active), 'QA_FIXTURE_ALREADY_RETIRED');
   return;
  }
  const hash = await argon2.hash(randomBytes(48).toString('base64url'), {type: argon2.argon2id});
  await client.query('INSERT INTO tenants(id,name,timezone) VALUES($1,$2,$5),($3,$4,$5)',
   [state.ids.a, label(state, 'A'), state.ids.b, label(state, 'B'), 'America/Sao_Paulo']);
  for (const person of ['owner', 'other', 'staff']) {
   await client.query('INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)',
    [state.ids[person], label(state, person), email(state, person), hash]);
  }
  await client.query("INSERT INTO memberships(tenant_id,user_id,role,permissions) VALUES($1,$2,'admin','{}'),($3,$4,'admin','{}'),($1,$5,'employee',ARRAY['pets'])",
   [state.ids.a, state.ids.owner, state.ids.b, state.ids.other, state.ids.staff]);
 });
 state.prepared = true; await saveState(); checked('own_fictional_fixtures_prepared');
}
async function retire() {
 await transaction(async () => {
  const fixture = await ownedFixtures({allowMissing: true});
  if (!fixture) return;
  if (fixture.tenants.every(row => !row.active) && fixture.members.every(row => !row.active)) return;
  const tenants = [state.ids.a, state.ids.b], users = [state.ids.owner, state.ids.other, state.ids.staff];
  // Finish only the fictitious till this run opened, even if HTTP is unavailable.
  await client.query(`WITH balances AS (
   SELECT c.id,c.tenant_id,c.opening_cents+COALESCE(SUM(CASE WHEN l.kind IN ('sale_payment','expense_refund') THEN l.amount_cents ELSE -l.amount_cents END),0) AS expected
   FROM business_cash_sessions c LEFT JOIN business_ledger l ON l.tenant_id=c.tenant_id AND l.cash_session_id=c.id
   WHERE c.tenant_id=ANY($1::uuid[]) AND c.notes=$2 AND c.closed_at IS NULL GROUP BY c.id,c.tenant_id
  ) UPDATE business_cash_sessions c SET closed_at=now(),closed_by=CASE WHEN c.tenant_id=$3 THEN $4::uuid ELSE $5::uuid END,
   counted_cents=b.expected,expected_cents=b.expected,difference_cents=0,closing_notes=$6
   FROM balances b WHERE c.tenant_id=b.tenant_id AND c.id=b.id AND c.closed_at IS NULL`,
   [tenants, label(state, 'cash'), state.ids.a, state.ids.owner, state.ids.other, label(state, 'cash_cleanup_fictitious')]);
  await client.query("UPDATE reminder_jobs SET state='cancelled' WHERE tenant_id=ANY($1::uuid[]) AND state<>'sent'", [tenants]);
  await client.query("UPDATE appointments SET status='cancelled',updated_at=now() WHERE tenant_id=ANY($1::uuid[]) AND status IN ('pending','confirmed','in_progress')", [tenants]);
  await client.query('UPDATE memberships SET active=false WHERE tenant_id=ANY($1::uuid[]) AND user_id=ANY($2::uuid[])', [tenants, users]);
  await client.query('UPDATE tenants SET active=false WHERE id=ANY($1::uuid[])', [tenants]);
  await client.query('UPDATE users SET session_version=session_version+1,password_hash=$2 WHERE id=ANY($1::uuid[])',
   [users, await argon2.hash(randomBytes(48).toString('base64url'), {type: argon2.argon2id})]);
 });
 state.retired = true; await saveState(); report.retired = true; checked('own_fixtures_retired_without_delete');
}
async function login(person, password) {
 const reply = expect(await api('/api/auth/login', {method: 'POST', person: 'anonymous', body: {email: email(state, person), password}}), 200);
 const cookie = reply.headers.get('set-cookie') || '';
 requireThat(/^petcore\.sid=/.test(cookie) && /;\s*HttpOnly/i.test(cookie) && /;\s*Secure/i.test(cookie)
  && /;\s*SameSite=Lax/i.test(cookie), 'QA_SESSION_COOKIE_UNSAFE');
 sessions[person] = cookie.split(';')[0];
 const me = expect(await api('/api/auth/me', {person}), 200).data;
 requireThat(me.user.id === state.ids[person] && me.user.tenantId === state.ids[person === 'other' ? 'b' : 'a']
  && me.user.role === (person === 'staff' ? 'employee' : 'admin')
  && me.companies.length === 1, 'QA_AUTHENTICATED_IDENTITY_MISMATCH');
 return me;
}
async function namedRecord(resource, suffix, body) {
 const rows = expect(await api('/api/data/' + resource), 200).data;
 requireThat(Array.isArray(rows) && rows.every(row => row.tenant_id === state.ids.a), 'QA_RECORD_TENANT_SCOPE_FAILED');
 const found = rows.filter(row => row.name === label(state, suffix));
 requireThat(found.length <= 1, 'QA_FIXTURE_RECORD_AMBIGUOUS');
 return found[0] || expect(await api('/api/data/' + resource, {method: 'POST', body: {name: label(state, suffix), ...body}}), 201).data;
}
async function run() {
 requireThat(state.prepared && !state.retired, 'QA_ACTIVE_PREPARED_FIXTURE_REQUIRED');
 state.completed = false; state.sessionInvalidationVerified = false; delete state.checks;
 await saveState();
 const password = randomBytes(48).toString('base64url');
 try {
  await transaction(async () => {
   const fixture = await ownedFixtures();
   requireThat(fixture.tenants.every(row => row.active) && fixture.members.every(row => row.active), 'QA_FIXTURE_ALREADY_RETIRED');
   await client.query('UPDATE users SET password_hash=$2,session_version=session_version+1 WHERE id=ANY($1::uuid[])',
    [[state.ids.owner, state.ids.other, state.ids.staff], await argon2.hash(password, {type: argon2.argon2id})]);
  });
  for (const person of ['owner', 'other', 'staff']) await login(person, password);
  checked('real_https_login_roles_secure_cookie');
  for (const person of ['owner', 'other']) {
   const me = expect(await api('/api/auth/me', {person}), 200).data;
   if (!me.subscription.onboarding_completed_at) expect(await api('/api/commercial/onboarding', {method: 'POST', body: {plan: 'free'}, person}), 200);
   const current = expect(await api('/api/auth/me', {person}), 200).data.subscription;
   requireThat(current.writable && current.status === 'trial' && Math.abs(Date.parse(current.trial_ends_at) - Date.parse(current.trial_started_at) - 30 * 86400000) < 2000, 'QA_FREE_TRIAL_FAILED');
  }
  checked('free_thirty_days_without_checkout');
  expect(await api('/api/settings', {method: 'PATCH', body: {reminder_minutes_before: 60}, origin: 'https://foreign.example.test'}), 403);
  expect(await api('/api/auth/select-company', {method: 'POST', body: {tenantId: state.ids.b}}), 403);
  expect(await api('/api/data/tutors', {person: 'staff'}), 403);
  expect(await api('/api/business/reports', {person: 'staff'}), 403);
  expect(await api('/api/commercial/platform/settings'), 403);
  checked('origin_role_and_company_switch_restrictions');
  const tutor = await namedRecord('tutors', 'tutor', {phone: '', email: email(state, 'tutor'), notes: 'Fictício; nenhum envio autorizado.', email_reminders_opt_in: false});
  const pet = await namedRecord('pets', 'pet', {tutor_id: tutor.id, species: 'Cão', size: 'pequeno', notes: 'Fictício'});
  const service = await namedRecord('services', 'service', {price_cents: 6500, duration_minutes: 60});
  const professional = await namedRecord('professionals', 'professional', {active: true});
  const options = expect(await api('/api/options/pet-tutors', {person: 'staff'}), 200).data;
  requireThat(options.length === 1 && options[0].id === tutor.id && Object.keys(options[0]).sort().join() === 'id,name', 'QA_MINIMAL_SELECTOR_FAILED');
  requireThat(expect(await api('/api/data/pets', {person: 'other'}), 200).data.length === 0, 'QA_CROSS_TENANT_LIST_FAILED');
  expect(await api('/api/data/pets/' + pet.id, {method: 'PATCH', body: {name: 'Forbidden'}, person: 'other'}), 404);
  checked('tutor_pet_service_professional_and_tenant_isolation');
  expect(await api('/api/professionals/' + professional.id + '/schedule', {method: 'PUT', body: {
   shifts: Array.from({length: 7}, (_, i) => ({weekday: i + 1, start_time: '08:00', end_time: '18:00'})), breaks: [], serviceIds: [service.id],
  }}), 200);
  const now = Date.parse(expect(await api('/api/calendar/options'), 200).data.server_now);
  requireThat(Math.abs(now - Date.now()) < 120000 && Date.parse(state.startsAt) > now + 3600000, 'QA_CLOCK_OR_FUTURE_SLOT_INVALID');
  const from = new Date(Date.parse(state.startsAt) - 86400000).toISOString(), to = new Date(Date.parse(state.startsAt) + 86400000).toISOString();
  const calendarPath = '/api/calendar/appointments?' + new URLSearchParams({from, to});
  const prior = expect(await api(calendarPath), 200).data.filter(row => row.notes === label(state, 'appointment'));
  requireThat(prior.length <= 1, 'QA_FIXTURE_APPOINTMENT_AMBIGUOUS');
  const booking = {tutor_id: tutor.id, pet_id: pet.id, professional_id: professional.id, service_ids: [service.id], starts_at: state.startsAt, notes: label(state, 'appointment')};
  let appointment = prior[0];
  if (!appointment) {
   requireThat(expect(await api('/api/calendar/check', {method: 'POST', body: {starts_at: state.startsAt, professional_id: professional.id, service_ids: [service.id]}}), 200).data.available, 'QA_SLOT_UNAVAILABLE');
   appointment = expect(await api('/api/calendar/appointments', {method: 'POST', body: booking}), 201).data;
  }
  if (appointment.status === 'pending') appointment = expect(await api('/api/calendar/appointments/' + appointment.id + '/status', {method: 'POST', body: {status: 'confirmed'}}), 200).data;
  requireThat(appointment.status === 'confirmed', 'QA_APPOINTMENT_CONFIRMATION_FAILED');
  expect(await api('/api/calendar/appointments', {method: 'POST', body: {...booking, starts_at: appointment.starts_at}}), 409);
  const moved = new Date(Date.parse(state.startsAt) + 3600000).toISOString();
  appointment = expect(await api('/api/calendar/appointments/' + appointment.id + '/move', {method: 'POST', body: {starts_at: moved, professional_id: professional.id, reason: 'Ensaio fictício', mode: 'reschedule'}}), 200).data;
  requireThat(Date.parse(appointment.starts_at) === Date.parse(moved), 'QA_APPOINTMENT_MOVE_FAILED');
  const history = expect(await api('/api/calendar/appointments/' + appointment.id + '/history'), 200).data;
  requireThat(history.some(row => row.kind === 'confirmed') && history.some(row => row.kind === 'reschedule'), 'QA_APPOINTMENT_HISTORY_FAILED');
  checked('schedule_booking_confirmation_conflict_reschedule_history');
  const productBody = {name: label(state, 'product'), price_cents: 2000, cost_cents: 1000, initial_stock: 3, idempotency_key: state.keys.product};
  const product = expect(await api('/api/business/products', {method: 'POST', body: productBody}), 201).data;
  const repeated = expect(await api('/api/business/products', {method: 'POST', body: productBody}), 201).data;
  requireThat(product.id === repeated.id, 'QA_PRODUCT_IDEMPOTENCY_FAILED');
  const due = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(state.createdAt));
  const sale = expect(await api('/api/business/sales', {method: 'POST', body: {tutor_id: tutor.id, items: [{kind: 'product', product_id: product.id, quantity: 1}], due_date: due, notes: label(state, 'sale'), idempotency_key: state.keys.sale}}), 201).data;
  const cashBody = {opening_cents: 0, notes: label(state, 'cash'), idempotency_key: state.keys.cashOpen};
  const cash = expect(await api('/api/business/cash/open', {method: 'POST', body: cashBody}), 201).data;
  const cashAgain = expect(await api('/api/business/cash/open', {method: 'POST', body: cashBody}), 201).data;
  requireThat(cash.id === cashAgain.id && cash.opening_cents === 0, 'QA_CASH_OPEN_IDEMPOTENCY_FAILED');
  const paymentBody = {amount_cents: 2000, payment_method: 'cash', idempotency_key: state.keys.payment};
  const payment = expect(await api('/api/business/sales/' + sale.id + '/payments', {method: 'POST', body: paymentBody}), 201).data;
  const paymentAgain = expect(await api('/api/business/sales/' + sale.id + '/payments', {method: 'POST', body: paymentBody}), 201).data;
  requireThat(payment.sale.status === 'paid' && payment.sale.paid_cents === 2000 && payment.sale.balance_cents === 0 && payment.payment.id === paymentAgain.payment.id, 'QA_SALE_PAYMENT_IDEMPOTENCY_FAILED');
  const closedCash = expect(await api('/api/business/cash/' + cash.id + '/close', {method: 'POST', body: {counted_cents: 2000, notes: label(state, 'cash_closed_fictitious'), idempotency_key: state.keys.cashClose}}), 200).data;
  requireThat(closedCash.closed_at && closedCash.expected_cents === 2000 && closedCash.counted_cents === 2000 && closedCash.difference_cents === 0, 'QA_CASH_RECONCILIATION_FAILED');
  requireThat(expect(await api('/api/business/cash'), 200).data.current === null, 'QA_CASH_STILL_OPEN');
  const products = expect(await api('/api/business/products'), 200).data.items;
  requireThat(products.length === 1 && products[0].id === product.id && products[0].stock_quantity === 2, 'QA_STOCK_BALANCE_FAILED');
  const csv = expect(await api('/api/business/reports/export?kind=sales'), 200);
  requireThat(csv.headers.get('content-type')?.includes('text/csv') && csv.headers.get('cache-control') === 'no-store' && csv.text.includes(sale.id.slice(0, 8).toUpperCase()), 'QA_REPORT_EXPORT_FAILED');
  requireThat(expect(await api('/api/business/sales', {person: 'other'}), 200).data.total === 0, 'QA_FINANCE_TENANT_ISOLATION_FAILED');
  checked('fictional_inventory_till_sale_receipt_idempotency_and_csv');
  let detail = expect(await api('/api/crm/clients/' + tutor.id), 200).data;
  if (!detail.contacts.some(row => row.summary === label(state, 'contact'))) expect(await api('/api/crm/clients/' + tutor.id + '/contacts', {method: 'POST', body: {channel: 'other', summary: label(state, 'contact'), occurred_at: state.createdAt}}), 201);
  let task = detail.tasks.find(row => row.title === label(state, 'task'));
  if (!task) task = expect(await api('/api/crm/clients/' + tutor.id + '/tasks', {method: 'POST', body: {title: label(state, 'task'), notes: 'Fictício', due_at: state.startsAt}}), 201).data;
  expect(await api('/api/crm/tasks/' + task.id, {method: 'PATCH', body: {status: 'done'}}), 200);
  detail = expect(await api('/api/crm/clients/' + tutor.id), 200).data;
  requireThat(detail.contacts.some(row => row.summary === label(state, 'contact')) && detail.tasks.some(row => row.id === task.id && row.status === 'done'), 'QA_CRM_PERSISTENCE_FAILED');
  expect(await api('/api/crm/clients/' + tutor.id, {person: 'other'}), 404);
  checked('manual_crm_contact_task_and_isolation');
  expect(await api('/api/auth/logout', {method: 'POST', body: {}}), 200);
  expect(await api('/api/auth/me'), 401);
  checked('logout_invalidates_session');
 } finally {
  await retire();
  // Staff remains logged in until retirement invalidates its session version.
  if (sessions.staff) expect(await api('/api/auth/me', {person: 'staff'}), 401);
 }
 // Reached only when both the journey and the finally block have succeeded.
 checked('retirement_invalidates_staff_session');
 state.sessionInvalidationVerified = true; state.completed = true;
 state.checks = [...report.checks]; await saveState();
}
async function selfTest() {
 const env = {APP_ORIGIN: ORIGIN, EMAIL_PROVIDER: 'none', SUPPORT_EMAILS_ENABLED: 'false', SUPPORT_EMAILS_CONFIRM_SEND: 'NO', REMINDER_EMAILS_ENABLED: 'false', REMINDER_EMAILS_CONFIRM_SEND: 'NO', DATABASE_URL: 'postgresql://fixture:fake@' + HOST + '/neondb?sslmode=require'};
 assert.equal(runtime(env).hostname, HOST);
 for (const override of [
  {APP_ORIGIN: 'http://petcore.tigertech.dev.br'}, {APP_ORIGIN: ORIGIN + '/other'},
  {APP_ORIGIN: 'https://user:password@petcore.tigertech.dev.br'}, {APP_ORIGIN: ORIGIN + ':444'},
  {EMAIL_PROVIDER: 'resend'}, {EMAIL_API_KEY: 'fake'}, {OBJECT_STORAGE_BUCKET: 'fake'},
  {SUPPORT_EMAILS_ENABLED: 'true'}, {REMINDER_EMAILS_CONFIRM_SEND: 'YES'},
  {DATABASE_URL: 'postgresql://fixture:fake@ep-other.neon.tech/neondb'},
  {DATABASE_URL: 'postgresql://fixture:fake@' + HOST + '/other'},
  {DATABASE_URL: 'postgresql://fixture:fake@' + HOST + '/neondb?options=unsafe'},
 ]) assert.throws(() => runtime({...env, ...override}));
 for (const path of [ROOT, resolve(ROOT, '.env'), resolve(PRIVATE, '../outside.json')]) assert.throws(() => privatePath(path));
 const ids = Object.fromEntries(['a', 'b', 'owner', 'other', 'staff'].map(key => [key, randomUUID()]));
 const keys = Object.fromEntries(['product', 'sale', 'payment', 'cashOpen', 'cashClose'].map(key => [key, randomUUID()]));
 const fixture = {version: 1, runId: randomUUID(), origin: ORIGIN, branch: BRANCH, databaseHost: HOST, createdAt: new Date().toISOString(), startsAt: new Date().toISOString(), ids, keys};
 assert.equal(validState(fixture), fixture);
 assert.throws(() => validState({...fixture, branch: 'main'}));
 assert.throws(() => validState({...fixture, ids: {...ids, b: ids.a}}));
 assert.equal(recordedSuccess({completed: true, retired: true}), false);
 assert.equal(recordedSuccess({completed: false, retired: true, sessionInvalidationVerified: true, checks: ['retirement_invalidates_staff_session']}), false);
 assert.equal(recordedSuccess({completed: true, retired: true, sessionInvalidationVerified: false, checks: ['retirement_invalidates_staff_session']}), false);
 assert.equal(recordedSuccess({completed: true, retired: true, sessionInvalidationVerified: true, checks: []}), false);
 assert.equal(recordedSuccess({completed: true, retired: true, sessionInvalidationVerified: true, checks: ['retirement_invalidates_staff_session']}), true);
 console.log(JSON.stringify({event: 'hostinger_qa_guard_tests', ok: true, networkUsed: false, databaseUsed: false}));
}
async function main() {
 const args = process.argv.slice(2), command = args.shift();
 if (command === '--self-test') { requireThat(args.length === 0, 'QA_ARGUMENT_INVALID'); return selfTest(); }
 if (!command || command === '--help') {
  console.log('node api/scripts/hostinger-e2e.mjs prepare|run|retire --confirm-test-only [--env deploy/private/hostinger-staging-20261114/app.env] [--state deploy/private/hostinger-e2e/<run-id>.json]\n--self-test checks offline guards only. run always retires its own fixtures.');
  return;
 }
 requireThat(['prepare', 'run', 'retire'].includes(command), 'QA_COMMAND_INVALID');
 const options = {};
 while (args.length) {
  const key = args.shift();
  requireThat(['--confirm-test-only', '--env', '--state'].includes(key) && !Object.hasOwn(options, key), 'QA_ARGUMENT_INVALID');
  options[key] = key === '--confirm-test-only' ? true : args.shift();
  requireThat(options[key], 'QA_ARGUMENT_VALUE_REQUIRED');
 }
 requireThat(options['--confirm-test-only'] === true, 'QA_EXPLICIT_TEST_CONFIRMATION_REQUIRED');
 const env = parse(await readFile(privatePath(options['--env'] || 'deploy/private/hostinger-staging-20261114/app.env')));
 const address = runtime(env); // Complete all target/provider guards before I/O to services.
 if (options['--state']) {
  statePath = privatePath(options['--state']); state = validState(JSON.parse(await readFile(statePath, 'utf8')));
 } else {
  requireThat(command === 'prepare', 'QA_STATE_FILE_REQUIRED');
  const starts = new Date(Date.now() + 2 * 86400000); starts.setUTCHours(15, 0, 0, 0);
  state = {version: 1, runId: randomUUID(), origin: ORIGIN, branch: BRANCH, databaseHost: HOST, createdAt: new Date().toISOString(), startsAt: starts.toISOString(),
   ids: Object.fromEntries(['a', 'b', 'owner', 'other', 'staff'].map(key => [key, randomUUID()])), keys: Object.fromEntries(['product', 'sale', 'payment', 'cashOpen', 'cashClose'].map(key => [key, randomUUID()]))};
  statePath = privatePath('deploy/private/hostinger-e2e/' + state.runId + '.json');
  await mkdir(dirname(statePath), {recursive: true, mode: 0o700});
  await writeFile(statePath, JSON.stringify(state, null, 2) + '\n', {flag: 'wx', mode: 0o600});
 }
 // Shared ignored state contains IDs only: passwords/cookies/URLs never persist.
 requireThat(statePath.endsWith('.json'), 'QA_STATE_EXTENSION_INVALID');
 fileLock = await open(statePath + '.lock', 'wx', 0o600);
 if (command === 'run' && recordedSuccess(state)) {
  report.ok = true; report.retired = true; report.reusedRecordedResult = true; report.checks = state.checks || []; return;
 }
 // Retirement must remain available during an HTTP outage or legal publication.
 if (command !== 'retire') { stage = 'preflight'; await preflight(); }
 db = new pg.Pool({connectionString: address.toString(), max: 1, connectionTimeoutMillis: 15000, statement_timeout: 30000, idle_in_transaction_session_timeout: 30000, ssl: {rejectUnauthorized: true}, application_name: 'petcore-hostinger-bounded-qa'});
 db.on('error', () => {}); client = await db.connect();
 const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', ['hostinger-qa:' + state.runId]);
 requireThat(lock.rows[0].locked, 'QA_RUN_ALREADY_ACTIVE');
 const migrations = await client.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename');
 requireThat(JSON.stringify(migrations.rows.map(row => row.filename)) === JSON.stringify(EXPECTED_MIGRATIONS), 'QA_SCHEMA_RELEASE_MISMATCH');
 requireThat(Object.entries(RELEASE_CHECKSUMS).every(([filename, checksum]) => migrations.rows.some(row => row.filename === filename && row.checksum === checksum)), 'QA_SCHEMA_CHECKSUM_MISMATCH');
 stage = command;
 if (command === 'prepare') await prepare();
 if (command === 'run') await run();
 if (command === 'retire') await retire();
 report.ok = true;
}
try { await main(); }
catch (error) {
 report.ok = false; report.failedStage = stage;
 report.code = /^QA_[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'QA_OPERATION_FAILED';
 process.exitCode = 1;
} finally {
 // Releasing the connection also releases this run's session advisory lock.
 client?.release(true); await db?.end().catch(() => {});
 if (fileLock) { await fileLock.close(); await unlink(statePath + '.lock').catch(() => {}); }
 if (statePath) console.log(JSON.stringify({event: 'hostinger_qa_result', ...report, stateFile: relative(ROOT, statePath).split(sep).join('/'), noEmailOrExternalPaymentAttempted: true}));
 else if (process.exitCode) console.error(JSON.stringify({event: 'hostinger_qa_result', ...report}));
}
