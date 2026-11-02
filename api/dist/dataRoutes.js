import { Router } from 'express';
import { z } from 'zod';
import { pool, tx, auth, tenant, permit, ensure, validateAvailability } from './core.js';
const r = Router();
r.use(auth);
const tutor = z.object({ name: z.string().trim().min(2).max(160), phone: z.string().max(40).default(''), email: z.union([z.email(), z.literal(''), z.null()]).optional(), notes: z.string().max(3000).default('') });
const pet = z.object({ name: z.string().trim().min(1).max(160), tutor_id: z.uuid(), species: z.string().trim().min(2), breed: z.string().nullable().optional(), size: z.enum(['pequeno', 'medio', 'grande']), birth_date: z.iso.date().nullable().optional(), notes: z.string().max(3000).default('') });
const professional = z.object({ name: z.string().trim().min(2).max(160), user_id: z.uuid().nullable().optional(), active: z.boolean().default(true) });
const service = z.object({ name: z.string().trim().min(2).max(160), description: z.string().max(2000).default(''), price_cents: z.number().int().min(0).max(999999999), duration_minutes: z.number().int().min(5).max(1440), active: z.boolean().default(true) });
const defs = { tutors: { schema: tutor, permission: 'tutors', columns: ['name', 'phone', 'email', 'notes'] }, pets: { schema: pet, permission: 'pets', columns: ['name', 'tutor_id', 'species', 'breed', 'size', 'birth_date', 'notes'] }, professionals: { schema: professional, permission: 'professionals', columns: ['name', 'user_id', 'active'] }, services: { schema: service, permission: 'services', columns: ['name', 'description', 'price_cents', 'duration_minutes', 'active'] } };
function getResource(raw) { ensure(raw in defs, 404, 'Recurso não encontrado.'); return raw; }
function allowed(req, permission) { const a = req.access; ensure(a.role === 'admin' || a.permissions.includes(permission), 403, 'Sem permissão.'); }
// Identificador da empresa nunca é fornecido pelo cliente nestas operações.
r.get('/data/:resource', async (req, res) => {
    const key = getResource(req.params.resource), id = tenant(req);
    allowed(req, defs[key].permission);
    const fields = key === 'pets' ? 'SELECT p.*,t.name AS tutor_name FROM pets p JOIN tutors t ON t.tenant_id=p.tenant_id AND t.id=p.tutor_id WHERE p.tenant_id=$1 ORDER BY p.name' :
        `SELECT * FROM ${key} WHERE tenant_id=$1 ORDER BY name`;
    const rows = await pool.query(fields, [id]);
    res.json(rows.rows);
});
r.post('/data/:resource', async (req, res) => {
    const key = getResource(req.params.resource), id = tenant(req);
    allowed(req, defs[key].permission);
    const def = defs[key];
    const data = def.schema.parse(req.body);
    const columns = [...def.columns];
    const sql = `INSERT INTO ${key}(tenant_id,${columns.join(',')}) VALUES($1,${columns.map((_, i) => '$' + (i + 2)).join(',')}) RETURNING *`;
    const row = await pool.query(sql, [id, ...columns.map(c => data[c] ?? null)]);
    res.status(201).json(row.rows[0]);
});
r.patch('/data/:resource/:id', async (req, res) => {
    const key = getResource(req.params.resource), id = tenant(req), recordId = z.uuid().parse(req.params.id);
    allowed(req, defs[key].permission);
    const def = defs[key];
    const data = def.schema.partial().strict().parse(req.body);
    const columns = def.columns.filter(c => Object.hasOwn(data, c));
    ensure(columns.length, 422, 'Nenhum campo para atualizar.');
    const sql = `UPDATE ${key} SET ${columns.map((c, i) => `${c}=$${i + 3}`).join(',')} WHERE tenant_id=$1 AND id=$2 RETURNING *`;
    const row = await pool.query(sql, [id, recordId, ...columns.map(c => data[c] ?? null)]);
    ensure(row.rowCount, 404, 'Registro não encontrado.');
    res.json(row.rows[0]);
});
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const period = z.object({ weekday: z.number().int().min(1).max(7), start_time: hhmm, end_time: hhmm }).refine(x => x.end_time > x.start_time, 'Fim deve ser maior que início.');
r.get('/professionals/:id/schedule', permit('professionals'), async (req, res) => {
    const c = tenant(req), id = z.uuid().parse(req.params.id);
    const [shifts, breaks, services] = await Promise.all([
        pool.query('SELECT weekday,to_char(start_time,\'HH24:MI\') AS start_time,to_char(end_time,\'HH24:MI\') AS end_time FROM professional_shifts WHERE tenant_id=$1 AND professional_id=$2 ORDER BY weekday,start_time', [c, id]),
        pool.query('SELECT weekday,to_char(start_time,\'HH24:MI\') AS start_time,to_char(end_time,\'HH24:MI\') AS end_time FROM professional_breaks WHERE tenant_id=$1 AND professional_id=$2 ORDER BY weekday,start_time', [c, id]),
        pool.query('SELECT service_id FROM professional_services WHERE tenant_id=$1 AND professional_id=$2', [c, id])
    ]);
    res.json({ shifts: shifts.rows, breaks: breaks.rows, serviceIds: services.rows.map(s => s.service_id) });
});
r.put('/professionals/:id/schedule', permit('professionals'), async (req, res) => {
    const c = tenant(req), id = z.uuid().parse(req.params.id);
    const data = z.object({ shifts: z.array(period).max(28), breaks: z.array(period).max(28), serviceIds: z.array(z.uuid()).max(100) }).parse(req.body);
    await tx(async (db) => {
        const exists = await db.query('SELECT 1 FROM professionals WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [c, id]);
        ensure(exists.rowCount, 404, 'Profissional não encontrado.');
        await db.query('DELETE FROM professional_services WHERE tenant_id=$1 AND professional_id=$2', [c, id]);
        await db.query('DELETE FROM professional_shifts WHERE tenant_id=$1 AND professional_id=$2', [c, id]);
        await db.query('DELETE FROM professional_breaks WHERE tenant_id=$1 AND professional_id=$2', [c, id]);
        for (const s of data.shifts)
            await db.query('INSERT INTO professional_shifts(tenant_id,professional_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)', [c, id, s.weekday, s.start_time, s.end_time]);
        for (const s of data.breaks)
            await db.query('INSERT INTO professional_breaks(tenant_id,professional_id,weekday,start_time,end_time) VALUES($1,$2,$3,$4,$5)', [c, id, s.weekday, s.start_time, s.end_time]);
        for (const s of new Set(data.serviceIds))
            await db.query('INSERT INTO professional_services(tenant_id,professional_id,service_id) VALUES($1,$2,$3)', [c, id, s]);
        const future = await db.query("SELECT * FROM appointments WHERE tenant_id=$1 AND professional_id=$2 AND starts_at>now() AND status IN ('pending','confirmed','in_progress')", [c, id]);
        for (const a of future.rows) {
            const ids = (await db.query('SELECT service_id FROM appointment_services WHERE tenant_id=$1 AND appointment_id=$2', [c, a.id])).rows.map(x => x.service_id);
            await validateAvailability(db, c, id, new Date(a.starts_at), new Date(a.ends_at), ids);
        }
    });
    res.json({ ok: true });
});
r.post('/professionals/:id/absences', permit('professionals'), async (req, res) => {
    const c = tenant(req), id = z.uuid().parse(req.params.id);
    const { starts_at, ends_at, reason } = z.object({ starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }), reason: z.string().max(500).default('') }).parse(req.body);
    ensure(new Date(ends_at) > new Date(starts_at), 422, 'Intervalo inválido.');
    const row = await tx(async (db) => {
        const prof = await db.query('SELECT 1 FROM professionals WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [c, id]);
        ensure(prof.rowCount, 404, 'Profissional não encontrado.');
        const conflict = await db.query(`SELECT 1 FROM appointments WHERE tenant_id=$1 AND professional_id=$2 AND status IN ('pending','confirmed','in_progress')
   AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`, [c, id, starts_at, ends_at]);
        ensure(!conflict.rowCount, 409, 'Existe atendimento confirmado no intervalo.');
        return db.query(`INSERT INTO professional_absences(tenant_id,professional_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5) RETURNING *`, [c, id, starts_at, ends_at, reason]);
    });
    res.status(201).json(row.rows[0]);
});
r.get('/settings', async (req, res) => {
    const row = await pool.query('SELECT id,name,timezone,late_tolerance_minutes,reminder_minutes_before FROM tenants WHERE id=$1', [tenant(req)]);
    res.json(row.rows[0]);
});
r.patch('/settings', async (req, res) => {
    ensure(req.access?.role === 'admin', 403, 'Somente o administrador pode alterar configurações.');
    const input = z.object({ late_tolerance_minutes: z.number().int().min(0).max(120), reminder_minutes_before: z.number().int().min(0).max(10080) }).parse(req.body);
    const row = await tx(async (db) => {
        const result = await db.query('UPDATE tenants SET late_tolerance_minutes=$2,reminder_minutes_before=$3 WHERE id=$1 RETURNING id,name,timezone,late_tolerance_minutes,reminder_minutes_before', [tenant(req), input.late_tolerance_minutes, input.reminder_minutes_before]);
        await db.query(`UPDATE reminder_jobs j SET scheduled_for=a.starts_at-($2::int*interval '1 minute')
   FROM appointments a WHERE j.tenant_id=$1 AND a.tenant_id=j.tenant_id AND a.id=j.appointment_id AND j.state='queued'`, [tenant(req), input.reminder_minutes_before]);
        return result;
    });
    res.json(row.rows[0]);
});
r.get('/team', permit('team'), async (req, res) => {
    const out = await pool.query(`SELECT u.id,u.name,u.email,m.role,m.permissions,m.active FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY u.name`, [tenant(req)]);
    res.json(out.rows);
});
r.patch('/team/:id', async (req, res) => {
    ensure(req.access?.role === 'admin', 403, 'Somente o administrador pode alterar permissões.');
    const id = z.uuid().parse(req.params.id);
    const data = z.object({ permissions: z.array(z.enum(['appointments', 'agenda:all', 'tutors', 'pets', 'waitlist', 'services', 'professionals', 'team', 'finance'])), active: z.boolean() }).parse(req.body);
    const row = await pool.query("UPDATE memberships SET permissions=$3,active=$4 WHERE tenant_id=$1 AND user_id=$2 AND role='employee' RETURNING user_id", [tenant(req), id, data.permissions, data.active]);
    ensure(row.rowCount, 404, 'Funcionário não encontrado.');
    res.json({ ok: true });
});
export default r;
