package app.onething.seed;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.os.Build;
import java.util.HashMap;
import java.util.Map;

/**
 * Time in front per app, counted from the phone's usage log: an app counts from the moment it comes to the
 * front until it leaves, the screen turns off, or the phone locks. Same idea as Digital Wellbeing.
 */
final class UsageCalc {

    /** Look back before `since`, so an app that was already open at that moment still counts from it. */
    private static final long LOOKBACK_MS = 6 * 60 * 60 * 1000L;

    static final class AppTime {
        long ms;
        int opens;
    }

    private UsageCalc() {}

    @SuppressWarnings("deprecation")
    static Map<String, AppTime> since(Context context, long since) {
        Map<String, AppTime> out = new HashMap<>();
        UsageStatsManager usage = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
        long now = System.currentTimeMillis();
        if (usage == null || since >= now) return out;
        UsageEvents events = usage.queryEvents(since - LOOKBACK_MS, now);
        if (events == null) return out;
        UsageEvents.Event event = new UsageEvents.Event();
        String open = null; // the app in front right now, in the replay
        long openAt = 0;
        String last = null; // the last app that came to the front, to count opens (not screen changes inside an app)
        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            int type = event.getEventType();
            long at = event.getTimeStamp();
            String pkg = event.getPackageName();
            if (type == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                if (open != null) add(out, open, openAt, at, since); // a switch without a "left" event first
                if (!pkg.equals(last) && at >= since) entry(out, pkg).opens++;
                open = pkg;
                openAt = at;
                last = pkg;
            } else if (type == UsageEvents.Event.MOVE_TO_BACKGROUND) {
                if (pkg.equals(open)) {
                    add(out, open, openAt, at, since);
                    open = null;
                }
            } else if (Build.VERSION.SDK_INT >= 28
                && (type == UsageEvents.Event.SCREEN_NON_INTERACTIVE || type == UsageEvents.Event.KEYGUARD_SHOWN)) {
                if (open != null) add(out, open, openAt, at, since);
                open = null;
                last = null; // unlocking into the same app counts as a new open
            }
        }
        if (open != null) add(out, open, openAt, now, since);
        return out;
    }

    private static AppTime entry(Map<String, AppTime> out, String pkg) {
        AppTime t = out.get(pkg);
        if (t == null) {
            t = new AppTime();
            out.put(pkg, t);
        }
        return t;
    }

    private static void add(Map<String, AppTime> out, String pkg, long from, long to, long since) {
        long start = Math.max(from, since);
        if (to > start) entry(out, pkg).ms += to - start;
    }

    /** Milliseconds in the given apps since `since`. */
    static long total(Context context, long since, Iterable<String> apps) {
        Map<String, AppTime> all = since(context, since);
        long sum = 0;
        for (String pkg : apps) {
            AppTime t = all.get(pkg);
            if (t != null) sum += t.ms;
        }
        return sum;
    }
}
