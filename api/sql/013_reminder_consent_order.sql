-- A ordem de registro não pode depender de UUID aleatório ou de now(),
-- cujo valor é compartilhado por todos os eventos da mesma transação.
-- Os escritores de consentimento serializam alterações pela linha do tutor.
ALTER TABLE tutor_email_reminder_consent_events
  ADD COLUMN event_order bigint GENERATED ALWAYS AS IDENTITY;

CREATE UNIQUE INDEX tutor_email_reminder_consent_event_order_unique
  ON tutor_email_reminder_consent_events(event_order);

CREATE INDEX tutor_email_reminder_consent_latest
  ON tutor_email_reminder_consent_events(tenant_id,tutor_id,event_order DESC);
