package app.onething.seed;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import androidx.core.app.NotificationCompat;
import java.text.DateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Set;

/**
 * One Thing focus lock ("bounce-back", 2026-10-18). While a focus session runs, this service checks which
 * app is in front about every 0.6 s (Usage access) and brings One Thing back when another app comes to the
 * front (Home, recent apps, Settings opened from the pull-down menu). Android lets a normal app neither block
 * the Home gesture nor the pull-down menu, so it returns the user instead. Phone calls, the permission
 * screens and the share sheet are allowed. The user ends it only with Stop or "I finished it" in the app
 * (FocusLockPlugin.stop), or when the time is over. Needs "Display over other apps" (to start the app from
 * the background) and "Usage access". No Accessibility service: Play Protect blocks side-loaded apps that ask for it.
 */
public class FocusLockService extends Service {

    static final String PREFS = "focus_lock";
    static final String KEY_ENDS_AT = "ends_at";
    static final String EXTRA_ENDS_AT = "endsAt";
    private static final String CHANNEL = "focus_lock";
    private static final int NOTIFICATION_ID = 4711;
    private static final long TICK_MS = 600;

    static volatile boolean running = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> allowed = new HashSet<>();
    private long endsAt = 0;
    private long lastBounce = 0;
    private View overlay;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (System.currentTimeMillis() >= endsAt) {
                stopSelf();
                return;
            }
            bringBackIfLeft();
            handler.postDelayed(this, TICK_MS);
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        long fromIntent = intent != null ? intent.getLongExtra(EXTRA_ENDS_AT, 0) : 0;
        endsAt = fromIntent > 0 ? fromIntent : prefs.getLong(KEY_ENDS_AT, 0); // a restart after a kill keeps the time
        startInForeground(); // first, always: Android stops a foreground service that does not call this in time
        if (endsAt <= System.currentTimeMillis()) {
            prefs.edit().remove(KEY_ENDS_AT).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        prefs.edit().putLong(KEY_ENDS_AT, endsAt).apply();
        showOverlay();
        buildAllowList();
        running = true;
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        removeOverlay();
        running = false;
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(KEY_ENDS_AT).apply();
        super.onDestroy();
    }

    private void startInForeground() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && manager != null) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Focus lock", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String until = endsAt > 0 ? DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(endsAt)) : "";
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_seed)
            .setContentTitle("Focus is on")
            .setContentText(until.isEmpty() ? "Stop or finish it in One Thing." : "Until " + until + ". Stop or finish it in One Thing.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(tap)
            .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    /** A 1 x 1 transparent overlay: Android 15+ lets an app with "Display over other apps" start from the background only while its overlay is visible. */
    @SuppressWarnings("deprecation")
    private void showOverlay() {
        if (overlay != null) return;
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) return;
        try {
            WindowManager windows = getSystemService(WindowManager.class);
            int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
            WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                1,
                1,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                PixelFormat.TRANSLUCENT
            );
            params.gravity = Gravity.TOP | Gravity.START;
            View view = new View(this);
            windows.addView(view, params);
            overlay = view;
        } catch (Exception ignored) {
            overlay = null;
        }
    }

    private void removeOverlay() {
        if (overlay == null) return;
        try {
            getSystemService(WindowManager.class).removeView(overlay);
        } catch (Exception ignored) {
            // already gone
        }
        overlay = null;
    }

    /** Apps that may be in front during focus: calls, the system UI, permission screens, the share sheet. */
    private void buildAllowList() {
        allowed.clear();
        allowed.add("android");
        allowed.add("com.android.systemui");
        allowed.add("com.android.intentresolver");
        allowed.add("com.android.permissioncontroller");
        allowed.add("com.google.android.permissioncontroller");
        allowed.add("com.android.phone");
        allowed.add("com.android.server.telecom");
        allowed.add("com.android.incallui");
        allowed.add("com.android.dialer");
        allowed.add("com.google.android.dialer");
        try {
            TelecomManager telecom = getSystemService(TelecomManager.class);
            String dialer = telecom != null ? telecom.getDefaultDialerPackage() : null;
            if (dialer != null) allowed.add(dialer);
        } catch (Exception ignored) {
            // no telephony
        }
    }

    private void bringBackIfLeft() {
        KeyguardManager keyguard = getSystemService(KeyguardManager.class);
        if (keyguard != null && keyguard.isKeyguardLocked()) return; // the phone is locked: nothing to do
        String front = frontPackage();
        if (front == null || front.equals(getPackageName()) || allowed.contains(front)) return;
        long now = System.currentTimeMillis();
        if (now - lastBounce < 400) return;
        lastBounce = now;
        Intent back = new Intent(this, MainActivity.class).addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        try {
            startActivity(back);
        } catch (Exception ignored) {
            // the system refused this time; the next tick tries again
        }
    }

    /** The package of the app that came to the front last (Usage access), or null when unknown. */
    @SuppressWarnings("deprecation")
    private String frontPackage() {
        UsageStatsManager usage = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
        if (usage == null) return null;
        long now = System.currentTimeMillis();
        UsageEvents events = usage.queryEvents(now - 60_000, now);
        if (events == null) return null;
        UsageEvents.Event event = new UsageEvents.Event();
        String front = null;
        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            if (event.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) { // = ACTIVITY_RESUMED on Android 10+
                front = event.getPackageName();
            }
        }
        return front;
    }
}
