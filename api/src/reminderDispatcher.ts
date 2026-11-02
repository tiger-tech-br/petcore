/**
 * PetCore | Etapa 18.65 — processador de lembretes por e-mail.
 *
 * Uso padrao: leitura/simulacao, sem gravacao e sem envios.
 * Envio real exige DUAS travas de configuracao e --run-once.
 * Nao executar em producao ate concluir os testes de falhas/duplicidade.
 * O worker de simulacao (reminderWorker.ts) permanece INTACTO.
 */
import { randomUUID } from 'node:crypto';
import { Resend } from 'resend';
import type { PoolClient, QueryResultRow } from 'pg';
import { pool } from './core.js';

interface Job extends QueryResultRow {
  id: string;
  tenant_id: string;
  appointment_id: string;
  attempt_count: number;
  claimed_by: string | null;
  scheduled_for: Date | string;
  starts_at: Date | string;
  status: string;
  appointment_status: string;
  active: boolean;
  timezone: string;
  tutor_name: string;
  tutor_email: string | null;
  pet_name: string;
  company_name: string;
  email_reminders_opt_in: boolean;
  email_reminders_opt_in_at: Date | string | null;
  email_reminders_opt_in_by: string | null;
  consent_action: string | null;
  consent_email: string | null;
}

const MAX_ATTEMPTS = 3;
// Nao basta executar um comando: sao necessarias duas confirmacoes adicionais.
const REAL_SEND_ENABLED = process.env.REMINDER_EMAILS_ENABLED === 'true' &&
  process.env.REMINDER_EMAILS_CONFIRM_SEND === 'YES';
const RUN_ONCE = process.argv.includes('--run-once');

