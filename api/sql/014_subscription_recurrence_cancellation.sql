-- The operator confirms cancellation in the PagBank PF panel; this is not an API cancellation.
ALTER TABLE tenant_subscriptions
 ADD COLUMN recurrence_cancelled_at timestamptz,
 ADD COLUMN recurrence_cancellation_reference text,
 ADD COLUMN recurrence_cancelled_by uuid REFERENCES users(id) ON DELETE SET NULL,
 ADD COLUMN pending_checkout_at timestamptz,
 ADD COLUMN pending_checkout_plan_id text REFERENCES subscription_plans(id);
ALTER TABLE tenant_subscriptions ADD CONSTRAINT subscription_cancellation_reference_check
 CHECK(recurrence_cancellation_reference IS NULL OR length(trim(recurrence_cancellation_reference)) BETWEEN 3 AND 160);
ALTER TABLE tenant_subscriptions ADD CONSTRAINT subscription_pending_checkout_check
 CHECK((pending_checkout_at IS NULL)=(pending_checkout_plan_id IS NULL));
