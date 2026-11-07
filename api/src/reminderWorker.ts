import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { Resend } from 'resend';
import { pool } from './core.js';

// Etapa 18.58: simulacao SOMENTE LEITURA como padrao.
// --test-resend envia APENAS a delivered@resend.dev, com texto generico.
// Nenhum modo atual altera o PostgreSQL ou envia mensagens aos tutores.
// Ainda NAO e um worker de producao ou um disparador automatico.
interface ReminderRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  appointment_id: string;
  scheduled_for: Date | string;
  next_attempt_at: Date | string | null;
  starts_at: Date | string;
  appointment_status: string;
  tenant_active: boolean;
  email: string | null;
  email_reminders_opt_in: boolean;
  email_reminders_opt_in_at: Date | string | null;
  email_reminders_opt_in_by: string | null;
  latest_consent_action: string | null;
  latest_consent_email: string | null;
  attempt_count: number;
  claimed_by: string | null;
  claim_expires_at: Date | string | null;
  sent_at: Date | string | null;
  provider_message_id: string | null;
  unresolved_attempt: boolean;
}

const MAX_ATTEMPTS = 3;
const TEST_EMAIL = 'delivered@resend.dev';
const TEST_MODE = process.argv.includes('--test-resend');
const PROBE_CLAIM_MODE = process.argv.includes('--probe-claim');

function validEmail(email: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.split('@')[1].toLowerCase();
  if (/^(?:.*\.)?example\.(?:com|net|org)$/.test(domain)) return false;
  if (/(?:^|\.)(?:test|invalid|localhost)$/.test(domain)) return false;
  return true;
}

function isFictionalEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return /^(?:.*\.)?example\.(?:com|net|org)$/.test(domain) ||
    /(?:^|\.)(?:test|invalid|localhost)$/.test(domain);
}

async function getJobs(jobId: string | null = null): Promise<ReminderRow[]> {
  const { rows } = await pool.query<ReminderRow>(`
    SELECT
      r.id,
      r.scheduled_for,
      r.next_attempt_at,
      r.attempt_count,
      r.claimed_by,
      r.claim_expires_at,
      r.sent_at,
      r.provider_message_id,
      a.starts_at,
      a.status AS appointment_status,
      t.active AS tenant_active,
      tu.email,
      tu.email_reminders_opt_in,
      tu.email_reminders_opt_in_at,
      tu.email_reminders_opt_in_by,
      consent.action AS latest_consent_action,
      consent.email AS latest_consent_email,
      EXISTS (
        SELECT 1
        FROM reminder_delivery_attempts da
        WHERE da.tenant_id = r.tenant_id
          AND da.appointment_id = r.appointment_id
          AND da.status IN ('started', 'accepted', 'uncertain')
      ) AS unresolved_attempt
    FROM reminder_jobs r
    JOIN appointments a
      ON a.id = r.appointment_id AND a.tenant_id = r.tenant_id
    JOIN tutors tu
      ON tu.id = a.tutor_id AND tu.tenant_id = a.tenant_id
    JOIN tenants t ON t.id = r.tenant_id
    LEFT JOIN LATERAL (
      SELECT e.action, e.email
      FROM tutor_email_reminder_consent_events e
      WHERE e.tenant_id = tu.tenant_id
        AND e.tutor_id = tu.id
      ORDER BY e.event_order DESC
      LIMIT 1
    ) consent ON TRUE
    WHERE r.state = 'queued'
      AND ($1::uuid IS NULL OR r.id = $1)
    ORDER BY COALESCE(r.next_attempt_at, r.scheduled_for)
    LIMIT 100
  `, [jobId]);
  return rows;
}

