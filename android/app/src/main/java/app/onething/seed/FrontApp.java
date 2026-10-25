package app.onething.seed;

import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;

/** Which app came to the front last, from the phone's usage log (needs Usage access). */
final class FrontApp {

    private FrontApp() {}

    /** The package that came to the front last within the past `windowMs`, or null when none did. */
    @SuppressWarnings("deprecation")
    static String get(Context context, long windowMs) {
        UsageStatsManager usage = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usage == null) return null;
        long now = System.currentTimeMillis();
        UsageEvents events = usage.queryEvents(now - windowMs, now);
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
