-- Entregas internas vinculadas a uma única comanda; estoque e recebimentos
-- continuam exclusivamente nas rotinas comerciais existentes.
ALTER TABLE tenants ADD COLUMN delivery_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE business_sales ADD COLUMN delivery_fee_cents integer NOT NULL DEFAULT 0
 CHECK(delivery_fee_cents BETWEEN 0 AND 1000000000);
ALTER TABLE business_sales DROP CONSTRAINT business_sales_check1;
ALTER TABLE business_sales ADD CONSTRAINT business_sales_total_cents_check
 CHECK(total_cents BETWEEN 0 AND 1000000000 AND total_cents=subtotal_cents-discount_cents+delivery_fee_cents);

CREATE TABLE business_delivery_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), sale_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','out_for_delivery','delivered','cancelled')),
 -- Empty contact fields allow the existing subject anonymization workflow.
 address text NOT NULL CHECK(length(address)<=600),
 phone text NOT NULL CHECK(phone='' OR phone ~ '^\+?[0-9]{10,15}$'),
 reference text NOT NULL DEFAULT '' CHECK(length(reference)<=300),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),
 cancellation_reason text NOT NULL DEFAULT '' CHECK(length(cancellation_reason)<=1000),
 created_by uuid NOT NULL, updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 out_for_delivery_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz,
 FOREIGN KEY(tenant_id,sale_id) REFERENCES business_sales(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES memberships(tenant_id,user_id),
 CHECK((status='cancelled')=(cancelled_at IS NOT NULL)),
 CHECK(status NOT IN ('out_for_delivery','delivered') OR out_for_delivery_at IS NOT NULL),
 CHECK(status<>'delivered' OR delivered_at IS NOT NULL),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,sale_id)
);
CREATE INDEX business_deliveries_status ON business_delivery_orders(tenant_id,status,created_at DESC,id);

CREATE TABLE business_delivery_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, delivery_id uuid NOT NULL,
 old_status text CHECK(old_status IN ('preparing','out_for_delivery','delivered','cancelled')),
 new_status text NOT NULL CHECK(new_status IN ('preparing','out_for_delivery','delivered','cancelled')),
 reason text NOT NULL DEFAULT '' CHECK(length(reason)<=1000), actor_user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,delivery_id) REFERENCES business_delivery_orders(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE INDEX business_delivery_history ON business_delivery_events(tenant_id,delivery_id,created_at,id);