// Simulacao: exige consentimento e demais protecoes, mas permite testar
// um lembrete que ainda nao chegou ao horario de envio.
function eligibleForTest(job: ReminderRow, now: number): boolean {
  const dueTime = new Date(job.next_attempt_at ?? job.scheduled_for).getTime();
  const startTime = new Date(job.starts_at).getTime();
  const email = String(job.email ?? '').trim().toLowerCase();
  const consentMatches = String(job.latest_consent_email ?? '').trim().toLowerCase() === email;
  return Number.isFinite(dueTime) && Number.isFinite(startTime) &&
    startTime > now && job.tenant_active === true &&
    ['pending', 'confirmed'].includes(job.appointment_status) &&
    validEmail(email) && job.email_reminders_opt_in === true &&
    job.latest_consent_action === 'granted' &&
    job.email_reminders_opt_in_at != null &&
    job.email_reminders_opt_in_by != null && consentMatches &&
    !job.claimed_by && !job.unresolved_attempt &&
    !job.sent_at && !job.provider_message_id && job.attempt_count < MAX_ATTEMPTS;
}

async function sendSafeTest(jobId: string): Promise<void> {
  // Reconsulta a fila e a autorizacao imediatamente antes do envio de TESTE.
  const fresh = (await getJobs(jobId))[0];
  if (!fresh || !eligibleForTest(fresh, Date.now())) {
    console.log('Teste bloqueado: lembrete ou autorizacao nao estao mais validos.');
    return;
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from || /SEU_DOMINIO_VERIFICADO/i.test(from)) {
    throw Error('Configure RESEND_API_KEY e RESEND_FROM_EMAIL no .env do PetCore.');
  }
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send(
    {
      from,
      to: [TEST_EMAIL], // FIXO: nunca usar o e-mail do tutor neste teste.
      subject: 'PetCore - Teste controlado de lembrete',
      text: 'Teste tecnico do PetCore e da Tiger Tech. Nenhum tutor recebeu esta mensagem.',
    },
    { idempotencyKey: `petcore-reminder-test/${fresh.id}` },
  );
  if (error) {
    // Nao imprimir dados pessoais ou credenciais em logs.
    throw Error(`Resend recusou o teste (${error.name}).`);
  }
  console.log('Resend aceitou a solicitacao de TESTE.');
  console.log('Destinatario de simulacao:', TEST_EMAIL);
  console.log('ID retornado pelo Resend:', data?.id ?? 'nao informado');
  console.log('Nenhum lembrete real foi marcado como enviado.');
}

