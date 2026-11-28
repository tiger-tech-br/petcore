package br.dev.tigertech.petcore;

import java.time.Instant;
import org.junit.Test;
import static org.junit.Assert.*;

public class TrackingPolicyTest {
    private static final String ID = "e7c1c7c2-6a3c-4618-8c29-4ec4575b6bd0";
    private static final String TOKEN = "a".repeat(64);
    private static final long NOW = Instant.parse("2026-11-27T12:00:00Z").toEpochMilli();
    private static final String BASE = UrlPolicy.ORIGIN + "/api/transport/tracking/" + ID;
    private static TrackingPolicy.Grant parse(String upload, String stop, String token, String expiry) {
        return TrackingPolicy.grant(ID, upload, stop, token, expiry, NOW);
    }
    @Test public void acceptsOnlyTheExactExpiringTripCapability() {
        TrackingPolicy.Grant grant = parse(BASE + "/positions", BASE + "/stop", TOKEN, "2026-11-27T14:00:00Z");
        assertEquals(ID, grant.sessionId); assertEquals(BASE + "/heartbeat", grant.heartbeatUrl);
        assertEquals(TOKEN, grant.token); assertEquals(Instant.parse("2026-11-27T14:00:00Z").toEpochMilli(), grant.expiresAt);
    }
    @Test public void blocksOtherHostsPathsCredentialsQueriesAndEncodedPaths() {
        String[] urls = {"http://petcore.tigertech.dev.br/api/transport/tracking/" + ID + "/positions", BASE + "/positions?token=x",
            BASE + "/positions#x", BASE + "/positions/", BASE + "/%70ositions", BASE + "/../positions",
            BASE.replace(ID, "e7c1c7c2-6a3c-4618-8c29-4ec4575b6bd1") + "/positions",
            BASE.replace("https://", "https://user@") + "/positions", BASE.replace(".br", ".br.evil.test") + "/positions",
            BASE.replace(".br", ".br:444") + "/positions", "file:///positions", "data:application/json,{}"};
        for (String url : urls) assertThrows(url, IllegalArgumentException.class, () -> parse(url, BASE + "/stop", TOKEN, "2026-11-27T14:00:00Z"));
        assertThrows(IllegalArgumentException.class, () -> parse(BASE + "/positions", BASE + "/heartbeat", TOKEN, "2026-11-27T14:00:00Z"));
    }
    @Test public void rejectsExpiredOverlongAndMalformedCredentials() {
        for (String expiry : new String[]{"2026-11-27T11:59:59Z", "2026-11-27T12:00:10Z", "2026-11-28T00:00:01Z", "later", ""})
            assertThrows(IllegalArgumentException.class, () -> parse(BASE + "/positions", BASE + "/stop", TOKEN, expiry));
        for (String token : new String[]{"", "a".repeat(42), "a".repeat(257), TOKEN + "\r\nHost:evil", TOKEN + "/"})
            assertThrows(IllegalArgumentException.class, () -> parse(BASE + "/positions", BASE + "/stop", token, "2026-11-27T14:00:00Z"));
        assertThrows(IllegalArgumentException.class, () -> TrackingPolicy.grant("a-b-c-d-e", BASE + "/positions", BASE + "/stop", TOKEN, "2026-11-27T14:00:00Z", NOW));
    }
    @Test public void acceptsOnlyRecentFinitePlausiblePositions() {
        assertTrue(TrackingPolicy.validPosition(-23.55, -46.63, 15, 1000));
        assertTrue(TrackingPolicy.validPosition(90, -180, 5000, 45000));
        assertFalse(TrackingPolicy.validPosition(Double.NaN, 0, 10, 0));
        assertFalse(TrackingPolicy.validPosition(0, Double.POSITIVE_INFINITY, 10, 0));
        assertFalse(TrackingPolicy.validPosition(91, 0, 10, 0)); assertFalse(TrackingPolicy.validPosition(0, -181, 10, 0));
        assertFalse(TrackingPolicy.validPosition(0, 0, Float.NaN, 0)); assertFalse(TrackingPolicy.validPosition(0, 0, 5001, 0));
        assertFalse(TrackingPolicy.validPosition(0, 0, 0, 0)); assertFalse(TrackingPolicy.validPosition(0, 0, 10, -1));
        assertFalse(TrackingPolicy.validPosition(0, 0, 10, 45001));
    }
    @Test public void onlyAuthorizationOrExpiredSessionResponsesEndTracking() {
        for (int status : new int[]{401,403,404,410}) assertTrue(TrackingPolicy.terminalHttp(status));
        for (int status : new int[]{0,200,204,409,422,429,500,503}) assertFalse(TrackingPolicy.terminalHttp(status));
    }
}
