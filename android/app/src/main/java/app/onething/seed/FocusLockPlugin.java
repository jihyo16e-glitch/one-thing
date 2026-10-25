package app.onething.seed;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** The web app's handle on FocusLockService: check the two switches, open their settings pages, start, stop. */
@CapacitorPlugin(name = "FocusLock")
public class FocusLockPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("overlay", canDrawOverlays());
        result.put("usage", hasUsageAccess());
        result.put("running", FocusLockService.running);
        call.resolve(result);
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Context context = getContext();
        if (!open(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.getPackageName())))) {
            open(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
        }
        call.resolve();
    }

    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        Context context = getContext();
        if (!open(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:" + context.getPackageName())))) {
            open(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        }
        call.resolve();
    }

    @PluginMethod
    public void start(PluginCall call) {
        // A time in ms arrives as a Long, and PluginCall.getDouble() returns null for a Long (Capacitor 8.5):
        // read it as any Number.
        Object raw = call.getData().opt("endsAt");
        long endsAt = raw instanceof Number ? ((Number) raw).longValue() : 0;
        Log.i(FocusLockService.TAG, "start asked: endsAt=" + raw + " overlay=" + canDrawOverlays() + " usage=" + hasUsageAccess());
        if (endsAt <= System.currentTimeMillis()) {
            call.reject("endsAt must be a time in the future.");
            return;
        }
        if (!canDrawOverlays() || !hasUsageAccess()) {
            call.reject("Focus lock needs Display over other apps and Usage access.", "MISSING_PERMISSION");
            return;
        }
        Context context = getContext();
        Intent service = new Intent(context, FocusLockService.class).putExtra(FocusLockService.EXTRA_ENDS_AT, endsAt);
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(service);
            } else {
                context.startService(service);
            }
            call.resolve();
        } catch (Exception error) {
            Log.w(FocusLockService.TAG, "service start failed: " + error);
            call.reject("Focus lock could not start: " + error.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        context.getSharedPreferences(FocusLockService.PREFS, Context.MODE_PRIVATE).edit().remove(FocusLockService.KEY_ENDS_AT).apply();
        context.stopService(new Intent(context, FocusLockService.class));
        call.resolve();
    }

    private boolean open(Intent intent) {
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private boolean canDrawOverlays() {
        return Access.canDrawOverlays(getContext());
    }

    private boolean hasUsageAccess() {
        return Access.hasUsageAccess(getContext());
    }
}