// TESTE DE CONCORRENCIA (sem e-mail e sem persistir alteracoes).
// --probe-claim: escolhe um lembrete FUTURO autorizado e simula um claim
// com FOR UPDATE SKIP LOCKED, update e tentativa, SEMPRE com ROLLBACK.
// O bypass de horario e apenas para o teste; nao habilita envio antecipado.
async function probeClaim(): Promise<void> {
  console.log('PetCore — Teste transacional de reserva (ROLLBACK obrigatorio)');
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const { rows } = await client.query<ReminderRow>(`
      SELECT
        r.id, r.tenant_id, r.appointment_id, r.scheduled_for,
        r.next_attempt_at, r.attempt_count, r.claimed_by,
        r.claim_expires_at, r.sent_at, r.provider_message_id,
        a.starts_at, a.status AS appointment_status,
        t.active AS tenant_active, tu.email,
        tu.email_reminders_opt_in, tu.email_reminders_opt_in_at,
        tu.email_reminders_opt_in_by,
        consent.action AS latest_consent_action,
        consent.email AS latest_consent_email,
        EXISTS (
          SELECT 1 FROM reminder_delivery_attempts da
          WHERE da.tenant_id = r.tenant_id
            AND da.appointment_id = r.appointment_id
            AND da.status IN ('started', 'accepted', 'uncertain')
        ) AS unresolved_attempt
      FROM reminder_jobs r
      JOIN appointments a
        ON a.id = r.appointment_id AND a.tenant_id = r.tenant_id
      JOIN tutors tu
        ON tu.id = a.tutor_id AND tu.tenant_id = a.tenant_id
      JOIN tenants t ON t.id = r.tenant_id
      LEFT JOIN LATERAL (
        SELECT e.action, e.email
        FROM tutor_email_reminder_consent_events e
        WHERE e.tenant_id = tu.tenant_id AND e.tutor_id = tu.id
        ORDER BY e.event_order DESC
        LIMIT 1
      ) consent ON TRUE
      WHERE r.state = 'queued'
        AND COALESCE(r.next_attempt_at, r.scheduled_for) > now()
        AND a.starts_at > now()
        AND a.status IN ('pending', 'confirmed')
        AND t.active = TRUE
        AND tu.email_reminders_opt_in = TRUE
        AND tu.email_reminders_opt_in_at IS NOT NULL
        AND tu.email_reminders_opt_in_by IS NOT NULL
        AND consent.action = 'granted'
        AND LOWER(BTRIM(tu.email)) = LOWER(BTRIM(consent.email))
        AND r.claimed_by IS NULL
        AND r.sent_at IS NULL
        AND r.provider_message_id IS NULL
        AND r.attempt_count < $1
        AND NOT EXISTS (
          SELECT 1 FROM reminder_delivery_attempts da
          WHERE da.tenant_id = r.tenant_id
            AND da.appointment_id = r.appointment_id
            AND da.status IN ('started', 'accepted', 'uncertain')
        )
      ORDER BY COALESCE(r.next_attempt_at, r.scheduled_for)
      LIMIT 1
      FOR UPDATE OF r SKIP LOCKED
    `, [MAX_ATTEMPTS]);

    const job = rows[0];
    if (!job) {
      console.log('Nenhum lembrete futuro autorizado disponivel para o teste.');
      return;
    }
    if (!eligibleForTest(job, Date.now())) {
      console.log('Lembrete bloqueado na verificacao final de seguranca.');
      return;
    }

    const claimId = randomUUID();
    const result = await client.query<{ attempt_count: number }>(`
      UPDATE reminder_jobs
      SET claimed_by = $2,
          claim_expires_at = now() + interval '5 minutes',
          last_attempt_at = now(),
          attempt_count = attempt_count + 1
      WHERE id = $1
        AND state = 'queued'
        AND claimed_by IS NULL
      RETURNING attempt_count
    `, [job.id, claimId]);
    if (result.rowCount !== 1) throw Error('Nao foi possivel reservar o lembrete.');

    await client.query(`
      INSERT INTO reminder_delivery_attempts
        (tenant_id, appointment_id, attempt_number, status)
      VALUES ($1, $2, $3, 'started')
    `, [job.tenant_id, job.appointment_id, result.rows[0].attempt_count]);

    console.log('Bloqueio SKIP LOCKED: exercitado.');
    console.log('Reserva e tentativa de auditoria: simuladas na transacao.');
    console.log('Nao foi chamado o Resend.');
  } finally {
    try {
      if (transactionStarted) {
        await client.query('ROLLBACK');
        console.log('ROLLBACK concluido: nenhuma alteracao persistida.');
      }
    } finally {
      client.release();
    }
  }
}

