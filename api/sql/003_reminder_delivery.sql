-- PetCore SaaS | Etapa 18.36
-- Estrutura de controle para futuros envios de lembretes por e-mail.
-- Esta migration NAO envia mensagens e NAO altera o estado dos lembretes existentes.

ALTER TABLE reminder_jobs
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by uuid,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Impede um contador negativo, inclusive em futuras alteracoes da aplicacao.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reminder_jobs_attempt_count_nonnegative'
      AND conrelid = 'reminder_jobs'::regclass
  ) THEN
    ALTER TABLE reminder_jobs
      ADD CONSTRAINT reminder_jobs_attempt_count_nonnegative
      CHECK (attempt_count >= 0);
  END IF;
END $$;

-- Registro de tentativas para auditoria e investigacao de falhas.
CREATE TABLE IF NOT EXISTS reminder_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  appointment_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'accepted', 'failed', 'uncertain')),
  provider_message_id text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  FOREIGN KEY (tenant_id, appointment_id)
    REFERENCES reminder_jobs(tenant_id, appointment_id),
  UNIQUE (tenant_id, appointment_id, attempt_number)
);

-- Consulta eficiente dos lembretes pendentes quando houver um worker.
CREATE INDEX IF NOT EXISTS idx_reminder_jobs_due
  ON reminder_jobs (COALESCE(next_attempt_at, scheduled_for))
  WHERE state = 'queued';

CREATE INDEX IF NOT EXISTS idx_reminder_delivery_attempts_job
  ON reminder_delivery_attempts (tenant_id, appointment_id, started_at DESC);
