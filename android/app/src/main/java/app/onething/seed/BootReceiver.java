package app.onething.seed;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Brings the scroll bubble back after a phone restart or an app update, when the user had it on.
 * Before this, the bubble came back only when the user opened One Thing again.
 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }
        boolean on = context.getSharedPreferences(ScrollWatchService.PREFS, Context.MODE_PRIVATE).getBoolean(ScrollWatchService.KEY_ON, false);
        if (!on || !Access.canDrawOverlays(context) || !Access.hasUsageAccess(context)) return;
        try {
            Intent service = new Intent(context, ScrollWatchService.class);
            if (Build.VERSION.SDK_INT >= 26) {
                context.startForegroundService(service);
            } else {
                context.startService(service);
            }
            Log.i(ScrollWatchService.TAG, "bubble back after " + action);
        } catch (Exception error) {
            Log.w(ScrollWatchService.TAG, "bubble restart refused: " + error); // it comes back when the app opens
        }
    }
}