async function main(): Promise<void> {
  if (PROBE_CLAIM_MODE && TEST_MODE) {
    throw Error('Execute --probe-claim e --test-resend separadamente.');
  }
  if (PROBE_CLAIM_MODE) {
    await probeClaim();
    return;
  }
  console.log('PetCore — Simulacao de lembretes (SOMENTE LEITURA)');
  const rows = await getJobs();
  const now = Date.now();
  const stats = {
    future: 0,
    due: 0,
    missingEmail: 0,
    fictionalEmail: 0,
    invalidEmail: 0,
    optInDisabled: 0,
    missingGrantEvidence: 0,
    consentEmailMismatch: 0,
    inactiveAppointment: 0,
    inactiveTenant: 0,
    pastAppointment: 0,
    claimed: 0,
    unsafePriorAttempt: 0,
    alreadySentInconsistent: 0,
    attemptLimit: 0,
    invalidDate: 0,
    technicallyEligible: 0,
  };

  let candidateId: string | null = null;
  for (const job of rows) {
    if (!candidateId && eligibleForTest(job, now)) candidateId = job.id;
    const dueTime = new Date(job.next_attempt_at ?? job.scheduled_for).getTime();
    const startTime = new Date(job.starts_at).getTime();
    const datesValid = Number.isFinite(dueTime) && Number.isFinite(startTime);

    if (!datesValid) stats.invalidDate++;
    else if (dueTime > now) stats.future++;
    else stats.due++;

    const email = String(job.email ?? '').trim().toLowerCase();
    if (!email) stats.missingEmail++;
    else if (isFictionalEmail(email)) stats.fictionalEmail++;
    else if (!validEmail(email)) stats.invalidEmail++;

    // Dupla verificacao: preferencia atual + historico da ultima decisao.
    // O registro precisa ser uma concessao associada ao MESMO endereco atual.
    const hasOptIn = job.email_reminders_opt_in === true;
    const hasGrantEvidence =
      job.latest_consent_action === 'granted' &&
      job.email_reminders_opt_in_at != null &&
      job.email_reminders_opt_in_by != null;
    const consentEmailMatches =
      email.length > 0 &&
      String(job.latest_consent_email ?? '').trim().toLowerCase() === email;
    const consentAuthorized = hasOptIn && hasGrantEvidence && consentEmailMatches;

    if (!hasOptIn) stats.optInDisabled++;
    else if (!hasGrantEvidence) stats.missingGrantEvidence++;
    else if (!consentEmailMatches) stats.consentEmailMismatch++;

    const inactiveAppointment = !['pending', 'confirmed'].includes(job.appointment_status);
    if (inactiveAppointment) stats.inactiveAppointment++;
    if (!job.tenant_active) stats.inactiveTenant++;
    if (datesValid && startTime <= now) stats.pastAppointment++;

    // Um claim anterior, mesmo expirado, exige revisao antes de um possivel reenvio.
    if (job.claimed_by) stats.claimed++;
    if (job.unresolved_attempt) stats.unsafePriorAttempt++;
    if (job.sent_at || job.provider_message_id) stats.alreadySentInconsistent++;
    if (job.attempt_count >= MAX_ATTEMPTS) stats.attemptLimit++;

    if (
      datesValid && dueTime <= now && startTime > now &&
      job.tenant_active && !inactiveAppointment &&
      validEmail(email) && consentAuthorized &&
      !job.claimed_by && !job.unresolved_attempt &&
      !job.sent_at && !job.provider_message_id &&
      job.attempt_count < MAX_ATTEMPTS
    ) {
      stats.technicallyEligible++;
    }
  }

  console.log('Lembretes pendentes consultados:', rows.length);
  console.log('Com horario de envio futuro:', stats.future);
  console.log('Com horario de envio atingido:', stats.due);
  console.log('Sem e-mail:', stats.missingEmail);
  console.log('Com e-mail ficticio:', stats.fictionalEmail);
  console.log('Com e-mail em formato invalido:', stats.invalidEmail);
  console.log('Sem autorizacao ativa:', stats.optInDisabled);
  console.log('Autorizacao ativa sem concessao comprovada:', stats.missingGrantEvidence);
  console.log('E-mail diferente do autorizado:', stats.consentEmailMismatch);
  console.log('Agendamentos inativos:', stats.inactiveAppointment);
  console.log('Empresas inativas:', stats.inactiveTenant);
  console.log('Agendamentos cujo horario ja passou:', stats.pastAppointment);
  console.log('Com processamento reivindicado:', stats.claimed);
  console.log('Com tentativa anterior nao resolvida:', stats.unsafePriorAttempt);
  console.log('Com indicio de envio ja aceito:', stats.alreadySentInconsistent);
  console.log('Com limite de tentativas atingido:', stats.attemptLimit);
  console.log('Com datas invalidas:', stats.invalidDate);
  console.log('Tecnicamente elegiveis para futura avaliacao:', stats.technicallyEligible);
  console.log('ATENCAO: os contadores de impedimentos podem se sobrepor.');
  console.log('Autorizacao avaliada com base no cadastro e no ultimo evento do tutor.');
  if (!TEST_MODE) {
    console.log('MODO SIMULACAO: nenhum e-mail enviado; nenhuma alteracao no banco.');
  } else if (!candidateId) {
    console.log('TESTE NAO EXECUTADO: nao ha lembrete futuro de tutor autorizado.');
  } else {
    console.log('Modo de teste explicito: somente', TEST_EMAIL);
    await sendSafeTest(candidateId);
  }
}

main()
  .catch((err: unknown) => {
    // Nao imprimir credenciais ou dados de destinatarios em logs de erro.
    console.error('Falha ao consultar a fila:', err instanceof Error ? err.message : 'erro desconhecido');
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
