import type { QueryResultRow } from 'pg';
import { pool } from './core.js';

// Etapa 18.38: simulacao SOMENTE LEITURA.
// Nao envia e-mails, nao usa o Resend e nao atualiza nenhuma tabela.
interface ReminderRow extends QueryResultRow {
  scheduled_for: Date | string;
  next_attempt_at: Date | string | null;
  starts_at: Date | string;
  appointment_status: string;
  tenant_active: boolean;
  email: string | null;
  attempt_count: number;
  claimed_by: string | null;
  claim_expires_at: Date | string | null;
  sent_at: Date | string | null;
  provider_message_id: string | null;
  unresolved_attempt: boolean;
}

const MAX_ATTEMPTS = 3;

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

async function main(): Promise<void> {
  console.log('PetCore — Simulacao de lembretes (SOMENTE LEITURA)');

  const { rows } = await pool.query<ReminderRow>(`
    SELECT
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
    WHERE r.state = 'queued'
    ORDER BY COALESCE(r.next_attempt_at, r.scheduled_for)
    LIMIT 100
  `);

  const now = Date.now();
  const stats = {
    future: 0,
    due: 0,
    missingEmail: 0,
    fictionalEmail: 0,
    invalidEmail: 0,
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

  for (const job of rows) {
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
      validEmail(email) && !job.claimed_by && !job.unresolved_attempt &&
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
  console.log('Consentimento do tutor ainda nao foi implementado/verificado.');
  console.log('MODO SIMULACAO: nenhum e-mail enviado; nenhuma alteracao no banco.');
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
