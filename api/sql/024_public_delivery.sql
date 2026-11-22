-- Public orders are requests. Stock and accounting change only on confirmation.
ALTER TABLE business_products ADD COLUMN public_catalog_visible boolean NOT NULL DEFAULT false;
CREATE TABLE public_delivery_settings (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
 enabled boolean NOT NULL DEFAULT false,
 public_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex') UNIQUE CHECK(public_token ~ '^[a-f0-9]{48}$'),
 coverage_note text NOT NULL DEFAULT '' CHECK(length(coverage_note)<=600),
 notice text NOT NULL DEFAULT '' CHECK(length(notice)<=600),
 delivery_fee_cents integer CHECK(delivery_fee_cents BETWEEN 0 AND 1000000000),
 updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public_delivery_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 receipt text NOT NULL DEFAULT encode(gen_random_bytes(20),'hex') UNIQUE CHECK(receipt ~ '^[a-f0-9]{40}$'),
 idempotency_key uuid NOT NULL, payload_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
 customer_name text NOT NULL CHECK(length(trim(customer_name)) BETWEEN 2 AND 160),
 phone text NOT NULL CHECK(phone ~ '^\+?[0-9]{10,15}$'),
 address text NOT NULL CHECK(length(trim(address)) BETWEEN 8 AND 600),
 reference text NOT NULL DEFAULT '' CHECK(length(reference)<=300),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000),
 subtotal_cents integer NOT NULL CHECK(subtotal_cents BETWEEN 0 AND 1000000000),
 quoted_delivery_fee_cents integer CHECK(quoted_delivery_fee_cents BETWEEN 0 AND 1000000000),
 delivery_order_id uuid, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 rejection_reason text NOT NULL DEFAULT '' CHECK(length(rejection_reason)<=300),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,delivery_order_id) REFERENCES business_delivery_orders(tenant_id,id),
 CHECK((status='pending' AND delivery_order_id IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL)
  OR (status='confirmed' AND delivery_order_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  OR (status='rejected' AND delivery_order_id IS NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE public_delivery_request_items (
 tenant_id uuid NOT NULL, request_id uuid NOT NULL, product_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 20),
 name text NOT NULL CHECK(length(name)<=160), unit text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000),
 unit_price_cents integer NOT NULL CHECK(unit_price_cents BETWEEN 0 AND 1000000000),
 PRIMARY KEY(tenant_id,request_id,product_id), UNIQUE(tenant_id,request_id,position),
 FOREIGN KEY(tenant_id,request_id) REFERENCES public_delivery_requests(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,product_id) REFERENCES business_products(tenant_id,id)
);
CREATE INDEX public_delivery_inbox ON public_delivery_requests(tenant_id,status,created_at DESC,id);
CREATE INDEX public_delivery_cleanup ON public_delivery_requests(created_at);
