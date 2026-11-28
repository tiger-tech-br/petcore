-- Optional, explicitly started location sharing. Keep only the latest fix.
ALTER TABLE tenants ADD COLUMN tracking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN shop_address text NOT NULL DEFAULT '' CHECK(length(shop_address)<=600);
ALTER TABLE tenants ADD COLUMN shop_latitude double precision;
ALTER TABLE tenants ADD COLUMN shop_longitude double precision;
ALTER TABLE tenants ADD CONSTRAINT tenants_shop_coordinates_check CHECK(
 (shop_latitude IS NULL AND shop_longitude IS NULL) OR
 (shop_latitude IS NOT NULL AND shop_longitude IS NOT NULL AND shop_latitude BETWEEN -90 AND 90 AND shop_longitude BETWEEN -180 AND 180));
ALTER TABLE taxi_drivers ADD COLUMN user_id uuid;
ALTER TABLE taxi_drivers ADD CONSTRAINT taxi_driver_member_fk FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id);
CREATE UNIQUE INDEX taxi_driver_user ON taxi_drivers(tenant_id,user_id) WHERE user_id IS NOT NULL;
ALTER TABLE business_delivery_orders ADD COLUMN driver_id uuid;
ALTER TABLE business_delivery_orders ADD CONSTRAINT delivery_driver_fk FOREIGN KEY(tenant_id,driver_id) REFERENCES taxi_drivers(tenant_id,id);

-- Match the connect-pg-simple store on new databases before attaching grants.
CREATE TABLE IF NOT EXISTS "session" (sid varchar NOT NULL PRIMARY KEY,sess json NOT NULL,expire timestamp(6) NOT NULL);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" (expire);
CREATE TABLE transport_tracking_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 kind text NOT NULL CHECK(kind IN ('taxi','delivery')),
 taxi_trip_id uuid, delivery_id uuid, driver_id uuid NOT NULL, user_id uuid NOT NULL,
 session_version integer NOT NULL, auth_session_id varchar NOT NULL REFERENCES "session"(sid) ON DELETE CASCADE, upload_token_hash text,
 public_token_hash text UNIQUE, public_expires_at timestamptz,
 started_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 stopped_at timestamptz, stop_reason text,
 latitude double precision, longitude double precision, accuracy double precision,
 captured_at timestamptz, received_at timestamptz, sequence bigint NOT NULL DEFAULT 0,
 FOREIGN KEY(tenant_id,taxi_trip_id) REFERENCES taxi_trips(tenant_id,id),
 FOREIGN KEY(tenant_id,delivery_id) REFERENCES business_delivery_orders(tenant_id,id),
 FOREIGN KEY(tenant_id,driver_id) REFERENCES taxi_drivers(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id),
 CHECK((kind='taxi' AND taxi_trip_id IS NOT NULL AND delivery_id IS NULL) OR
       (kind='delivery' AND delivery_id IS NOT NULL AND taxi_trip_id IS NULL)),
 CHECK(expires_at>started_at AND expires_at<=started_at+interval '12 hours'),
 CHECK(public_expires_at IS NULL OR public_expires_at<=expires_at),
 CHECK((latitude IS NULL AND longitude IS NULL AND accuracy IS NULL AND captured_at IS NULL AND received_at IS NULL) OR
       (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
        AND accuracy IS NOT NULL AND accuracy BETWEEN 0 AND 10000 AND captured_at IS NOT NULL AND received_at IS NOT NULL)),
 CHECK(sequence>=0), UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX tracking_one_taxi ON transport_tracking_sessions(tenant_id,taxi_trip_id) WHERE stopped_at IS NULL AND taxi_trip_id IS NOT NULL;
CREATE UNIQUE INDEX tracking_one_delivery ON transport_tracking_sessions(tenant_id,delivery_id) WHERE stopped_at IS NULL AND delivery_id IS NOT NULL;
CREATE UNIQUE INDEX tracking_one_driver ON transport_tracking_sessions(tenant_id,driver_id) WHERE stopped_at IS NULL;
CREATE INDEX tracking_retention ON transport_tracking_sessions(expires_at);
CREATE INDEX tracking_auth_session ON transport_tracking_sessions(auth_session_id);
