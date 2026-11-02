-- Platform operations, legal publication, subscription control and audit history.
CREATE TABLE audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
 actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 action text NOT NULL CHECK(length(action) BETWEEN 1 AND 100),
 entity_type text,entity_id uuid,metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_date ON audit_events(tenant_id,created_at DESC,id DESC);

CREATE TABLE commercial_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 brand text NOT NULL DEFAULT 'Tiger Tech',legal_name text,support_email text,privacy_email text,address text,
 privacy_text text NOT NULL DEFAULT '',terms_text text NOT NULL DEFAULT '',
 published boolean NOT NULL DEFAULT false,legal_version text NOT NULL DEFAULT 'draft',effective_date date,
 subprocessors jsonb NOT NULL DEFAULT '[]',trial_days integer NOT NULL DEFAULT 30 CHECK(trial_days BETWEEN 0 AND 90),
 grace_days integer NOT NULL DEFAULT 3 CHECK(grace_days BETWEEN 0 AND 30),
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO commercial_settings(singleton) VALUES(true);

CREATE TABLE subscription_plans (
 id text PRIMARY KEY CHECK(id IN ('monthly','yearly')),name text NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 99999999),
 interval_months integer NOT NULL CHECK(interval_months IN (1,12)),checkout_url text,checkout_reviewed boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO subscription_plans(id,name,amount_cents,interval_months) VALUES
 ('monthly','PetCore Mensal',3500,1),('yearly','PetCore Anual',35000,12);
-- Supplied links have matching amounts but still show another product name.
-- They remain drafts until the operator checks the PetCore description in PagBank.
UPDATE subscription_plans SET checkout_url='https://pag.ae/82ixDFWsJ' WHERE id='monthly';
UPDATE subscription_plans SET checkout_url='https://pag.ae/82ixDhLCJ' WHERE id='yearly';

CREATE TABLE tenant_subscriptions (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 plan_id text NOT NULL DEFAULT 'monthly' REFERENCES subscription_plans(id),
 status text NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','pending','active','suspended','cancelled')),
 onboarding_completed_at timestamptz,trial_started_at timestamptz,
 onboarding_plan text CHECK(onboarding_plan IN ('free','monthly','yearly')),
 trial_ends_at timestamptz NOT NULL DEFAULT now()+interval '30 days',paid_through timestamptz,
 suspension_reason text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tenant_subscriptions(tenant_id) SELECT id FROM tenants;

CREATE TABLE subscription_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 plan_id text NOT NULL REFERENCES subscription_plans(id),amount_cents integer NOT NULL CHECK(amount_cents>0),
 provider text NOT NULL DEFAULT 'pagbank',provider_reference text NOT NULL CHECK(length(trim(provider_reference)) BETWEEN 3 AND 160),
 period_start timestamptz NOT NULL,period_end timestamptz NOT NULL CHECK(period_end>period_start),
 received_at timestamptz NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now(),
 recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,idempotency_key uuid NOT NULL,
 voided_at timestamptz,voided_by uuid REFERENCES users(id) ON DELETE SET NULL,void_reason text,
 UNIQUE(provider,provider_reference),UNIQUE(tenant_id,idempotency_key),UNIQUE(tenant_id,id)
);
CREATE INDEX idx_subscription_payments_tenant ON subscription_payments(tenant_id,recorded_at DESC);

CREATE TABLE terms_acceptances (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,version text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,version)
);

CREATE TABLE support_tickets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,subject text NOT NULL CHECK(length(trim(subject)) BETWEEN 3 AND 160),
 category text NOT NULL CHECK(category IN ('access','billing','technical','privacy','other')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,id)
);
CREATE TABLE support_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,ticket_id uuid NOT NULL,
 actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,from_platform boolean NOT NULL DEFAULT false,
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,ticket_id) REFERENCES support_tickets(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX idx_support_tenant_date ON support_tickets(tenant_id,updated_at DESC,id DESC);

CREATE TABLE backup_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 state text NOT NULL DEFAULT 'started' CHECK(state IN ('started','uploaded','verified','failed')),
 object_key text,sha256 text,size_bytes bigint,error_code text,verified_at timestamptz
);
