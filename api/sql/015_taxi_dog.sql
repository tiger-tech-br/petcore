-- Transporte opcional: agenda própria do motorista, sem ocupar a jornada do banhista.
ALTER TABLE tenants ADD COLUMN taxi_dog_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE services ADD COLUMN service_type text NOT NULL DEFAULT 'appointment' CHECK(service_type IN ('appointment','transport'));
ALTER TABLE services ADD COLUMN transport_mode text CHECK(transport_mode IN ('pickup','dropoff','round_trip'));
ALTER TABLE services DROP CONSTRAINT services_duration_minutes_check;
ALTER TABLE services ADD CONSTRAINT services_duration_type_check CHECK(
 (service_type='appointment' AND duration_minutes BETWEEN 5 AND 1440 AND transport_mode IS NULL)
 OR (service_type='transport' AND duration_minutes=0 AND transport_mode IS NOT NULL)
);

CREATE TABLE taxi_drivers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160), phone text NOT NULL DEFAULT '' CHECK(length(phone)<=40),
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE INDEX taxi_driver_names ON taxi_drivers(tenant_id,lower(name),id);
CREATE TABLE taxi_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), appointment_id uuid NOT NULL,
 service_id uuid NOT NULL, service_name text NOT NULL CHECK(length(service_name) BETWEEN 2 AND 160),
 price_cents integer NOT NULL CHECK(price_cents BETWEEN 0 AND 999999999),
 mode text NOT NULL CHECK(mode IN ('pickup','dropoff','round_trip')),
 address text NOT NULL CHECK(length(address)<=600), reference text NOT NULL DEFAULT '' CHECK(length(reference)<=300),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000), cancelled_at timestamptz,
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id),
 FOREIGN KEY(tenant_id,service_id) REFERENCES services(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,appointment_id)
);
CREATE TABLE taxi_trips (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), booking_id uuid NOT NULL,
 leg text NOT NULL CHECK(leg IN ('pickup','dropoff')), driver_id uuid NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','en_route','with_pet','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,booking_id) REFERENCES taxi_bookings(tenant_id,id),
 FOREIGN KEY(tenant_id,driver_id) REFERENCES taxi_drivers(tenant_id,id),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,booking_id,leg),
 CONSTRAINT no_taxi_driver_overlap EXCLUDE USING gist (
  tenant_id WITH =,driver_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&
 ) WHERE(status IN ('scheduled','en_route','with_pet'))
);
CREATE INDEX taxi_trip_days ON taxi_trips(tenant_id,starts_at,id);
CREATE INDEX taxi_trip_booking ON taxi_trips(tenant_id,booking_id);
