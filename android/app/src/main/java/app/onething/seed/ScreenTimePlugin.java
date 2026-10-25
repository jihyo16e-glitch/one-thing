package app.onething.seed;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;

/**
 * Phone time for the web app (2026-10-25): app time today from the usage log, and the floating bubble
 * (ScrollWatchService). Every method catches its own errors: an exception inside a plugin method crashes the app.
 */
@CapacitorPlugin(name = "ScreenTime")
public class ScreenTimePlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();
        result.put("overlay", Access.canDrawOverlays(context));
        result.put("usage", Access.hasUsageAccess(context));
        result.put("bubble", ScrollWatchService.running);
        PowerManager power = context.getSystemService(PowerManager.class);
        result.put("battery", Build.VERSION.SDK_INT < 23 || (power != null && power.isIgnoringBatteryOptimizations(context.getPackageName())));
        call.resolve(result);
    }

    /**
     * Opens the phone's battery list, where the user sets One Thing to "not optimized", so battery saving does not
     * close the bubble. The list page, not the one-tap "allow" dialog: Google Play limits that dialog to a few app types.
     */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context context = getContext();
        if (!open(context, new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) {
            open(context, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.getPackageName())));
        }
        call.resolve();
    }

    private static boolean open(Context context, Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    @PluginMethod
    public void usage(PluginCall call) {
        Context context = getContext();
        if (!Access.hasUsageAccess(context)) {
            call.reject("Phone time needs Usage access.", "MISSING_PERMISSION");
            return;
        }
        try {
            Object raw = call.getData().opt("since"); // a ms time arrives as a Long: read it as any Number
            long since = raw instanceof Number ? ((Number) raw).longValue() : 0;
            Map<String, UsageCalc.AppTime> all = UsageCalc.since(context, since);
            Set<String> skip = notApps(context);
            PackageManager pm = context.getPackageManager();
            List<JSObject> rows = new ArrayList<>();
            long total = 0;
            for (Map.Entry<String, UsageCalc.AppTime> e : all.entrySet()) {
                String pkg = e.getKey();
                UsageCalc.AppTime t = e.getValue();
                if (skip.contains(pkg) || t.ms <= 0) continue;
                total += t.ms;
                JSObject row = new JSObject();
                row.put("pkg", pkg);
                row.put("label", label(pm, pkg));
                row.put("ms", t.ms);
                row.put("opens", t.opens);
                rows.add(row);
            }
            rows.sort((a, b) -> Long.compare(b.optLong("ms"), a.optLong("ms")));
            JSArray apps = new JSArray();
            for (JSObject row : rows) apps.put(row);
            JSObject result = new JSObject();
            result.put("apps", apps);
            result.put("totalMs", total);
            call.resolve(result);
        } catch (Exception error) {
            Log.w(ScrollWatchService.TAG, "usage failed: " + error);
            call.reject("Phone time could not be read: " + error.getMessage());
        }
    }

    @PluginMethod
    public void startBubble(PluginCall call) {
        Context context = getContext();
        if (!Access.canDrawOverlays(context) || !Access.hasUsageAccess(context)) {
            call.reject("The bubble needs Display over other apps and Usage access.", "MISSING_PERMISSION");
            return;
        }
        try {
            Set<String> apps = new HashSet<>();
            JSONArray list = call.getData().optJSONArray("apps");
            if (list != null) {
                for (int i = 0; i < list.length(); i++) {
                    String pkg = list.optString(i, "");
                    if (!pkg.isEmpty()) apps.add(pkg);
                }
            }
            Object limit = call.getData().opt("limitMin");
            Object boundary = call.getData().opt("boundaryMin");
            SharedPreferences.Editor prefs = context.getSharedPreferences(ScrollWatchService.PREFS, Context.MODE_PRIVATE).edit();
            prefs.putBoolean(ScrollWatchService.KEY_ON, true);
            prefs.putStringSet(ScrollWatchService.KEY_APPS, apps);
            prefs.putInt(ScrollWatchService.KEY_LIMIT, limit instanceof Number ? Math.max(1, ((Number) limit).intValue()) : 30);
            prefs.putInt(ScrollWatchService.KEY_BOUNDARY, boundary instanceof Number ? ((Number) boundary).intValue() : 0);
            prefs.putString(ScrollWatchService.KEY_ONE, call.getString("one", ""));
            prefs.apply();
            Intent service = new Intent(context, ScrollWatchService.class);
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(service);
            } else {
                context.startService(service);
            }
            Log.i(ScrollWatchService.TAG, "bubble start asked: " + apps.size() + " apps, limit " + limit);
            call.resolve();
        } catch (Exception error) {
            Log.w(ScrollWatchService.TAG, "bubble start failed: " + error);
            call.reject("The bubble could not start: " + error.getMessage());
        }
    }

    @PluginMethod
    public void stopBubble(PluginCall call) {
        Context context = getContext();
        try {
            context.getSharedPreferences(ScrollWatchService.PREFS, Context.MODE_PRIVATE).edit().putBoolean(ScrollWatchService.KEY_ON, false).apply();
            context.stopService(new Intent(context, ScrollWatchService.class));
        } catch (Exception error) {
            Log.w(ScrollWatchService.TAG, "bubble stop failed: " + error);
        }
        call.resolve();
    }

    /** The home screen and the system bars are not apps you "use", so they are left out of phone time. */
    private static Set<String> notApps(Context context) {
        Set<String> skip = new HashSet<>();
        skip.add("android");
        skip.add("com.android.systemui");
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            for (ResolveInfo info : context.getPackageManager().queryIntentActivities(home, 0)) {
                if (info.activityInfo != null) skip.add(info.activityInfo.packageName);
            }
        } catch (Exception ignored) {
            // keep the short list
        }
        return skip;
    }

    private static String label(PackageManager pm, String pkg) {
        try {
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception error) {
            return pkg; // not visible to this app: show the package name
        }
    }
}
