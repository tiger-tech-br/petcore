-- Expiration is distinct from a backup failure or a successful historic restore.
ALTER TABLE backup_runs DROP CONSTRAINT backup_runs_state_check;
ALTER TABLE backup_runs ADD CONSTRAINT backup_runs_state_check
 CHECK(state IN ('started','uploaded','verified','failed','expiring','expired'));
ALTER TABLE backup_runs ADD COLUMN expiration_started_at timestamptz;
ALTER TABLE backup_runs ADD COLUMN expired_at timestamptz;
ALTER TABLE backup_runs ADD COLUMN expiration_objects jsonb;
ALTER TABLE backup_runs ADD COLUMN expiration_bucket_fingerprint text;
ALTER TABLE backup_runs ADD CONSTRAINT backup_expiration_plan_check CHECK(
 (expiration_objects IS NULL OR jsonb_typeof(expiration_objects)='array')
 AND (expiration_bucket_fingerprint IS NULL OR expiration_bucket_fingerprint ~ '^[a-f0-9]{64}$')
 AND (state<>'expired' OR expired_at IS NOT NULL)
 AND (state<>'expiring' OR (expiration_started_at IS NOT NULL AND expiration_objects IS NOT NULL AND expiration_bucket_fingerprint IS NOT NULL))
);
CREATE INDEX idx_backup_retention_due ON backup_runs(finished_at,id)
 WHERE state IN ('uploaded','verified','expiring');