function validRecipient(raw: string | null): boolean {
  const email = (raw ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.split('@')[1];
  return !/^(?:.*\.)?example\.(?:com|net|org)$/.test(domain) &&
    !/(?:^|\.)(?:test|invalid|localhost)$/.test(domain);
}

function canSend(job: Job): boolean {
  const email = (job.tutor_email ?? '').trim().toLowerCase();
  const consent = (job.consent_email ?? '').trim().toLowerCase();
  return job.status === 'queued' &&
    job.active === true &&
    ['pending', 'confirmed'].includes(job.appointment_status) &&
    new Date(job.scheduled_for).getTime() <= Date.now() &&
    new Date(job.starts_at).getTime() > Date.now() &&
    validRecipient(email) &&
    job.email_reminders_opt_in === true &&
    job.email_reminders_opt_in_at != null &&
    job.email_reminders_opt_in_by != null &&
    job.consent_action === 'granted' &&
    email === consent &&
    job.attempt_count <= MAX_ATTEMPTS;
}

// Esta query eh usada na reserva E na revalidacao antes do envio.
// Cada join considera o tenant_id; em especial nunca mistura empresas.
const JOB_SQL = `
  SELECT r.id, r.tenant_id, r.appointment_id, r.attempt_count,
    r.claimed_by, r.scheduled_for, r.state AS status,
    a.starts_at, a.status AS appointment_status,
    t.active, t.timezone, t.name AS company_name,
    tu.name AS tutor_name, tu.email AS tutor_email,
    tu.email_reminders_opt_in, tu.email_reminders_opt_in_at,
    tu.email_reminders_opt_in_by, p.name AS pet_name,
    consent.action AS consent_action, consent.email AS consent_email
  FROM reminder_jobs r
  JOIN appointments a ON a.id=r.appointment_id AND a.tenant_id=r.tenant_id
  JOIN tenants t ON t.id=r.tenant_id
  JOIN tutors tu ON tu.id=a.tutor_id AND tu.tenant_id=a.tenant_id
  JOIN pets p ON p.id=a.pet_id AND p.tenant_id=a.tenant_id
  LEFT JOIN LATERAL (
    SELECT e.action, e.email
    FROM tutor_email_reminder_consent_events e
    WHERE e.tutor_id=tu.id AND e.tenant_id=tu.tenant_id
    ORDER BY e.created_at DESC, e.id DESC LIMIT 1
  ) consent ON true
`;

async function preview(): Promise<void> {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE state='queued')::int AS pending,
      COUNT(*) FILTER (
        WHERE state='queued' AND COALESCE(next_attempt_at,scheduled_for)<=now()
      )::int AS due,
      COUNT(*) FILTER (WHERE state='sent')::int AS sent,
      COUNT(*) FILTER (WHERE claimed_by IS NOT NULL)::int AS claims,
      COUNT(*) FILTER (WHERE state='failed')::int AS failed
    FROM reminder_jobs
  `);
  console.log('PetCore — pre-visualizacao da fila (SOMENTE LEITURA)');
  console.log('Fila:', result.rows[0]);
  console.log('Nenhuma escrita no banco. Nenhum e-mail enviado.');
}

// 1) Reserva atomica duravel. Nao reenvia jobs que tenham tentativa incerta.
async function claimOne(): Promise<{jobId:string; claimId:string} | null> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query<Job>(`
      ${JOB_SQL}
      WHERE r.state='queued'
        AND COALESCE(r.next_attempt_at,r.scheduled_for)<=now()
        AND a.starts_at>now()
        AND a.status IN ('pending','confirmed')
        AND t.active=TRUE
        AND tu.email_reminders_opt_in=TRUE
        AND tu.email_reminders_opt_in_at IS NOT NULL
        AND tu.email_reminders_opt_in_by IS NOT NULL
        AND consent.action='granted'
        AND LOWER(BTRIM(tu.email))=LOWER(BTRIM(consent.email))
        AND BTRIM(tu.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'
        AND SPLIT_PART(LOWER(BTRIM(tu.email)),'@',2)
          !~ '(^|\\.)example\\.(com|net|org)$|(^|\\.)(test|invalid|localhost)$'
        AND r.claimed_by IS NULL
        AND r.sent_at IS NULL
        AND r.provider_message_id IS NULL
        AND r.attempt_count<$1
        AND NOT EXISTS (
          SELECT 1 FROM reminder_delivery_attempts d
          WHERE d.tenant_id=r.tenant_id AND d.appointment_id=r.appointment_id
            AND d.status IN ('started','accepted','uncertain')
        )
      ORDER BY COALESCE(r.next_attempt_at,r.scheduled_for)
      LIMIT 1
      FOR UPDATE OF r SKIP LOCKED
    `, [MAX_ATTEMPTS]);
    const job=result.rows[0];
    if (!job || !canSend(job)) {
      await db.query('ROLLBACK');
      return null;
    }
    const claimId = randomUUID();
    const updated = await db.query<{attempt_count:number}>(`
      UPDATE reminder_jobs SET claimed_by=$2,
        claim_expires_at=now()+interval '5 minutes',
        last_attempt_at=now(),attempt_count=attempt_count+1
      WHERE id=$1 AND tenant_id=$3 AND state='queued' AND claimed_by IS NULL
      RETURNING attempt_count
    `,[job.id,claimId,job.tenant_id]);
    if (updated.rowCount !== 1) throw Error('Falha ao reservar lembrete');
    await db.query(`
      INSERT INTO reminder_delivery_attempts
       (tenant_id,appointment_id,attempt_number,status)
      VALUES ($1,$2,$3,'started')
    `,[job.tenant_id,job.appointment_id,updated.rows[0].attempt_count]);
    await db.query('COMMIT');
    return {jobId:job.id,claimId};
  } catch (e) {
    await db.query('ROLLBACK').catch(()=>{});
    throw e;
  } finally {db.release();}
}

async function finishBlocked(db:PoolClient,job:Job,reason:string):Promise<void>{
  await db.query(`
    UPDATE reminder_delivery_attempts SET status='failed',
      error_message=$4,finished_at=now()
    WHERE tenant_id=$1 AND appointment_id=$2 AND attempt_number=$3
      AND status='started'
  `,[job.tenant_id,job.appointment_id,job.attempt_count,reason]);
  await db.query(`
    UPDATE reminder_jobs SET state='cancelled',claimed_by=NULL,
      claim_expires_at=NULL,last_error=$3
    WHERE tenant_id=$1 AND appointment_id=$2
  `,[job.tenant_id,job.appointment_id,reason]);
}

// 2) Revalida com tutor/agendamento bloqueados enquanto realiza o envio.
// Mantem os locks enquanto aguarda a API: impede revogacao/cancelamento no meio.
// Se o processo morrer apos o envio, a tentativa 'started' bloqueia reenvio.
async function deliverOne(jobId:string, claimId:string):Promise<void>{
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const res=await db.query<Job>(`
      ${JOB_SQL}
      WHERE r.id=$1 AND r.claimed_by=$2
      FOR UPDATE OF r,a,tu,t
    `,[jobId,claimId]);
    const job=res.rows[0];
    if (!job) {
      await db.query('ROLLBACK');
      throw Error('Reserva nao encontrada; necessita revisao manual');
    }
    if (!canSend(job)) {
      await finishBlocked(db,job,'Regras do lembrete nao atendidas no momento do envio');
      await db.query('COMMIT');
      console.log('Lembrete cancelado antes do envio; nenhum email enviado.');
      return;
    }
    const key=process.env.RESEND_API_KEY;
    const from=process.env.RESEND_FROM_EMAIL;
    if (!key || !from || /SEU_DOMINIO_VERIFICADO/i.test(from)) {
      // Mantem a tentativa pendente: e preciso revisao manual antes de repetir.
      throw Error('Remetente/Resend nao configurado; revisar tentativa');
    }
    const sentTime = new Intl.DateTimeFormat('pt-BR', {
      timeZone:job.timezone,dateStyle:'short',timeStyle:'short',
    }).format(new Date(job.starts_at));
    const resend = new Resend(key);
    let providerId:string|null=null;
    let providerProblem:string|null=null;
    try {
      const response=await resend.emails.send({
        from,
        to:[job.tutor_email!.trim()],
        subject:`Lembrete de atendimento — ${job.company_name}`,
        text:`Ola, ${job.tutor_name}!\n\nO atendimento de ${job.pet_name} em ${job.company_name} esta agendado para ${sentTime}.\n\nEm caso de duvidas ou reagendamento, entre em contato com o pet shop.\n\nMensagem automatica pelo PetCore — tecnologia Tiger Tech.`,
      },{idempotencyKey:`petcore-reminder/${job.id}`});
      providerId=response.data?.id ?? null;
      providerProblem=response.error?.name ?? null;
    } catch {
      providerProblem='resend_network_or_unknown_error';
    }
    if (providerId) {
      await db.query(`
        UPDATE reminder_jobs SET state='sent',sent_at=now(),
          provider_message_id=$3,last_error=NULL,
          claimed_by=NULL,claim_expires_at=NULL
        WHERE tenant_id=$1 AND appointment_id=$2 AND claimed_by=$4
      `,[job.tenant_id,job.appointment_id,providerId,claimId]);
      await db.query(`
        UPDATE reminder_delivery_attempts
          SET status='accepted',provider_message_id=$4,finished_at=now()
        WHERE tenant_id=$1 AND appointment_id=$2
          AND attempt_number=$3 AND status='started'
      `,[job.tenant_id,job.appointment_id,job.attempt_count,providerId]);
      console.log('Resend aceitou o lembrete:',job.id);
    } else {
      // Falha sem confirmacao: NUNCA reenviar automaticamente.
      const reason=providerProblem ?? 'resend_sem_confirmacao';
      await db.query(`
        UPDATE reminder_jobs SET state='failed',last_error=$3,
          claimed_by=NULL,claim_expires_at=NULL
        WHERE tenant_id=$1 AND appointment_id=$2 AND claimed_by=$4
      `,[job.tenant_id,job.appointment_id,reason,claimId]);
      await db.query(`
        UPDATE reminder_delivery_attempts SET status='uncertain',
          error_message=$4,finished_at=now()
        WHERE tenant_id=$1 AND appointment_id=$2 AND attempt_number=$3
          AND status='started'
      `,[job.tenant_id,job.appointment_id,job.attempt_count,reason]);
      console.log('Falha ou resposta incerta: revisar no painel Resend antes de repetir.');
    }
    await db.query('COMMIT');
  } catch(e) {
    await db.query('ROLLBACK').catch(()=>{});
    // A reserva anterior fica marcada como 'started': nao ha reenvio automatico.
    throw e;
  } finally {db.release();}
}

async function main():Promise<void>{
  if (process.argv.some(x=>x.startsWith('--') && x !== '--run-once')) {
    throw Error('Opcao desconhecida; por seguranca nenhum envio foi iniciado.');
  }
  if (!RUN_ONCE) {
    await preview();
    return;
  }
  if (!REAL_SEND_ENABLED) {
    throw Error('Envio real bloqueado. Mantenha o modo de pre-visualizacao nesta etapa.');
  }
  const claimed=await claimOne();
  if (!claimed) {
    console.log('Nenhum lembrete autorizado chegou ao horario de envio.');
    return;
  }
  await deliverOne(claimed.jobId,claimed.claimId);
}

main().catch(e=>{
  console.error('Processador de lembretes:',e instanceof Error?e.message:'erro desconhecido');
  process.exitCode=1;
}).finally(async()=>{await pool.end();});
