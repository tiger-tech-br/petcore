-- Avisos transacionais de suporte; não alteram planos, pagamentos ou acesso.
-- Não há backfill: apenas mensagens criadas após esta implementação enfileiram avisos.
ALTER TABLE support_messages
 ADD CONSTRAINT support_messages_tenant_ticket_id_unique UNIQUE(tenant_id,ticket_id,id);

CREATE TABLE support_email_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,ticket_id uuid NOT NULL,message_id uuid NOT NULL,
 event_kind text NOT NULL CHECK(event_kind IN ('request_received','customer_message','platform_reply')),
 recipient_kind text NOT NULL CHECK(recipient_kind IN ('operator','requester')),
 recipient_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 recipient_email text NOT NULL DEFAULT '',
 payload_json jsonb,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent','failed','uncertain','cancelled')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5),
 first_attempt_at timestamptz,last_attempt_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 claimed_by uuid,claim_expires_at timestamptz,
 provider_message_id text,error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,
 FOREIGN KEY(tenant_id,ticket_id,message_id) REFERENCES support_messages(tenant_id,ticket_id,id) ON DELETE CASCADE,
 UNIQUE(message_id,recipient_kind),
 CHECK(payload_json IS NULL OR jsonb_typeof(payload_json)='object'),
 CHECK((state='sending')=(claimed_by IS NOT NULL AND claim_expires_at IS NOT NULL)),
 CHECK(state<>'sent' OR (sent_at IS NOT NULL AND provider_message_id IS NOT NULL)),
 CHECK(recipient_kind<>'operator' OR recipient_user_id IS NULL)
);
CREATE INDEX idx_support_email_notifications_due ON support_email_notifications(next_attempt_at,id)
 WHERE state IN ('queued','sending','failed');
CREATE INDEX idx_support_email_notifications_ticket ON support_email_notifications(tenant_id,ticket_id,created_at DESC);
