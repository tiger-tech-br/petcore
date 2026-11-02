-- CRM de relacionamento: reutiliza os tutores existentes, sem duplicar clientes.
-- Migration aditiva: nao altera cadastros, consentimentos ou lembretes.
CREATE TABLE crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tutor_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','phone','email','in_person','other')),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 3000),
  occurred_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,tutor_id) REFERENCES tutors(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
  UNIQUE (tenant_id,id)
);

CREATE TABLE crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tutor_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 3000),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((status='done') = (completed_at IS NOT NULL)),
  FOREIGN KEY (tenant_id,tutor_id) REFERENCES tutors(tenant_id,id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
  UNIQUE (tenant_id,id)
);

CREATE INDEX idx_crm_contacts_client
  ON crm_contacts(tenant_id,tutor_id,occurred_at DESC,id DESC);
CREATE INDEX idx_crm_tasks_client
  ON crm_tasks(tenant_id,tutor_id,created_at DESC,id DESC);
CREATE INDEX idx_crm_tasks_pending
  ON crm_tasks(tenant_id,due_at,id) WHERE status='open';
CREATE INDEX idx_crm_tasks_status
  ON crm_tasks(tenant_id,status,due_at,id);
CREATE INDEX idx_appointments_crm_client
  ON appointments(tenant_id,tutor_id,starts_at DESC);
CREATE INDEX idx_pets_crm_client ON pets(tenant_id,tutor_id);
