package br.dev.tigertech.petcore;

import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.io.OutputStream;

/** Credentials exist only in RAM and are sent only to the prevalidated origin. */
final class TrackingHttp {
    private TrackingHttp() {}
    static int post(TrackingPolicy.Grant grant, String action, JSONObject body) {
        String raw = action.equals("positions") ? grant.uploadUrl : action.equals("stop") ? grant.stopUrl : grant.heartbeatUrl;
        if (!TrackingPolicy.endpoint(raw, grant.sessionId, action)) return 410;
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection)new URL(raw).openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
            connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setUseCaches(false);
            connection.setRequestProperty("Authorization", "Bearer " + grant.token);
            connection.setRequestProperty("Origin", UrlPolicy.ORIGIN);
            connection.setRequestProperty("X-PetCore-Request", "1");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            int status = connection.getResponseCode();
            // Deliberately discard bodies: no server text, credentials or coordinates enter logs/events.
            InputStream input = status < 400 ? connection.getInputStream() : connection.getErrorStream();
            if (input != null) input.close();
            return status >= 300 && status < 400 ? 410 : status;
        } catch (Exception ignored) { return 0; }
        finally { if (connection != null) connection.disconnect(); }
    }
}
