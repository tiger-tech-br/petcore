package br.dev.tigertech.petcore;

import java.net.URI;
import java.time.Instant;

/** Narrow device capability. Never accepts cookies, arbitrary hosts or URL tokens. */
public final class TrackingPolicy {
    public static final long MAX_DURATION_MS = 12 * 60 * 60 * 1000L;
    public static final long MAX_LOCATION_AGE_MS = 45000;
    private TrackingPolicy() {}

    public static final class Grant {
        public final String sessionId, uploadUrl, stopUrl, heartbeatUrl, token;
        public final long expiresAt;
        private Grant(String id, String upload, String stop, String token, long expiresAt) {
            this.sessionId = id; this.uploadUrl = upload; this.stopUrl = stop;
            this.heartbeatUrl = UrlPolicy.ORIGIN + "/api/transport/tracking/" + id + "/heartbeat";
            this.token = token; this.expiresAt = expiresAt;
        }
    }

    public static Grant grant(String id, String upload, String stop, String token, String expiresAt, long now) {
        if (id == null || !id.matches("[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}")) throw new IllegalArgumentException("INVALID_TRACKING_REQUEST");
        if (token == null || !token.matches("[A-Za-z0-9_-]{43,256}")) throw new IllegalArgumentException("INVALID_TRACKING_REQUEST");
        if (!endpoint(upload, id, "positions") || !endpoint(stop, id, "stop")) throw new IllegalArgumentException("INVALID_TRACKING_REQUEST");
        long expiry;
        try { expiry = Instant.parse(expiresAt).toEpochMilli(); } catch (Exception ignored) { throw new IllegalArgumentException("INVALID_TRACKING_REQUEST"); }
        if (expiry <= now + 10000 || expiry - now > MAX_DURATION_MS) throw new IllegalArgumentException("GRANT_EXPIRED_OR_CLOCK_INVALID");
        return new Grant(id, upload, stop, token, expiry);
    }

    public static boolean endpoint(String raw, String id, String action) {
        if (!UrlPolicy.isAppUrl(raw) || !action.matches("positions|stop|heartbeat")) return false;
        try {
            URI u = new URI(raw);
            return u.getRawQuery() == null && u.getRawFragment() == null
                && ("/api/transport/tracking/" + id + "/" + action).equals(u.getRawPath());
        } catch (Exception ignored) { return false; }
    }

    public static boolean validPosition(double latitude, double longitude, float accuracy, long ageMs) {
        return Double.isFinite(latitude) && Double.isFinite(longitude) && Float.isFinite(accuracy)
            && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
            && accuracy > 0 && accuracy <= 5000 && ageMs >= 0 && ageMs <= MAX_LOCATION_AGE_MS;
    }

    public static boolean terminalHttp(int status) { return status == 401 || status == 403 || status == 404 || status == 410; }
}
