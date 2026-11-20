-- Archival is an explicit operator action after a verified external copy.
-- Existing rows remain active; this migration never classifies old rows as legacy.
ALTER TABLE backup_runs ADD COLUMN retention_scope text NOT NULL DEFAULT 'active';
ALTER TABLE backup_runs ADD COLUMN legacy_archived_at timestamptz;
ALTER TABLE backup_runs ADD COLUMN legacy_archive_sha256 text;

ALTER TABLE backup_runs ADD CONSTRAINT backup_retention_scope_check
 CHECK(retention_scope IN ('active','legacy'));
ALTER TABLE backup_runs ADD CONSTRAINT backup_legacy_archive_evidence_check CHECK(
 (retention_scope='active' AND legacy_archived_at IS NULL AND legacy_archive_sha256 IS NULL)
 OR
 (retention_scope='legacy' AND legacy_archived_at IS NOT NULL
  AND legacy_archive_sha256 IS NOT NULL AND legacy_archive_sha256 ~ '^[a-f0-9]{64}$')
);
