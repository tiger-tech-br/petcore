package br.dev.tigertech.petcore;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import org.json.JSONObject;
import java.time.Instant;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** One explicit, expiring trip capability. No disk state, restart or general web cookies. */
public final class TrackingService extends Service {
    static final String ACTION_START = "br.dev.tigertech.petcore.TRACKING_START";
    static final String ACTION_STOP = "br.dev.tigertech.petcore.TRACKING_STOP";
    static final String CHANNEL = "petcore_tracking";
    private static final int NOTICE = 4103;
    interface Observer { void changed(Status status); }
    static final class Status {
        final String state, sessionId, code, lastUploadAt;
        Status(String state, String sessionId, String code, String lastUploadAt) {
            this.state = state; this.sessionId = sessionId; this.code = code; this.lastUploadAt = lastUploadAt;
        }
    }
    private static TrackingPolicy.Grant pending;
    private static volatile TrackingService active;
    private static volatile Status status = new Status("stopped", null, null, null);
    private static volatile Observer observer;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean inFlight = new AtomicBoolean(false);
    private TrackingPolicy.Grant grant;
    private LocationManager locations;
    private Location latest;
    private boolean ending;
    private long sequence, lastSentElapsed, retryAfter;
    private String lastUploadAt;

    static synchronized boolean prepare(TrackingPolicy.Grant request) {
        if (active != null || pending != null) return false;
        pending = request; return true;
    }
    static synchronized TrackingPolicy.Grant discardPending() { TrackingPolicy.Grant previous = pending; pending = null; return previous; }
    static synchronized String pendingSessionId() { return pending == null ? null : pending.sessionId; }
    static Status status() { return status; }
    static void observe(Observer value) { observer = value; if (value != null) value.changed(status); }
    static void unobserve(Observer value) { if (observer == value) observer = null; }
    static void requestStop() {
        revokeAsync(discardPending()); TrackingService instance = active;
        if (instance != null) instance.main.post(() -> instance.stopTracking("USER_STOP", true));
    }
    static void revokeAsync(TrackingPolicy.Grant request) {
        if (request == null) return;
        Thread task = new Thread(() -> TrackingHttp.post(request, "stop", new JSONObject()), "PetCoreTrackingRevoke");
        task.setDaemon(true); task.start();
    }
    private void publish(String state, String code) {
        Status next = new Status(state, grant == null ? status.sessionId : grant.sessionId, code, lastUploadAt);
        status = next; Observer current = observer; if (current != null) current.changed(next);
    }
    static boolean locationAllowed(android.content.Context context) {
        return context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }
    static boolean notificationsAllowed(android.content.Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || !manager.areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
        return channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }
    private boolean locationEnabled() {
        if (locations == null) return false;
        if (Build.VERSION.SDK_INT >= 28) return locations.isLocationEnabled();
        try { return locations.isProviderEnabled(LocationManager.GPS_PROVIDER) || locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER); }
        catch (RuntimeException ignored) { return false; }
    }

    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) { stopTracking("USER_STOP", true); return START_NOT_STICKY; }
        if (active == this) return START_NOT_STICKY;
        if (intent == null || !ACTION_START.equals(intent.getAction()) || active != null) { stopSelf(); return START_NOT_STICKY; }
        synchronized (TrackingService.class) { grant = pending; pending = null; }
        if (grant == null || grant.expiresAt <= System.currentTimeMillis() || !locationAllowed(this) || !notificationsAllowed(this)) {
            stopTracking("PERMISSION_REQUIRED", true); return START_NOT_STICKY;
        }
        active = this;
        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Localização durante a entrega", NotificationManager.IMPORTANCE_LOW));
            Intent stop = new Intent(this, TrackingService.class).setAction(ACTION_STOP);
            PendingIntent stopAction = PendingIntent.getService(this, 4104, stop, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent openAction = PendingIntent.getActivity(this, 4105, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification notice = new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_tracking_notification)
                .setContentTitle("PetCore — localização compartilhada")
                .setContentText("Durante esta entrega. Toque em Parar para encerrar.")
                .setContentIntent(openAction).setOngoing(true).setOnlyAlertOnce(true).setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE).addAction(0, "Parar compartilhamento", stopAction).build();
            ServiceCompat.startForeground(this, NOTICE, notice, Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
            locations = getSystemService(LocationManager.class);
            if (!locationEnabled()) { stopTracking("LOCATION_DISABLED", true); return START_NOT_STICKY; }
            subscribe(); publish("tracking", "WAITING_FOR_GPS"); main.post(tick);
        } catch (RuntimeException ignored) { stopTracking("TRACKING_START_FAILED", true); }
        return START_NOT_STICKY;
    }

    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location value) {
            if (!ending && grant != null && value.hasAccuracy()) {
                long age = (SystemClock.elapsedRealtimeNanos() - value.getElapsedRealtimeNanos()) / 1000000;
                if (TrackingPolicy.validPosition(value.getLatitude(), value.getLongitude(), value.getAccuracy(), age)) latest = new Location(value);
            }
        }
        @Override public void onProviderDisabled(String provider) { if (!ending) publish("tracking", "WAITING_FOR_GPS"); }
        @Override public void onProviderEnabled(String provider) { /* A fresh fix is required. */ }
        @Override public void onStatusChanged(String provider, int state, Bundle extras) { /* Legacy provider callback. */ }
    };
    @SuppressLint("MissingPermission") private void subscribe() {
        if (!locationAllowed(this)) throw new SecurityException();
        boolean requested = false;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED && locations.getAllProviders().contains(LocationManager.GPS_PROVIDER)) {
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000, 0, listener, Looper.getMainLooper()); requested = true;
        }
        if (locations.getAllProviders().contains(LocationManager.NETWORK_PROVIDER)) {
            locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000, 0, listener, Looper.getMainLooper()); requested = true;
        }
        if (!requested) throw new IllegalStateException();
    }
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (ending || grant == null) return;
            if (grant.expiresAt <= System.currentTimeMillis()) { stopTracking("GRANT_EXPIRED", true); return; }
            if (!locationAllowed(TrackingService.this) || !notificationsAllowed(TrackingService.this)) { stopTracking("PERMISSION_REVOKED", true); return; }
            if (!locationEnabled()) { stopTracking("LOCATION_DISABLED", true); return; }
            if (SystemClock.elapsedRealtime() >= retryAfter && inFlight.compareAndSet(false, true)) sendLatest();
            main.postDelayed(this, 15000);
        }
    };
    private void sendLatest() {
        final TrackingPolicy.Grant request = grant;
        Location value = latest == null ? null : new Location(latest);
        long age = value == null ? Long.MAX_VALUE : (SystemClock.elapsedRealtimeNanos() - value.getElapsedRealtimeNanos()) / 1000000;
        final boolean position = value != null && value.getElapsedRealtimeNanos() > lastSentElapsed
            && TrackingPolicy.validPosition(value.getLatitude(), value.getLongitude(), value.getAccuracy(), age);
        final JSONObject payload = new JSONObject();
        try {
            if (position) {
                payload.put("latitude", value.getLatitude()).put("longitude", value.getLongitude()).put("accuracy", value.getAccuracy())
                    .put("captured_at", Instant.ofEpochMilli(System.currentTimeMillis() - age).toString()).put("sequence", ++sequence);
                lastSentElapsed = value.getElapsedRealtimeNanos();
            }
        } catch (Exception ignored) { inFlight.set(false); stopTracking("INVALID_LOCATION", true); return; }
        io.execute(() -> {
            int response = TrackingHttp.post(request, position ? "positions" : "heartbeat", payload);
            main.post(() -> {
                inFlight.set(false); if (ending || grant != request) return;
                if (TrackingPolicy.terminalHttp(response)) { stopTracking("TRACKING_REVOKED", false); return; }
                if (response >= 200 && response < 300) {
                    if (position) lastUploadAt = Instant.now().toString();
                    publish("tracking", position ? null : "WAITING_FOR_GPS");
                } else {
                    if (response == 429) retryAfter = SystemClock.elapsedRealtime() + 60000;
                    publish("tracking", response == 409 ? "POSITION_SKIPPED" : "CONNECTION_UNAVAILABLE");
                }
            });
        });
    }
    private void stopTracking(String code, boolean notifyServer) {
        if (ending) return; ending = true; main.removeCallbacks(tick);
        if (locations != null) { try { locations.removeUpdates(listener); } catch (RuntimeException ignored) { /* Permission may already have been revoked. */ } }
        latest = null; final TrackingPolicy.Grant previous = grant;
        publish("stopped", code); grant = null; active = null;
        if (notifyServer && previous != null) io.execute(() -> TrackingHttp.post(previous, "stop", new JSONObject()));
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf();
    }
    @Override public void onTaskRemoved(Intent rootIntent) { stopTracking("APP_CLOSED", true); super.onTaskRemoved(rootIntent); }
    @Override public void onDestroy() {
        if (!ending) stopTracking("SERVICE_STOPPED", true);
        main.removeCallbacksAndMessages(null); io.shutdown(); super.onDestroy();
    }
}
