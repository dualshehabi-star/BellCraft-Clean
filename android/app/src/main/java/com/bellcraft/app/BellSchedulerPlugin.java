package com.bellcraft.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * BellSchedulerPlugin — Capacitor bridge for native AlarmManager bell scheduling.
 *
 * Exposed methods:
 *   scheduleAlarms({ alarms: AlarmSpec[] })           — cancel all then schedule new set
 *   cancelAll()                                        — cancel all pending alarms
 *   getScheduledCount()                                — return { count: number }
 *   updateWidgetData({ periodsJson, activeDaysJson })  — push period data to home-screen widget
 *
 * AlarmSpec: { id, timestamp, label, volume, durationSec, repeatCount }
 *
 * Each alarm fires BellAlarmReceiver → BellRingerService (ForegroundService).
 * The alarm data is persisted in SharedPreferences so BellBootReceiver can
 * re-schedule after a device reboot.
 */
@CapacitorPlugin(name = "BellScheduler")
public class BellSchedulerPlugin extends Plugin {

    static final String PREFS  = "bellcraft_prefs";
    static final String KEY    = "scheduled_alarms_v2";

    // ── Plugin methods ────────────────────────────────────────────────────

    @PluginMethod
    public void scheduleAlarms(PluginCall call) {
        JSArray alarms = call.getArray("alarms");
        if (alarms == null) { call.reject("alarms required"); return; }

        try {
            // JSArray extends JSONArray — parse via string to get a plain JSONArray
            JSONArray json = new JSONArray(alarms.toString());
            cancelAllInternal(getContext());
            int count = scheduleInternal(getContext(), json);

            // Persist for boot-receiver restore.
            // bells_active = true signals BellAlarmReceiver that scheduling is live.
            getContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY, json.toString())
                .putBoolean("bells_active", count > 0)
                .apply();

            JSObject res = new JSObject();
            res.put("scheduled", count);
            call.resolve(res);
        } catch (JSONException e) {
            call.reject("JSON error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelAllInternal(getContext());
        getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY)
            .putBoolean("bells_active", false)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void getScheduledCount(PluginCall call) {
        String saved = getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, "[]");
        int count = 0;
        try { count = new JSONArray(saved).length(); } catch (JSONException ignored) {}
        JSObject res = new JSObject();
        res.put("count", count);
        call.resolve(res);
    }

    // ── Widget data bridge ────────────────────────────────────────────────

    /**
     * Called from JavaScript whenever the active schedule or periods change.
     * Saves serialised period data to SharedPreferences and immediately
     * refreshes all active widget instances on the home screen.
     *
     * Expected call options:
     *   periodsJson   — JSON array of period objects (dayOfWeek, startTime,
     *                   endTime, name, subjectId)
     *   activeDaysJson — JSON array of day numbers (0=Sun … 6=Sat)
     */
    @PluginMethod
    public void updateWidgetData(PluginCall call) {
        String periodsJson   = call.getString("periodsJson",   "[]");
        String activeDaysStr = call.getString("activeDaysJson","[]");

        getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("widget_periods",     periodsJson)
            .putString("widget_active_days", activeDaysStr)
            .apply();

        // Refresh timetable image widget immediately (image widget only)
        TimetableWidgetProvider.refreshAll(getContext());

        call.resolve();
    }

    // ── Static helpers (also used by BellBootReceiver) ────────────────────

