-- Produtos, estoque, comandas e fluxo financeiro operacional por empresa.
-- Esta migration nao cobra cartoes e nao modifica cadastros existentes.
CREATE TABLE business_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  sku text NOT NULL DEFAULT '' CHECK(length(sku)<=80), unit text NOT NULL DEFAULT 'un.' CHECK(length(trim(unit)) BETWEEN 1 AND 20),
  price_cents integer NOT NULL CHECK(price_cents BETWEEN 0 AND 1000000000),
  cost_cents integer NOT NULL DEFAULT 0 CHECK(cost_cents BETWEEN 0 AND 1000000000),
  min_stock integer NOT NULL DEFAULT 0 CHECK(min_stock BETWEEN 0 AND 1000000),
  stock_quantity integer NOT NULL DEFAULT 0 CHECK(stock_quantity BETWEEN 0 AND 1000000),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX business_product_sku ON business_products(tenant_id,lower(sku)) WHERE sku<>'';
CREATE INDEX business_product_names ON business_products(tenant_id,lower(name),id);

CREATE TABLE business_cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
  opening_cents integer NOT NULL CHECK(opening_cents BETWEEN 0 AND 1000000000),
  counted_cents integer CHECK(counted_cents BETWEEN 0 AND 1000000000),
  expected_cents bigint, difference_cents bigint,
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), closing_notes text NOT NULL DEFAULT '' CHECK(length(closing_notes)<=2000),
  opened_by uuid NOT NULL, closed_by uuid,
  FOREIGN KEY(tenant_id,opened_by) REFERENCES memberships(tenant_id,user_id),
  FOREIGN KEY(tenant_id,closed_by) REFERENCES memberships(tenant_id,user_id),
  CHECK((closed_at IS NULL AND closed_by IS NULL AND counted_cents IS NULL AND expected_cents IS NULL AND difference_cents IS NULL)
    OR (closed_at IS NOT NULL AND closed_by IS NOT NULL AND counted_cents IS NOT NULL AND expected_cents IS NOT NULL AND difference_cents IS NOT NULL)),
  UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX business_one_open_cash ON business_cash_sessions(tenant_id) WHERE closed_at IS NULL;
CREATE INDEX business_cash_recent ON business_cash_sessions(tenant_id,opened_at DESC,id);

CREATE TABLE business_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  tutor_id uuid, appointment_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','cancelled')),
  subtotal_cents integer NOT NULL CHECK(subtotal_cents BETWEEN 0 AND 1000000000),
  discount_cents integer NOT NULL DEFAULT 0 CHECK(discount_cents>=0 AND discount_cents<=subtotal_cents),
  total_cents integer NOT NULL CHECK(total_cents=subtotal_cents-discount_cents),
  due_date date NOT NULL, notes text NOT NULL DEFAULT '' CHECK(length(notes)<=3000),
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz, cancellation_reason text NOT NULL DEFAULT '' CHECK(length(cancellation_reason)<=1000),
  FOREIGN KEY(tenant_id,tutor_id) REFERENCES tutors(tenant_id,id),
  FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
  CHECK((status='cancelled')=(cancelled_at IS NOT NULL)), UNIQUE(tenant_id,id), UNIQUE(tenant_id,appointment_id)
);
CREATE INDEX business_sales_recent ON business_sales(tenant_id,created_at DESC,id);
CREATE INDEX business_sales_tutor ON business_sales(tenant_id,tutor_id);
CREATE INDEX business_sales_due ON business_sales(tenant_id,due_date) WHERE status='open';

CREATE TABLE business_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sale_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('product','service')), product_id uuid, service_id uuid,
  description text NOT NULL CHECK(length(description) BETWEEN 1 AND 200),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000000),
  unit_price_cents integer NOT NULL CHECK(unit_price_cents BETWEEN 0 AND 1000000000),
  total_cents integer NOT NULL CHECK(total_cents>=0 AND total_cents::bigint=quantity::bigint*unit_price_cents::bigint),
  CHECK((kind='product' AND product_id IS NOT NULL AND service_id IS NULL) OR (kind='service' AND service_id IS NOT NULL AND product_id IS NULL)),
  FOREIGN KEY(tenant_id,sale_id) REFERENCES business_sales(tenant_id,id),
  FOREIGN KEY(tenant_id,product_id) REFERENCES business_products(tenant_id,id),
  FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id), UNIQUE(tenant_id,id)
);
CREATE INDEX business_items_sale ON business_sale_items(tenant_id,sale_id,id);

