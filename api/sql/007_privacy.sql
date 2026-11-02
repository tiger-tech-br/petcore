-- Atendimento de direitos: nenhuma autorização geral substitui a análise do controlador.
ALTER TABLE tutors ADD COLUMN anonymized_at timestamptz;

CREATE TABLE privacy_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 tutor_id uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('access','correction','anonymization','opposition','portability','other')),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','rejected')),
 description text NOT NULL CHECK (length(trim(description)) BETWEEN 3 AND 3000),
 identity_verified boolean NOT NULL DEFAULT false,
 verification_method text CHECK (verification_method IN ('in_person','existing_contact','document_checked','other')),
 identity_verified_by uuid, identity_verified_at timestamptz,
 resolution text NOT NULL DEFAULT '' CHECK (length(resolution)<=3000),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz,
 CHECK (identity_verified = (identity_verified_at IS NOT NULL AND identity_verified_by IS NOT NULL AND verification_method IS NOT NULL)),
 CHECK ((status IN ('completed','rejected')) = (resolved_at IS NOT NULL)),
 FOREIGN KEY (tenant_id,tutor_id) REFERENCES tutors(tenant_id,id),
 FOREIGN KEY (tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 FOREIGN KEY (tenant_id,identity_verified_by) REFERENCES memberships(tenant_id,user_id),
 UNIQUE (tenant_id,id)
);
CREATE TABLE privacy_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 request_id uuid NOT NULL, actor_user_id uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('created','identity_verified','updated','exported','anonymized')),
 status text NOT NULL CHECK (status IN ('open','in_progress','completed','rejected')),
 reason_code text CHECK (reason_code IN ('subject_request','purpose_ended','unlawful_processing','other')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,request_id) REFERENCES privacy_requests(tenant_id,id),
 FOREIGN KEY (tenant_id,actor_user_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE TABLE object_deletion_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 request_id uuid NOT NULL, object_key text NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','processing','done','failed')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
 next_attempt_at timestamptz NOT NULL DEFAULT now(), claimed_by uuid, claimed_at timestamptz,
 last_error_code text, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 CHECK (object_key LIKE 'tenants/' || tenant_id::text || '/%'),
 CHECK ((state='done')=(finished_at IS NOT NULL)),
 FOREIGN KEY (tenant_id,request_id) REFERENCES privacy_requests(tenant_id,id),
 UNIQUE (tenant_id,object_key)
);
CREATE INDEX idx_privacy_requests_inbox ON privacy_requests(tenant_id,status,created_at DESC,id);
CREATE INDEX idx_privacy_requests_tutor ON privacy_requests(tenant_id,tutor_id,created_at DESC);
CREATE INDEX idx_privacy_events_request ON privacy_request_events(tenant_id,request_id,created_at,id);
CREATE INDEX idx_object_deletion_jobs_due ON object_deletion_jobs(next_attempt_at,id) WHERE state IN ('queued','processing');