    static int scheduleInternal(Context ctx, JSONArray alarms) throws JSONException {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return 0;

        long now = System.currentTimeMillis();
        int scheduled = 0;

        for (int i = 0; i < alarms.length(); i++) {
            JSONObject a = alarms.getJSONObject(i);
            long ts = a.getLong("timestamp");
            if (ts <= now) continue;                // skip past alarms

            String label      = a.optString("label", "جرس الحصة 🔔");
            float  volume     = (float) a.optDouble("volume", 1.0);
            int    durSec     = a.optInt("durationSec", 6);
            int    repeat     = a.optInt("repeatCount", 1);
            int    reqCode    = a.optInt("id", i);
            String soundFile  = a.optString("soundFile", "classic_bell");
            // -1 = absent (special/duty alarm, always ring)
            //  0 = empty period (JS guard already blocked these; kept as
            //      a second line of defence in BellAlarmReceiver)
            // >0 = real subject assigned
            int    subjectId  = a.optInt("subjectId", -1);

            Intent intent = new Intent(BellAlarmReceiver.ACTION_BELL);
            intent.setClass(ctx, BellAlarmReceiver.class);
            intent.putExtra("label",       label);
            intent.putExtra("volume",      volume);
            intent.putExtra("durationSec", durSec);
            intent.putExtra("repeatCount", repeat);
            intent.putExtra("soundFile",   soundFile);
            intent.putExtra("subjectId",   subjectId);

            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, reqCode, intent, flags);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, ts, pi);
            }
            scheduled++;
        }
        return scheduled;
    }

    static void cancelAllInternal(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY, "[]");
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        try {
            JSONArray alarms = new JSONArray(saved);
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject a = alarms.getJSONObject(i);
                int reqCode = a.optInt("id", i);

                Intent intent = new Intent(BellAlarmReceiver.ACTION_BELL);
                intent.setClass(ctx, BellAlarmReceiver.class);
                int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        ? PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                        : PendingIntent.FLAG_NO_CREATE;
                PendingIntent pi = PendingIntent.getBroadcast(ctx, reqCode, intent, flags);
                if (pi != null) { am.cancel(pi); pi.cancel(); }
            }
        } catch (JSONException ignored) {}
    }

    // ── Image helpers: save to gallery & share ────────────────────────────

    /**
     * Save a base64-encoded PNG to the device gallery (Pictures/BellCraft/).
     * Works on Android 5–14+.
     *   Android 10+  → MediaStore (no WRITE_EXTERNAL_STORAGE needed)
     *   Android < 10 → direct file write + media-scanner broadcast
     *
     * Expected call options:
     *   base64   — raw base64 string or data-URL ("data:image/png;base64,…")
     *   fileName — desired filename, e.g. "جدول-الفصل.png"
     */
    @PluginMethod
    public void saveImageToGallery(PluginCall call) {
        String b64  = call.getString("base64", "");
        String name = call.getString("fileName", "timetable.png");
        if (b64 == null || b64.isEmpty()) { call.reject("base64 required"); return; }
        if (b64.contains(",")) b64 = b64.substring(b64.indexOf(',') + 1);

        // Android 9 and below need WRITE_EXTERNAL_STORAGE at runtime.
        // Android 10+ uses MediaStore — no WRITE permission required.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (ActivityCompat.checkSelfPermission(getContext(),
                    android.Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                call.reject("STORAGE_PERMISSION_DENIED: please grant Storage permission in Settings > Apps > BellCraft > Permissions");
                return;
            }
        }

        try {
            byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            Context ctx  = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+ — MediaStore (no WRITE permission needed)
                android.content.ContentValues cv = new android.content.ContentValues();
                cv.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, name);
                cv.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png");
                cv.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH,
                        android.os.Environment.DIRECTORY_PICTURES + "/BellCraft");
                cv.put(android.provider.MediaStore.Images.Media.IS_PENDING, 1);
                android.net.Uri uri = ctx.getContentResolver()
                        .insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) { call.reject("MediaStore insert returned null URI"); return; }
                try (java.io.OutputStream os = ctx.getContentResolver().openOutputStream(uri)) {
                    if (os == null) { call.reject("Cannot open OutputStream for MediaStore URI"); return; }
                    os.write(bytes);
                }
                cv.clear();
                cv.put(android.provider.MediaStore.Images.Media.IS_PENDING, 0);
                ctx.getContentResolver().update(uri, cv, null, null);
            } else {
                // Android 9 and below — direct file write to Pictures/BellCraft/
                java.io.File dir = new java.io.File(
                        android.os.Environment.getExternalStoragePublicDirectory(
                                android.os.Environment.DIRECTORY_PICTURES), "BellCraft");
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("Cannot create directory: " + dir.getAbsolutePath());
                    return;
                }
                java.io.File f = new java.io.File(dir, sanitizeFileName(name));
                try (java.io.FileOutputStream fos = new java.io.FileOutputStream(f)) { fos.write(bytes); }
                ctx.sendBroadcast(new android.content.Intent(
                        android.content.Intent.ACTION_MEDIA_SCANNER_SCAN_FILE,
                        android.net.Uri.fromFile(f)));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("saveImageToGallery failed: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /**
     * Write the image to the app cache dir and open the native Android share sheet.
     *
     * Expected call options:
     *   base64   — raw base64 string or data-URL
     *   fileName — filename used in the share payload
     */
    @PluginMethod
    public void shareImageFile(PluginCall call) {
        String b64  = call.getString("base64", "");
        String name = call.getString("fileName", "timetable.png");
        if (b64 == null || b64.isEmpty()) { call.reject("base64 required"); return; }
        if (b64.contains(",")) b64 = b64.substring(b64.indexOf(',') + 1);
        try {
            byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            Context ctx  = getContext();

            // Use a safe ASCII filename for the cache file.
            // Non-ASCII filenames (Arabic, etc.) can cause FileProvider URI
            // issues on some Android versions or third-party apps.
            java.io.File f = new java.io.File(ctx.getCacheDir(), "bellcraft_timetable.png");
            try (java.io.FileOutputStream fos = new java.io.FileOutputStream(f)) { fos.write(bytes); }

            android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(
                    ctx, ctx.getPackageName() + ".fileprovider", f);

            android.content.Intent share = new android.content.Intent(
                    android.content.Intent.ACTION_SEND);
            share.setType("image/png");
            share.putExtra(android.content.Intent.EXTRA_STREAM, uri);
            share.putExtra(android.content.Intent.EXTRA_SUBJECT, name);
            share.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);

            android.content.Intent chooser =
                    android.content.Intent.createChooser(share, "مشاركة الجدول");

            // Prefer getActivity() so the share sheet stacks correctly in the
            // existing task.  Fall back to Application context with NEW_TASK.
            Activity activity = getActivity();
            if (activity != null) {
                activity.startActivity(chooser);
            } else {
                chooser.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(chooser);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("shareImageFile failed: " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /** Replace non-ASCII characters and path-unsafe characters with underscores. */
    private static String sanitizeFileName(String name) {
        if (name == null) return "timetable.png";
        return name.replaceAll("[^a-zA-Z0-9._\\-]", "_");
    }

    // ── Timetable image widget ────────────────────────────────────────────

    /**
     * Save a base64-encoded PNG to internal storage and refresh the
     * TimetableWidgetProvider so the home-screen widget shows the new image.
     *
     * Expected call options:
     *   base64 — raw base64 string or data-URL ("data:image/png;base64,…")
     */
    @PluginMethod
    public void setTimetableWidgetImage(PluginCall call) {
        String b64 = call.getString("base64", "");
        if (b64 == null || b64.isEmpty()) { call.reject("base64 required"); return; }
        if (b64.contains(",")) b64 = b64.substring(b64.indexOf(',') + 1);
        try {
            byte[] bytes = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            java.io.File dest = new java.io.File(
                    getContext().getFilesDir(), TimetableWidgetProvider.IMAGE_FILE);
            try (java.io.FileOutputStream fos = new java.io.FileOutputStream(dest)) {
                fos.write(bytes);
            }
            TimetableWidgetProvider.refreshAll(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("setTimetableWidgetImage failed: " + e.getMessage());
        }
    }

    /** Called by BellBootReceiver to restore alarms after reboot. */
    static void rescheduleFromPrefs(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY, "[]");
        try {
            JSONArray alarms = new JSONArray(saved);
            // Remove past alarms and re-save the future ones
            JSONArray future = new JSONArray();
            long now = System.currentTimeMillis();
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject a = alarms.getJSONObject(i);
                if (a.getLong("timestamp") > now) future.put(a);
            }
            int count = scheduleInternal(ctx, future);
            // Keep bells_active in sync so BellAlarmReceiver knows whether
            // any live alarms were actually restored after this reboot.
            prefs.edit()
                    .putString(KEY, future.toString())
                    .putBoolean("bells_active", count > 0)
                    .apply();
        } catch (JSONException ignored) {}
    }
}
