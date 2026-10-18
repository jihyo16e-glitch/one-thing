package app.onething.seed;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;

/**
 * One Thing: hands the last crash report (written by MainActivity) to the web app, so the next
 * start can show it on screen. There is no other way to see a crash without a cable and adb.
 */
@CapacitorPlugin(name = "CrashLog")
public class CrashLogPlugin extends Plugin {

    static final String FILE_NAME = "last-crash.txt";

    @PluginMethod
    public void read(PluginCall call) {
        String text = "";
        File file = new File(getContext().getFilesDir(), FILE_NAME);
        if (file.exists()) {
            try (FileInputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                int n;
                while ((n = in.read(buffer)) > 0) {
                    out.write(buffer, 0, n);
                }
                text = new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception ignored) {
                text = "";
            }
        }
        JSObject result = new JSObject();
        result.put("text", text);
        call.resolve(result);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            new File(getContext().getFilesDir(), FILE_NAME).delete();
        } catch (Exception ignored) {
            // nothing to clear
        }
        call.resolve();
    }
}
