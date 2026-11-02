-- PetCore SaaS | Etapa 18.39
-- Preferencia de lembretes por e-mail. Sem envios de mensagens.
-- Cadastros anteriores permanecem desautorizados por padrao.

ALTER TABLE tutors
  ADD COLUMN IF NOT EXISTS email_reminders_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_reminders_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_reminders_opt_in_by uuid REFERENCES users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tutors_email_reminders_opt_in_consistency'
      AND conrelid = 'tutors'::regclass
  ) THEN
    ALTER TABLE tutors
      ADD CONSTRAINT tutors_email_reminders_opt_in_consistency
      CHECK (
        NOT email_reminders_opt_in OR (
          email IS NOT NULL AND length(trim(email)) > 0
          AND email_reminders_opt_in_at IS NOT NULL
          AND email_reminders_opt_in_by IS NOT NULL
        )
      );
  END IF;
END $$;

-- Historico de autorizacoes/revogacoes registradas pela equipe.
-- A equipe deve confirmar a manifestacao do tutor antes de registrar autorizacao.
CREATE TABLE IF NOT EXISTS tutor_email_reminder_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tutor_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  email text,
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, tutor_id) REFERENCES tutors(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_tutor_email_reminder_consent_events
  ON tutor_email_reminder_consent_events (tenant_id, tutor_id, created_at DESC);
