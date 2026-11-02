import { Router } from 'express';
import { z } from 'zod';
import { auth, ensure, permit, pool, tenant } from './core.js';
const router = Router();
router.use(auth, permit('crm'));
const datetime = z.iso.datetime({ offset: true });
const positiveInt = (fallback, max) => z.string()
    .regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(max))
    .default(fallback);
const clientQuery = z.object({
    q: z.string().trim().max(100).default(''),
    segment: z.enum(['all', 'inactive', 'without_visits']).default('all'),
    inactive_days: z.enum(['30', '60', '90']).default('60').transform(Number),
    page: positiveInt(1, 1000000),
    page_size: positiveInt(12, 100)
}).strict();
const tasksQuery = z.object({
    filter: z.enum(['open', 'overdue', 'done', 'cancelled', 'all']).default('open'),
    page: positiveInt(1, 1000000),
    page_size: positiveInt(20, 100)
}).strict();
const contactInput = z.object({
    channel: z.enum(['whatsapp', 'phone', 'email', 'in_person', 'other']),
    summary: z.string().trim().min(1).max(3000),
    occurred_at: datetime
}).strict();
const taskInput = z.object({
    title: z.string().trim().min(1).max(160),
    notes: z.string().trim().max(3000).default(''),
    due_at: datetime
}).strict();
const statusInput = z.object({ status: z.enum(['open', 'done', 'cancelled']) }).strict();
// Cada agregado e cada relacionamento utiliza a empresa autenticada. Os campos
// sao operacionais: nenhum valor de servico e tratado como pagamento recebido.
const clientMetrics = `client_metrics AS (
  SELECT t.id,t.name,t.phone,t.email,t.notes,t.created_at,
    COALESCE(p.pet_count,0)::int AS pet_count,
    COALESCE(a.completed_visits,0)::int AS completed_visits,
    a.last_visit_at,a.next_appointment_at,c.last_contact_at,
    COALESCE(k.pending_tasks,0)::int AS pending_tasks,k.next_task_due_at
  FROM tutors t
  LEFT JOIN (
    SELECT tutor_id,count(*)::int AS pet_count FROM pets
    WHERE tenant_id=$1 GROUP BY tutor_id
  ) p ON p.tutor_id=t.id
  LEFT JOIN (
    SELECT tutor_id,
      count(*) FILTER (WHERE status='done' AND starts_at<=now())::int AS completed_visits,
      max(starts_at) FILTER (WHERE status='done' AND starts_at<=now()) AS last_visit_at,
      min(starts_at) FILTER (WHERE status IN ('pending','confirmed','in_progress') AND starts_at>=now()) AS next_appointment_at
    FROM appointments WHERE tenant_id=$1 GROUP BY tutor_id
  ) a ON a.tutor_id=t.id
  LEFT JOIN (
    SELECT tutor_id,max(occurred_at) AS last_contact_at FROM crm_contacts
    WHERE tenant_id=$1 GROUP BY tutor_id
  ) c ON c.tutor_id=t.id
  LEFT JOIN (
    SELECT tutor_id,count(*) FILTER (WHERE status='open')::int AS pending_tasks,
      min(due_at) FILTER (WHERE status='open') AS next_task_due_at
    FROM crm_tasks WHERE tenant_id=$1 GROUP BY tutor_id
  ) k ON k.tutor_id=t.id
  WHERE t.tenant_id=$1
)`;
const taskColumns = `k.id,k.tutor_id,t.name AS tutor_name,k.title,k.notes,k.due_at,
  k.status,k.created_at,u.name AS created_by_name,k.completed_at`;
const taskJoins = `FROM crm_tasks k
  JOIN tutors t ON t.tenant_id=k.tenant_id AND t.id=k.tutor_id
  JOIN memberships m ON m.tenant_id=k.tenant_id AND m.user_id=k.created_by
  JOIN users u ON u.id=m.user_id`;