CREATE TABLE business_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  category text NOT NULL CHECK(category IN ('supplies','rent','payroll','utilities','other')),
  amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000), due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','paid','cancelled')),
  notes text NOT NULL DEFAULT '' CHECK(length(notes)<=3000), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz, payment_method text CHECK(payment_method IN ('pix','cash','credit_card','debit_card','other')),
  cancelled_at timestamptz, cancellation_reason text NOT NULL DEFAULT '' CHECK(length(cancellation_reason)<=1000),
  FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
  CHECK((paid_at IS NULL)=(payment_method IS NULL)), CHECK((status='paid')=(paid_at IS NOT NULL AND cancelled_at IS NULL)),
  CHECK((status='cancelled')=(cancelled_at IS NOT NULL)), UNIQUE(tenant_id,id)
);
CREATE INDEX business_expenses_due ON business_expenses(tenant_id,due_date,id);

CREATE TABLE business_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, sale_id uuid, expense_id uuid,
  kind text NOT NULL CHECK(kind IN ('sale_payment','sale_refund','expense_payment','expense_refund')),
  amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000),
  payment_method text NOT NULL CHECK(payment_method IN ('pix','cash','credit_card','debit_card','other')),
  cash_session_id uuid, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((payment_method='cash')=(cash_session_id IS NOT NULL)),
  CHECK((kind IN ('sale_payment','sale_refund') AND sale_id IS NOT NULL AND expense_id IS NULL)
    OR (kind IN ('expense_payment','expense_refund') AND expense_id IS NOT NULL AND sale_id IS NULL)),
  FOREIGN KEY(tenant_id,sale_id) REFERENCES business_sales(tenant_id,id),
  FOREIGN KEY(tenant_id,expense_id) REFERENCES business_expenses(tenant_id,id),
  FOREIGN KEY(tenant_id,cash_session_id) REFERENCES business_cash_sessions(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id), UNIQUE(tenant_id,id)
);
CREATE INDEX business_ledger_dates ON business_ledger(tenant_id,created_at,id);
CREATE INDEX business_ledger_sale ON business_ledger(tenant_id,sale_id,id);
CREATE INDEX business_ledger_expense ON business_ledger(tenant_id,expense_id,id);
CREATE INDEX business_ledger_cash ON business_ledger(tenant_id,cash_session_id,id);

CREATE TABLE business_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, product_id uuid NOT NULL, sale_id uuid,
  quantity_delta integer NOT NULL CHECK(quantity_delta<>0 AND quantity_delta BETWEEN -1000000 AND 1000000),
  balance_after integer NOT NULL CHECK(balance_after BETWEEN 0 AND 1000000),
  reason text NOT NULL CHECK(reason IN ('initial','purchase','usage','adjustment','sale','sale_cancel')),
  note text NOT NULL DEFAULT '' CHECK(length(note)<=2000), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(tenant_id,product_id) REFERENCES business_products(tenant_id,id),
  FOREIGN KEY(tenant_id,sale_id) REFERENCES business_sales(tenant_id,id),
  FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
  UNIQUE(tenant_id,id)
);
CREATE INDEX business_stock_recent ON business_stock_movements(tenant_id,created_at DESC,id);
CREATE INDEX business_stock_product ON business_stock_movements(tenant_id,product_id,created_at DESC,id);

-- A resposta original permite repetir uma requisicao apos falha de rede sem
-- duplicar estoque, recebimento, despesa, estorno ou abertura de caixa.
CREATE TABLE business_operations (
  tenant_id uuid NOT NULL REFERENCES tenants(id), idempotency_key uuid NOT NULL,
  kind text NOT NULL, payload_hash text NOT NULL, response jsonb NOT NULL,
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,idempotency_key), FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id)
);

-- Saldos sao modificados exclusivamente pelas rotinas transacionais da API.
-- Lancamentos financeiros sao append-only: compensacoes usam novas linhas.
CREATE FUNCTION business_ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial ledger entries are immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER business_ledger_no_update BEFORE UPDATE ON business_ledger FOR EACH ROW EXECUTE FUNCTION business_ledger_immutable();
