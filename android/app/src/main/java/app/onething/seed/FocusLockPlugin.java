package app.onething.seed;

import android.Manifest;
import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
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
        Double endsAt = call.getDouble("endsAt");
        if (endsAt == null || endsAt <= System.currentTimeMillis()) {
            call.reject("endsAt must be a time in the future.");
            return;
        }
        if (!canDrawOverlays() || !hasUsageAccess()) {
            call.reject("Focus lock needs Display over other apps and Usage access.", "MISSING_PERMISSION");
            return;
        }
        Context context = getContext();
        Intent service = new Intent(context, FocusLockService.class).putExtra(FocusLockService.EXTRA_ENDS_AT, endsAt.longValue());
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(service);
            } else {
                context.startService(service);
            }
            call.resolve();
        } catch (Exception error) {
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
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(getContext());
    }

    @SuppressWarnings("deprecation")
    private boolean hasUsageAccess() {
        Context context = getContext();
        AppOpsManager ops = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
        if (ops == null) return false;
        int mode = Build.VERSION.SDK_INT >= 29
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.getPackageName());
        if (mode == AppOpsManager.MODE_DEFAULT) {
            return context.checkCallingOrSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED;
        }
        return mode == AppOpsManager.MODE_ALLOWED;
    }
}
