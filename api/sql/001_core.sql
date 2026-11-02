-- Todos os IDs públicos são UUID; FKs compostas impedem referências cruzadas entre empresas.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS tenants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
 timezone text NOT NULL DEFAULT 'America/Sao_Paulo', late_tolerance_minutes integer NOT NULL DEFAULT 10 CHECK (late_tolerance_minutes BETWEEN 0 AND 120),
 reminder_minutes_before integer NOT NULL DEFAULT 60 CHECK (reminder_minutes_before BETWEEN 0 AND 10080),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
 key text PRIMARY KEY, window_started timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text NOT NULL, password_hash text NOT NULL, session_version integer NOT NULL DEFAULT 1,
 is_platform_owner boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (email)
);
CREATE TABLE IF NOT EXISTS memberships (
 tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
 role text NOT NULL CHECK (role IN ('admin','employee')),
 permissions text[] NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true,
 PRIMARY KEY (tenant_id,user_id)
);
CREATE TABLE IF NOT EXISTS invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 email text NOT NULL, role text NOT NULL CHECK (role IN ('admin','employee')),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, redeemed_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS password_resets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE IF NOT EXISTS tutors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL CHECK (length(trim(name))>0), phone text NOT NULL DEFAULT '', email text,
 notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS pets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 tutor_id uuid NOT NULL, name text NOT NULL, species text NOT NULL, breed text,
 size text NOT NULL CHECK (size IN ('pequeno','medio','grande')), birth_date date,
 photo_key text, notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,tutor_id) REFERENCES tutors(tenant_id,id),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,tutor_id)
);
CREATE TABLE IF NOT EXISTS professionals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL, user_id uuid, active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id), UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL, description text NOT NULL DEFAULT '', price_cents integer NOT NULL CHECK (price_cents >= 0),
 duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440), active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS professional_services (
 tenant_id uuid NOT NULL, professional_id uuid NOT NULL, service_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,professional_id,service_id),
 FOREIGN KEY(tenant_id,professional_id) REFERENCES professionals(tenant_id,id),
 FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS professional_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, professional_id uuid NOT NULL,
 weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
 start_time time NOT NULL, end_time time NOT NULL CHECK (end_time > start_time),
 FOREIGN KEY(tenant_id,professional_id) REFERENCES professionals(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS professional_breaks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, professional_id uuid NOT NULL,
 weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
 start_time time NOT NULL, end_time time NOT NULL CHECK (end_time > start_time),
 FOREIGN KEY(tenant_id,professional_id) REFERENCES professionals(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS professional_absences (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, professional_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK (ends_at>starts_at), reason text NOT NULL DEFAULT '',
 FOREIGN KEY(tenant_id,professional_id) REFERENCES professionals(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 tutor_id uuid NOT NULL, pet_id uuid NOT NULL, professional_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK (ends_at>starts_at),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','in_progress','done','cancelled','no_show')),
 notes text NOT NULL DEFAULT '', created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,tutor_id) REFERENCES tutors(tenant_id,id),
 FOREIGN KEY(tenant_id,pet_id,tutor_id) REFERENCES pets(tenant_id,id,tutor_id),
 FOREIGN KEY(tenant_id,professional_id) REFERENCES professionals(tenant_id,id),
 UNIQUE(tenant_id,id),
 CONSTRAINT no_professional_overlap EXCLUDE USING gist (
   tenant_id WITH =, professional_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&
 ) WHERE (status IN ('pending','confirmed','in_progress'))
);
CREATE TABLE IF NOT EXISTS appointment_services (
 tenant_id uuid NOT NULL, appointment_id uuid NOT NULL, service_id uuid NOT NULL,
 position integer NOT NULL, price_cents integer NOT NULL, duration_minutes integer NOT NULL,
 PRIMARY KEY (tenant_id,appointment_id,service_id), UNIQUE(tenant_id,appointment_id,position),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
 FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS appointment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, appointment_id uuid NOT NULL,
 actor_user_id uuid NOT NULL REFERENCES users(id), kind text NOT NULL,
 old_start timestamptz, old_end timestamptz, new_start timestamptz, new_end timestamptz,
 old_professional_id uuid, new_professional_id uuid, reason text NOT NULL DEFAULT '',
 tutor_consent boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS waitlist (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 tutor_id uuid NOT NULL, pet_id uuid NOT NULL, service_id uuid NOT NULL, professional_id uuid,
 earliest_at timestamptz NOT NULL, latest_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','offered','booked','closed')),
 appointment_id uuid, notes text NOT NULL DEFAULT '',
 CHECK(latest_at>earliest_at),
 FOREIGN KEY(tenant_id,pet_id,tutor_id) REFERENCES pets(tenant_id,id,tutor_id),
 FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id),
 FOREIGN KEY(tenant_id,professional_id) REFERENCES professionals(tenant_id,id),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
 UNIQUE(tenant_id,id)
);
-- A etapa de notificações adicionará um worker; agendamento pode atualizar os jobs agora.
CREATE TABLE IF NOT EXISTS reminder_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, appointment_id uuid NOT NULL,
 scheduled_for timestamptz NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','cancelled','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,appointment_id),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS idx_appointments_calendar ON appointments(tenant_id,starts_at);
CREATE INDEX IF NOT EXISTS idx_tutors_lookup ON tutors(tenant_id,name);
CREATE INDEX IF NOT EXISTS idx_waitlist_open ON waitlist(tenant_id,status,earliest_at);
-- Um funcionário está associado a no máximo um perfil profissional da mesma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_member ON professionals(tenant_id,user_id) WHERE user_id IS NOT NULL;
