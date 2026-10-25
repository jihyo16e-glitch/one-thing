package app.onething.seed;

import android.annotation.SuppressLint;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * The floating bubble (2026-10-25, against doom scrolling). While a scroll app (the user's list) is in front,
 * a small round bubble floats on top of it with today's scrolling minutes. It is green, turns amber at half
 * the daily limit and red at the limit; at the limit it opens once a day to show the ONE thing. Tap it to
 * go back to One Thing; drag it to move it. Needs "Usage access" (which app is in front) and "Display over
 * other apps" (the bubble). Settings come from ScreenTimePlugin.startBubble and live in SharedPreferences,
 * so the bubble keeps working when the app is closed.
 */
public class ScrollWatchService extends Service {

    static final String TAG = "OneThingScroll";
    static final String PREFS = "scroll_watch";
    static final String KEY_ON = "on";
    static final String KEY_APPS = "apps";
    static final String KEY_LIMIT = "limit_min";
    static final String KEY_BOUNDARY = "boundary_min";
    static final String KEY_ONE = "one";
    static final String KEY_HARD = "hard_stop";
    private static final String KEY_SNOOZE = "snooze_until";
    private static final long SNOOZE_MS = 5 * 60_000;
    private static final int SNOOZE_WAIT_S = 5; // "5 more minutes" works only after this wait: a small speed bump
    private static final String KEY_X = "x";
    private static final String KEY_Y = "y";
    private static final String KEY_TOLD = "told_day";
    private static final String CHANNEL = "scroll_watch";
    private static final int NOTIFICATION_ID = 4712;
    private static final long TICK_MS = 1500;
    private static final long RECOUNT_MS = 60_000;
    private static final long SHOW_ONE_MS = 7000;
    // Same three colours as the web app's meter (styles.css "Phone time"): calm, half the limit, over it.
    private static final int CALM = Color.parseColor("#0F766E");
    private static final int HALF = Color.parseColor("#B45309");
    private static final int STOP = Color.parseColor("#B42318");

    static volatile boolean running = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> apps = new HashSet<>();
    private int limitMin = 30;
    private int boundaryMin = 0;
    private String one = "";
    private boolean hardStop = true;
    private long snoozeUntil = 0;
    private LinearLayout pause; // the full-screen pause at the limit
    private Runnable pauseCountdown;
    private TextView bubble;
    private WindowManager.LayoutParams params;
    private String front = null; // the app in front, as last seen in the usage log
    private boolean firstLook = true;
    private boolean inScroll = false;
    private long countedMs = 0; // scroll time today, as counted at `countedAt`
    private long countedAt = 0;
    private long showOneUntil = 0;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            try {
                step();
            } catch (Exception error) {
                Log.w(TAG, "tick failed: " + error); // never let one bad tick stop the bubble
            }
            handler.postDelayed(this, TICK_MS);
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startInForeground(); // first, always: Android stops a foreground service that does not call this in time
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ON, false) || !Access.canDrawOverlays(this) || !Access.hasUsageAccess(this)) {
            Log.i(TAG, "not starting: off or a switch is missing");
            stopSelf();
            return START_NOT_STICKY;
        }
        apps.clear();
        apps.addAll(prefs.getStringSet(KEY_APPS, new HashSet<>()));
        limitMin = Math.max(1, prefs.getInt(KEY_LIMIT, 30));
        boundaryMin = prefs.getInt(KEY_BOUNDARY, 0);
        one = prefs.getString(KEY_ONE, "");
        hardStop = prefs.getBoolean(KEY_HARD, true);
        snoozeUntil = prefs.getLong(KEY_SNOOZE, 0);
        countedAt = 0; // count again with the new list
        Log.i(TAG, "service start: " + apps.size() + " scroll apps, limit " + limitMin + " min");
        running = true;
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        removeBubble();
        hidePause();
        running = false;
        super.onDestroy();
    }

    private void startInForeground() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26 && manager != null) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Scroll bubble", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_seed)
            .setContentTitle("Scroll bubble is on")
            .setContentText("It shows your scrolling minutes. Turn it off in One Thing, Phone time.")
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

    private void step() {
        PowerManager power = getSystemService(PowerManager.class);
        KeyguardManager keyguard = getSystemService(KeyguardManager.class);
        boolean screenOn = power == null || power.isInteractive();
        boolean locked = keyguard != null && keyguard.isKeyguardLocked();
        if (!screenOn || locked || FocusLockService.running) {
            hideBubble();
            hidePause();
            inScroll = false;
            return;
        }
        // Look far back once, then only at the last moments: an app open for a long time sends no new event.
        String seen = FrontApp.get(this, firstLook ? 6 * 60 * 60 * 1000L : 10_000);
        firstLook = false;
        if (seen != null && !seen.equals(front)) {
            front = seen;
            Log.i(TAG, "front app: " + front);
        }
        boolean scroll = front != null && apps.contains(front);
        long now = System.currentTimeMillis();
        if (scroll && (!inScroll || countedAt == 0 || now - countedAt > RECOUNT_MS)) {
            countedMs = UsageCalc.total(this, dayStart(now), apps);
            countedAt = now;
        }
        inScroll = scroll;
        if (!scroll) {
            hideBubble();
            hidePause();
            return;
        }
        long ms = countedMs + Math.max(0, now - countedAt);
        if (hardStop && ms >= limitMin * 60_000L && now >= snoozeUntil) {
            hideBubble();
            showPause(ms);
        } else {
            hidePause();
            showBubble(ms, now);
        }
    }

    /** When today began: the user's "my day ends at" time, so a late night still counts as the same day. */
    private long dayStart(long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        c.add(Calendar.MINUTE, boundaryMin);
        if (c.getTimeInMillis() > now) c.add(Calendar.DAY_OF_MONTH, -1);
        return c.getTimeInMillis();
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("ClickableViewAccessibility")
    private void showBubble(long ms, long now) {
        long minutes = ms / 60000;
        double part = ms / (limitMin * 60000.0);
        int color = part >= 1 ? STOP : part >= 0.5 ? HALF : CALM;
        if (part >= 1 && !hardStop) { // with the pause on, the pause shows the ONE thing instead
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            String day = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(dayStart(now));
            if (!day.equals(prefs.getString(KEY_TOLD, ""))) {
                prefs.edit().putString(KEY_TOLD, day).apply();
                showOneUntil = now + SHOW_ONE_MS; // once a day, at the limit: open up and show the ONE thing
            }
        }
        boolean open = now < showOneUntil;
        String text = open
            ? minutes + " min of scrolling today.\n" + (one.isEmpty() ? "Time to stop?" : "Your ONE thing: " + one)
            : minutes + "m";

        if (bubble == null) {
            WindowManager windows = getSystemService(WindowManager.class);
            TextView view = new TextView(this);
            view.setTextColor(Color.WHITE);
            view.setTypeface(Typeface.DEFAULT_BOLD);
            view.setGravity(Gravity.CENTER);
            view.setIncludeFontPadding(false);
            view.setOnTouchListener(new Drag());
            int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
            WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT
            );
            p.gravity = Gravity.TOP | Gravity.START;
            DisplayMetrics screen = getResources().getDisplayMetrics();
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            p.x = prefs.getInt(KEY_X, screen.widthPixels - dp(72));
            p.y = prefs.getInt(KEY_Y, Math.round(screen.heightPixels * 0.3f));
            try {
                windows.addView(view, p);
            } catch (Exception error) {
                Log.w(TAG, "bubble failed: " + error); // the overlay switch was turned off meanwhile
                return;
            }
            bubble = view;
            params = p;
            Log.i(TAG, "bubble shown");
        }
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setStroke(dp(2), Color.WHITE);
        if (open) {
            shape.setCornerRadius(dp(18));
            bubble.setMinWidth(0);
            bubble.setMinHeight(0);
            bubble.setMaxWidth(dp(240));
            bubble.setPadding(dp(14), dp(10), dp(14), dp(10));
            bubble.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            bubble.setGravity(Gravity.START);
        } else {
            shape.setShape(GradientDrawable.OVAL);
            bubble.setMinWidth(dp(56));
            bubble.setMinHeight(dp(56));
            bubble.setPadding(dp(6), dp(6), dp(6), dp(6));
            bubble.setTextSize(TypedValue.COMPLEX_UNIT_SP, minutes >= 100 ? 14 : 17);
            bubble.setGravity(Gravity.CENTER);
        }
        bubble.setBackground(shape);
        if (!text.contentEquals(bubble.getText())) bubble.setText(text);
        bubble.setContentDescription(minutes + " minutes of scrolling today. Tap to open One Thing.");
    }

    private void hideBubble() {
        removeBubble();
    }

    /**
     * The pause at the limit (2026-10-25): a full-screen cover over the scroll app with today's minutes, the ONE thing,
     * "Open my ONE thing" and "5 more minutes" (which works only after a 5-second wait). The 20-buyer panel's most
     * repeated wish: a bubble that only shows a number is easy to ignore. Pressing Home also clears it.
     */
    @SuppressWarnings("deprecation")
    private void showPause(long ms) {
        if (pause != null) return;
        int dark = Color.parseColor("#F20D0F13");
        int ink = Color.parseColor("#ECEDEF");
        int muted = Color.parseColor("#A2A7B2");
        int accent = Color.parseColor("#2DD4BF");
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(dark);
        box.setPadding(dp(28), dp(40), dp(28), dp(40));
        box.setClickable(true); // touches stop here instead of reaching the app below

        box.addView(text("Time to stop scrolling", 26, true, ink), wide(0));
        box.addView(text((ms / 60000) + " min of scrolling today. Your limit is " + limitMin + " min.", 17, false, muted), wide(10));
        TextView label = text("YOUR ONE THING", 13, true, accent);
        label.setLetterSpacing(0.08f);
        box.addView(label, wide(36));
        box.addView(text(one.isEmpty() ? "What matters more than this right now?" : one, 22, true, ink), wide(8));

        TextView open = pill("Open my ONE thing", accent, Color.parseColor("#0B2925"), accent);
        open.setOnClickListener(v -> {
            Log.i(TAG, "pause: open One Thing");
            hidePause();
            openApp();
        });
        box.addView(open, wide(36));
        final TextView more = pill("5 more minutes (wait " + SNOOZE_WAIT_S + ")", Color.TRANSPARENT, muted, Color.parseColor("#3A3F4A"));
        more.setEnabled(false);
        more.setOnClickListener(v -> {
            snoozeUntil = System.currentTimeMillis() + SNOOZE_MS;
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putLong(KEY_SNOOZE, snoozeUntil).apply();
            Log.i(TAG, "pause: 5 more minutes");
            hidePause();
        });
        box.addView(more, wide(12));
        final int[] left = { SNOOZE_WAIT_S };
        pauseCountdown = new Runnable() {
            @Override
            public void run() {
                left[0]--;
                if (left[0] > 0) {
                    more.setText("5 more minutes (wait " + left[0] + ")");
                    handler.postDelayed(this, 1000);
                } else {
                    more.setText("5 more minutes");
                    more.setTextColor(ink);
                    more.setEnabled(true);
                }
            }
        };
        handler.postDelayed(pauseCountdown, 1000);

        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );
        try {
            getSystemService(WindowManager.class).addView(box, p);
            pause = box;
            Log.i(TAG, "pause shown at " + (ms / 60000) + " min");
        } catch (Exception error) {
            Log.w(TAG, "pause failed: " + error);
            handler.removeCallbacks(pauseCountdown);
            pauseCountdown = null;
        }
    }

    private void hidePause() {
        if (pauseCountdown != null) {
            handler.removeCallbacks(pauseCountdown);
            pauseCountdown = null;
        }
        if (pause == null) return;
        try {
            getSystemService(WindowManager.class).removeView(pause);
        } catch (Exception ignored) {
            // already gone
        }
        pause = null;
    }

    private TextView text(String s, float sp, boolean bold, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    /** A rounded button drawn by hand: a service has no app theme, so a plain Button would look out of place. */
    private TextView pill(String s, int fill, int color, int stroke) {
        TextView t = text(s, 17, true, color);
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(fill);
        shape.setCornerRadius(dp(16));
        shape.setStroke(dp(2), stroke);
        t.setBackground(shape);
        t.setMinHeight(dp(54));
        t.setPadding(dp(16), dp(12), dp(16), dp(12));
        t.setClickable(true);
        return t;
    }

    private LinearLayout.LayoutParams wide(int topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(topDp);
        return lp;
    }

    private void removeBubble() {
        if (bubble == null) return;
        try {
            getSystemService(WindowManager.class).removeView(bubble);
        } catch (Exception ignored) {
            // already gone
        }
        bubble = null;
        params = null;
    }

    private void openApp() {
        Intent back = new Intent(this, MainActivity.class).addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        try {
            startActivity(back);
            Log.i(TAG, "bubble tapped: opening One Thing");
        } catch (Exception error) {
            Log.w(TAG, "open refused: " + error);
        }
    }

    /** Drag to move; a touch that hardly moves is a tap. The place is kept for next time. */
    private final class Drag implements android.view.View.OnTouchListener {
        private float downX;
        private float downY;
        private int startX;
        private int startY;
        private boolean moved;

        @Override
        public boolean onTouch(android.view.View v, MotionEvent e) {
            if (params == null) return false;
            int slop = ViewConfiguration.get(ScrollWatchService.this).getScaledTouchSlop();
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = e.getRawX();
                    downY = e.getRawY();
                    startX = params.x;
                    startY = params.y;
                    moved = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    float dx = e.getRawX() - downX;
                    float dy = e.getRawY() - downY;
                    if (!moved && Math.hypot(dx, dy) < slop) return true;
                    moved = true;
                    params.x = startX + Math.round(dx);
                    params.y = startY + Math.round(dy);
                    try {
                        getSystemService(WindowManager.class).updateViewLayout(v, params);
                    } catch (Exception ignored) {
                        // the bubble went away mid-drag
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                    if (moved) {
                        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_X, params.x).putInt(KEY_Y, params.y).apply();
                    } else {
                        v.performClick();
                        openApp();
                    }
                    return true;
                default:
                    return false;
            }
        }
    }
}
