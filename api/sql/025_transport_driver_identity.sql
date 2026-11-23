-- Shared driver identity for product deliveries and Taxi Dog.
-- Additive only: existing drivers, trips and orders keep their current behavior.
-- No location data, public links, or sharing is enabled by this migration.
ALTER TABLE tenants
 ADD COLUMN transport_tracking_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE taxi_drivers
 ADD COLUMN user_id uuid,
 ADD CONSTRAINT taxi_driver_membership_fk
 FOREIGN KEY (tenant_id,user_id) REFERENCES memberships(tenant_id,user_id);

CREATE UNIQUE INDEX taxi_driver_one_account_per_tenant
 ON taxi_drivers(tenant_id,user_id) WHERE user_id IS NOT NULL;

-- A manual order and a confirmed public catalog order use this same table.
-- Existing orders remain unassigned; an operator must explicitly assign a driver.
ALTER TABLE business_delivery_orders
 ADD COLUMN driver_id uuid,
 ADD CONSTRAINT business_delivery_driver_fk
 FOREIGN KEY (tenant_id,driver_id) REFERENCES taxi_drivers(tenant_id,id);

CREATE INDEX business_delivery_driver_active
 ON business_delivery_orders(tenant_id,driver_id)
 WHERE driver_id IS NOT NULL AND status IN ('preparing','out_for_delivery');

-- Active membership/driver checks, assignment mutations and cross-module
-- concurrent trip exclusion require transactional authorization in the API.
-- Foreign keys alone are not permission checks.
