-- Replaced uploads also need reliable private-object cleanup, independent of a DSAR.
ALTER TABLE object_deletion_jobs ALTER COLUMN request_id DROP NOT NULL;
