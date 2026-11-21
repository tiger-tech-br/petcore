-- Existing shops keep all current modules; this preference changes the UI only.
ALTER TABLE tenants ADD COLUMN operation_mode text NOT NULL DEFAULT 'complete';
ALTER TABLE tenants ADD CONSTRAINT tenants_operation_mode_check
 CHECK(operation_mode IN ('essential','complete'));
