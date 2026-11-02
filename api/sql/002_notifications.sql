-- PetCore - Etapa 18.1: notificações internas por usuário.
-- Aplicar APÓS 001_core.sql, via npm run db:migrate.
-- Eventos antigos permanecem no histórico; não são retroativamente notificados.

ALTER TABLE appointment_events
  ADD CONSTRAINT uq_appointment_events_tenant_id UNIQUE (tenant_id, id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_notifications_membership
    FOREIGN KEY (tenant_id, recipient_user_id)
    REFERENCES memberships (tenant_id, user_id),
  CONSTRAINT fk_notifications_event
    FOREIGN KEY (tenant_id, event_id)
    REFERENCES appointment_events (tenant_id, id),
  CONSTRAINT uq_notifications_recipient_event UNIQUE (tenant_id, recipient_user_id, event_id)
);

CREATE INDEX idx_notifications_inbox
  ON notifications (tenant_id, recipient_user_id, created_at DESC);
CREATE INDEX idx_notifications_unread
  ON notifications (tenant_id, recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;