router.get('/clients', async (req, res) => {
    const company = tenant(req);
    const input = clientQuery.parse(req.query);
    const result = await pool.query(`WITH ${clientMetrics}, filtered AS (
    SELECT * FROM client_metrics
    WHERE ($3::text='' OR strpos(lower(name),lower($3))>0
      OR strpos(lower(COALESCE(email,'')),lower($3))>0 OR strpos(lower(phone),lower($3))>0)
      AND ($4::text='all'
        OR ($4='without_visits' AND last_visit_at IS NULL)
        OR ($4='inactive' AND last_visit_at < now()-($2::int*interval '1 day')))
  )
  SELECT COALESCE((SELECT json_agg(page_rows) FROM (
    SELECT * FROM filtered ORDER BY lower(name),id LIMIT $5 OFFSET $6
  ) page_rows),'[]'::json) AS items,
  (SELECT count(*)::int FROM filtered) AS total,
  (SELECT json_build_object(
    'clients',count(*)::int,
    'withoutVisits',count(*) FILTER (WHERE last_visit_at IS NULL)::int,
    'inactive',count(*) FILTER (WHERE last_visit_at < now()-($2::int*interval '1 day'))::int,
    'pendingTasks',COALESCE(sum(pending_tasks),0)::int,
    'overdueTasks',(SELECT count(*)::int FROM crm_tasks WHERE tenant_id=$1 AND status='open' AND due_at<now())
  ) FROM client_metrics) AS summary,
  (SELECT timezone FROM tenants WHERE id=$1) AS timezone`, [company, input.inactive_days, input.q, input.segment, input.page_size, (input.page - 1) * input.page_size]);
    res.json({ ...result.rows[0], page: input.page, pageSize: input.page_size, inactiveDays: input.inactive_days });
});
router.get('/tasks', async (req, res) => {
    const company = tenant(req);
    const input = tasksQuery.parse(req.query);
    const result = await pool.query(`WITH filtered AS (
    SELECT ${taskColumns} ${taskJoins}
    WHERE k.tenant_id=$1 AND ($2::text='all' OR k.status=$2
      OR ($2='overdue' AND k.status='open' AND k.due_at<now()))
  ) SELECT COALESCE((SELECT json_agg(page_rows) FROM (
    SELECT * FROM filtered ORDER BY due_at,id LIMIT $3 OFFSET $4
  ) page_rows),'[]'::json) AS items,(SELECT count(*)::int FROM filtered) AS total`, [company, input.filter, input.page_size, (input.page - 1) * input.page_size]);
    res.json({ ...result.rows[0], page: input.page, pageSize: input.page_size });
});
router.get('/clients/:id', async (req, res) => {
    const company = tenant(req), id = z.uuid().parse(req.params.id);
    const result = await pool.query(`WITH ${clientMetrics}
    SELECT * FROM client_metrics WHERE id=$2`, [company, id]);
    ensure(result.rowCount, 404, 'Cliente não encontrado.');
    const [pets, appointments, contacts, tasks, settings] = await Promise.all([
        pool.query(`SELECT id,name,species,breed FROM pets WHERE tenant_id=$1 AND tutor_id=$2 ORDER BY name,id`, [company, id]),
        pool.query(`SELECT a.id,a.starts_at,a.status,p.name AS pet_name,pr.name AS professional_name,
      COALESCE((SELECT array_agg(s.name ORDER BY aps.position)
        FROM appointment_services aps JOIN services s ON s.tenant_id=aps.tenant_id AND s.id=aps.service_id
        WHERE aps.tenant_id=a.tenant_id AND aps.appointment_id=a.id),'{}'::text[]) AS service_names
      FROM appointments a JOIN pets p ON p.tenant_id=a.tenant_id AND p.id=a.pet_id
      JOIN professionals pr ON pr.tenant_id=a.tenant_id AND pr.id=a.professional_id
      WHERE a.tenant_id=$1 AND a.tutor_id=$2 ORDER BY a.starts_at DESC,a.id DESC LIMIT 10`, [company, id]),
        pool.query(`SELECT c.id,c.tutor_id,c.channel,c.summary,c.occurred_at,c.created_at,u.name AS created_by_name
      FROM crm_contacts c JOIN memberships m ON m.tenant_id=c.tenant_id AND m.user_id=c.created_by
      JOIN users u ON u.id=m.user_id
      WHERE c.tenant_id=$1 AND c.tutor_id=$2 ORDER BY c.occurred_at DESC,c.id DESC LIMIT 50`, [company, id]),
        pool.query(`SELECT ${taskColumns} ${taskJoins}
      WHERE k.tenant_id=$1 AND k.tutor_id=$2
      ORDER BY (k.status='open') DESC,k.due_at,k.id LIMIT 50`, [company, id]),
        pool.query('SELECT timezone FROM tenants WHERE id=$1', [company])
    ]);
    res.json({ client: result.rows[0], pets: pets.rows, appointments: appointments.rows,
        contacts: contacts.rows, tasks: tasks.rows, timezone: settings.rows[0].timezone });
});
router.post('/clients/:id/contacts', async (req, res) => {
    const company = tenant(req), id = z.uuid().parse(req.params.id);
    const input = contactInput.parse(req.body);
    const result = await pool.query(`WITH inserted AS (
    INSERT INTO crm_contacts(tenant_id,tutor_id,channel,summary,occurred_at,created_by)
    SELECT tenant_id,id,$3,$4,$5,$6 FROM tutors WHERE tenant_id=$1 AND id=$2
    RETURNING *
  ) SELECT c.id,c.tutor_id,c.channel,c.summary,c.occurred_at,c.created_at,u.name AS created_by_name
    FROM inserted c JOIN users u ON u.id=c.created_by`, [company, id, input.channel, input.summary, input.occurred_at, req.access.userId]);
    ensure(result.rowCount, 404, 'Cliente não encontrado.');
    res.status(201).json(result.rows[0]);
});
router.post('/clients/:id/tasks', async (req, res) => {
    const company = tenant(req), id = z.uuid().parse(req.params.id);
    const input = taskInput.parse(req.body);
    const result = await pool.query(`WITH inserted AS (
    INSERT INTO crm_tasks(tenant_id,tutor_id,title,notes,due_at,created_by)
    SELECT tenant_id,id,$3,$4,$5,$6 FROM tutors WHERE tenant_id=$1 AND id=$2
    RETURNING *
  ) SELECT ${taskColumns} FROM inserted k
    JOIN tutors t ON t.tenant_id=k.tenant_id AND t.id=k.tutor_id
    JOIN users u ON u.id=k.created_by`, [company, id, input.title, input.notes, input.due_at, req.access.userId]);
    ensure(result.rowCount, 404, 'Cliente não encontrado.');
    res.status(201).json(result.rows[0]);
});
router.patch('/tasks/:id', async (req, res) => {
    const company = tenant(req), id = z.uuid().parse(req.params.id);
    const input = statusInput.parse(req.body);
    const result = await pool.query(`WITH changed AS (
    UPDATE crm_tasks SET status=$3,updated_at=now(),
      completed_at=CASE WHEN $3='done' THEN COALESCE(completed_at,now()) ELSE NULL END
    WHERE tenant_id=$1 AND id=$2 RETURNING *
  ) SELECT ${taskColumns} FROM changed k
    JOIN tutors t ON t.tenant_id=k.tenant_id AND t.id=k.tutor_id
    JOIN users u ON u.id=k.created_by`, [company, id, input.status]);
    ensure(result.rowCount, 404, 'Tarefa não encontrada.');
    res.json(result.rows[0]);
});
export default router;
