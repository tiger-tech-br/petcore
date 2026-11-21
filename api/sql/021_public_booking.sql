-- Public requests are not reservations. Only an authenticated operator confirms.
CREATE TABLE public_booking_settings (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
 enabled boolean NOT NULL DEFAULT false,
 public_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex') UNIQUE
  CHECK(public_token ~ '^[a-f0-9]{48}$'),
 notice text NOT NULL DEFAULT '' CHECK(length(notice)<=600),
 updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public_booking_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 receipt text NOT NULL DEFAULT encode(gen_random_bytes(20),'hex') UNIQUE CHECK(receipt ~ '^[a-f0-9]{40}$'),
 idempotency_key uuid NOT NULL, payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected')),
 tutor_name text NOT NULL CHECK(length(trim(tutor_name)) BETWEEN 2 AND 160),
 tutor_phone text NOT NULL CHECK(tutor_phone ~ '^\+?[0-9]{10,15}$'),
 tutor_email text CHECK(tutor_email IS NULL OR length(tutor_email)<=255),
 pet_name text NOT NULL CHECK(length(trim(pet_name)) BETWEEN 1 AND 160),
 pet_species text NOT NULL CHECK(length(trim(pet_species)) BETWEEN 2 AND 80),
 pet_size text NOT NULL CHECK(pet_size IN ('pequeno','medio','grande')),
 pet_breed text CHECK(pet_breed IS NULL OR length(pet_breed)<=160),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 appointment_id uuid, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 rejection_reason text NOT NULL DEFAULT '' CHECK(length(rejection_reason)<=300),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,idempotency_key),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
 CHECK((status='pending' AND appointment_id IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL)
  OR (status='confirmed' AND appointment_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  OR (status='rejected' AND appointment_id IS NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE public_booking_request_services (
 tenant_id uuid NOT NULL, request_id uuid NOT NULL, service_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 12),
 name text NOT NULL CHECK(length(name)<=160), price_cents integer NOT NULL CHECK(price_cents>=0),
 duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 5 AND 1440),
 PRIMARY KEY(tenant_id,request_id,service_id), UNIQUE(tenant_id,request_id,position),
 FOREIGN KEY(tenant_id,request_id) REFERENCES public_booking_requests(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id)
);
CREATE INDEX public_booking_requests_inbox ON public_booking_requests(tenant_id,status,created_at DESC,id);
CREATE INDEX public_booking_requests_pending_cleanup ON public_booking_requests(created_at) WHERE status='pending';
