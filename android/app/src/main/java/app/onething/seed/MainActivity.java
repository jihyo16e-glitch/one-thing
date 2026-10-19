package app.onething.seed;

import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.Date;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        installCrashRecorder();
        registerPlugin(CrashLogPlugin.class); // before super.onCreate, which builds the bridge
        registerPlugin(FocusLockPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * When the app crashes, save the error to a file first (CrashLogPlugin shows it at the next
     * start), then let Android close the app as usual.
     */
    private void installCrashRecorder() {
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        final File file = new File(getFilesDir(), CrashLogPlugin.FILE_NAME);
        String version = "?";
        try {
            version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {
            // keep "?"
        }
        final String appVersion = version;
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                StringWriter trace = new StringWriter();
                error.printStackTrace(new PrintWriter(trace));
                String text =
                    "Time: " + new Date() + "\n" +
                    "App: " + appVersion + "\n" +
                    "Phone: " + Build.MANUFACTURER + " " + Build.MODEL + ", Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")\n" +
                    "Thread: " + thread.getName() + "\n\n" +
                    trace;
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(text.getBytes(StandardCharsets.UTF_8));
                }
            } catch (Throwable ignored) {
                // never let the recorder hide the real crash
            }
            if (previous != null) {
                previous.uncaughtException(thread, error);
            }
        });
    }
}
