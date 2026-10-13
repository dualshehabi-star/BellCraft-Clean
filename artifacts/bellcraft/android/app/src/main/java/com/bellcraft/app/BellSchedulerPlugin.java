package com.bellcraft.app;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import java.util.Calendar;

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
 *   setDisabledPeriodAlertIds({ periodIds: number[] }) — persist pre-start exclusions
 *   setDisabledPreEndPeriodAlertIds({ periodIds: number[] }) — persist pre-end exclusions
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
    static final Object ALARM_LOCK = new Object();

    static boolean canSchedule(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        return am != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms());
    }

    @PluginMethod
    public void getAlarmPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("exactAlarm", canSchedule(getContext()));
        result.put("notifications", Build.VERSION.SDK_INT < 33 ||
                ActivityCompat.checkSelfPermission(getContext(), android.Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void getCompletedAlarms(PluginCall call) {
        JSObject result = new JSObject();
        try {
            result.put("occurrences", new JSArray(getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getString("completed_occurrences", "[]")));
            call.resolve(result);
        } catch (JSONException e) {
            call.reject("INVALID_COMPLETION_RECORDS");
        }
    }

    // ── Plugin methods ────────────────────────────────────────────────────

    @PluginMethod
    public void scheduleAlarms(PluginCall call) {
        JSArray alarms = call.getArray("alarms");
        if (alarms == null) { call.reject("alarms required"); return; }

        synchronized (ALARM_LOCK) { try {
            // JSArray extends JSONArray — parse via string to get a plain JSONArray
            JSONArray json = new JSONArray(alarms.toString());
            java.util.HashSet<Integer> ids = new java.util.HashSet<>();
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            long generation = prefs.getLong("alarm_generation", 0) + 1;
            JSONArray future = new JSONArray();
            for (int i = 0; i < json.length(); i++) {
                JSONObject alarm = json.getJSONObject(i);
                if (!ids.add(alarm.getInt("id"))) throw new JSONException("Duplicate alarm id");
                alarm.put("generation", generation);
                if (alarm.getLong("timestamp") <= System.currentTimeMillis()) {
                    long next = nextAlarmTimestamp(alarm, System.currentTimeMillis());
                    if (next <= System.currentTimeMillis()) continue;
                    alarm.put("timestamp", next);
                }
                persistCustomSound(getContext(), alarm);
                future.put(alarm);
            }
            cancelAllInternal(getContext());
            // Commit the entire desired schedule and preferences as one batch,
            // before arming. Permission denial retains it for a later grant.
            prefs.edit().putString(KEY, future.toString())
                .putLong("alarm_generation", generation)
                .putString("disabled_prestart_period_ids", arrayString(call, "disabledPreStart"))
                .putString("disabled_preend_period_ids", arrayString(call, "disabledPreEnd"))
                .putString("disabled_end_period_ids", arrayString(call, "disabledEnd"))
                .putBoolean("bells_active", false).commit();
            if (!canSchedule(getContext()) && future.length() > 0) {
                call.reject("EXACT_ALARM_PERMISSION_REQUIRED");
                return;
            }
            int count = scheduleInternal(getContext(), future);
            prefs.edit().putBoolean("bells_active", count > 0).commit();

            JSObject res = new JSObject();
            res.put("scheduled", count);
            call.resolve(res);
        } catch (Exception e) {
            Log.e("BellScheduler", "Cannot replace alarm schedule", e);
            call.reject("ALARM_SCHEDULE_FAILED: " + e.getMessage());
        } }
    }

    private static String arrayString(PluginCall call, String key) {
        JSArray array = call.getArray(key);
        return array == null ? "[]" : array.toString();
    }

    private static void persistCustomSound(Context ctx, JSONObject alarm) throws Exception {
        String data = alarm.optString("customSoundData", "");
        if (data.isEmpty()) return;
        if (!data.startsWith("data:audio/") || !data.contains(";base64,")) {
            throw new IllegalArgumentException("INVALID_CUSTOM_SOUND");
        }
        byte[] bytes = android.util.Base64.decode(data.substring(data.indexOf(',') + 1),
                android.util.Base64.DEFAULT);
        if (bytes.length == 0 || bytes.length > 8 * 1024 * 1024) {
            throw new IllegalArgumentException("INVALID_CUSTOM_SOUND_SIZE");
        }
        byte[] hash = java.security.MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder name = new StringBuilder();
        for (byte b : hash) name.append(String.format(java.util.Locale.US, "%02x", b & 255));
        java.io.File dir = new java.io.File(ctx.getFilesDir(), "bell-sounds");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new java.io.IOException("Cannot create sound directory");
        java.io.File file = new java.io.File(dir, name + ".audio");
        if (!file.exists()) try (java.io.FileOutputStream out = new java.io.FileOutputStream(file)) {
            out.write(bytes);
        }
        alarm.put("customSoundPath", file.getAbsolutePath());
        alarm.remove("customSoundData"); // never put multi-MB audio in an Intent
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        synchronized (ALARM_LOCK) {
        cancelAllInternal(getContext());
        getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY)
            .putBoolean("bells_active", false)
            .apply();
        call.resolve();
        }
    }

    @PluginMethod
    public void setDisabledPeriodAlertIds(PluginCall call) {
        JSArray periodIds = call.getArray("periodIds");
        getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("disabled_prestart_period_ids", periodIds == null ? "[]" : periodIds.toString())
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void setDisabledPreEndPeriodAlertIds(PluginCall call) {
        JSArray periodIds = call.getArray("periodIds");
        getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString("disabled_preend_period_ids", periodIds == null ? "[]" : periodIds.toString())
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

    /**
     * Compute the next local-time occurrence for a repeating special task.
     * The saved task date is its start date; recurrence continues indefinitely
     * from that date, including after a device reboot.
     */
    static long nextSpecialTaskTimestamp(JSONObject alarm, long afterMs) {
        String repeatType = alarm.optString("taskRepeatType", "once");
        if (!"daily".equals(repeatType) && !"specific-days".equals(repeatType)) return -1L;

        try {
            String[] dateParts = alarm.optString("taskDate", "").split("-");
            String[] timeParts = alarm.optString("taskTime", "").split(":");
            if (dateParts.length != 3 || timeParts.length != 2) return -1L;

            int year = Integer.parseInt(dateParts[0]);
            int month = Integer.parseInt(dateParts[1]) - 1;
            int day = Integer.parseInt(dateParts[2]);
            int hour = Integer.parseInt(timeParts[0]);
            int minute = Integer.parseInt(timeParts[1]);
            if (month < 0 || month > 11 || day < 1 || day > 31
                    || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                return -1L;
            }

            Calendar anchor = Calendar.getInstance();
            anchor.clear();
            anchor.setLenient(false);
            anchor.set(year, month, day, hour, minute, 0);
            long anchorMs = anchor.getTimeInMillis();

            JSONArray repeatDays = alarm.optJSONArray("taskRepeatDays");
            if ("specific-days".equals(repeatType)
                    && (repeatDays == null || repeatDays.length() == 0)) {
                return -1L;
            }

            Calendar cursor = Calendar.getInstance();
            cursor.setTimeInMillis(anchorMs);
            cursor.set(Calendar.HOUR_OF_DAY, 0);
            cursor.set(Calendar.MINUTE, 0);
            cursor.set(Calendar.SECOND, 0);
            cursor.set(Calendar.MILLISECOND, 0);

            Calendar today = Calendar.getInstance();
            today.setTimeInMillis(afterMs);
            today.set(Calendar.HOUR_OF_DAY, 0);
            today.set(Calendar.MINUTE, 0);
            today.set(Calendar.SECOND, 0);
            today.set(Calendar.MILLISECOND, 0);
            if (today.after(cursor)) cursor.setTimeInMillis(today.getTimeInMillis());

            for (int offset = 0; offset <= 7; offset++) {
                Calendar candidate = (Calendar) cursor.clone();
                candidate.set(Calendar.HOUR_OF_DAY, hour);
                candidate.set(Calendar.MINUTE, minute);
                candidate.set(Calendar.SECOND, 0);
                candidate.set(Calendar.MILLISECOND, 0);

                boolean dayMatches = "daily".equals(repeatType);
                if (!dayMatches) {
                    int dayOfWeek = candidate.get(Calendar.DAY_OF_WEEK) - 1;
                    for (int i = 0; i < repeatDays.length(); i++) {
                        if (repeatDays.optInt(i, -1) == dayOfWeek) {
                            dayMatches = true;
                            break;
                        }
                    }
                }
                if (dayMatches && candidate.getTimeInMillis() > afterMs) {
                    return candidate.getTimeInMillis();
                }
                cursor.add(Calendar.DATE, 1);
            }
        } catch (Exception ignored) {
            // Invalid stored task data cannot produce a safe alarm.
        }
        return -1L;
    }

    static long nextAlarmTimestamp(JSONObject alarm, long after) {
        if (alarm.has("weeklyDay")) {
            return BellRecurrence.next("", alarm.optString("localTime", ""),
                    "specific-days", new int[] { alarm.optInt("weeklyDay", -1) }, after);
        }
        String type = alarm.optString("taskRepeatType", "once");
        JSONArray jsonDays = alarm.optJSONArray("taskRepeatDays");
        int[] days = new int[jsonDays == null ? 0 : jsonDays.length()];
        for (int i = 0; i < days.length; i++) days[i] = jsonDays.optInt(i, -1);
        if (!alarm.optString("taskId", "").isEmpty()) {
            return BellRecurrence.next(alarm.optString("taskDate", ""),
                    alarm.optString("taskTime", ""), type, days, after);
        }
        if (alarm.has("localDate")) {
            return BellRecurrence.next(alarm.optString("localDate", ""),
                    alarm.optString("localTime", ""), "once", null, after);
        }
        return -1L;
    }

    static int scheduleInternal(Context ctx, JSONArray alarms) throws JSONException {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return 0;

        long now = System.currentTimeMillis();
        int scheduled = 0;

        for (int i = 0; i < alarms.length(); i++) {
            JSONObject a = alarms.getJSONObject(i);
            long ts = a.getLong("timestamp");
            if (ts <= now) {
                ts = nextAlarmTimestamp(a, now);
                if (ts <= now) continue;
                a.put("timestamp", ts);
            }

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
            intent.putExtra("periodId",    a.optInt("periodId", -1));
            intent.putExtra("bellType",    a.optString("bellType", ""));
            intent.putExtra("alarmId", reqCode);
            intent.putExtra("scheduledTimestamp", ts);
            intent.putExtra("generation", a.optLong("generation", 0));
            intent.putExtra("customSoundPath", a.optString("customSoundPath", ""));
            intent.putExtra("taskId", a.optString("taskId", ""));
            intent.putExtra("taskRepeatType", a.optString("taskRepeatType", "once"));
            intent.putExtra("taskRepeatDays",
                    a.optJSONArray("taskRepeatDays") == null
                            ? "[]"
                            : a.optJSONArray("taskRepeatDays").toString());
            intent.putExtra("taskDate", a.optString("taskDate", ""));
            intent.putExtra("taskTime", a.optString("taskTime", ""));

            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent pi = PendingIntent.getBroadcast(ctx, reqCode, intent, flags);

            // User-visible alarm clocks are not subject to the idle quota
            // that can delay closely spaced pre-start/start/end alarms.
            Intent show = new Intent(ctx, MainActivity.class);
            PendingIntent showApp = PendingIntent.getActivity(ctx, 0, show,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(ts, showApp), pi);
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
        synchronized (ALARM_LOCK) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY, "[]");
        try {
            JSONArray alarms = new JSONArray(saved);
            // Keep future alarms and move missed recurring occurrences forward.
            JSONArray future = new JSONArray();
            long now = System.currentTimeMillis();
            for (int i = 0; i < alarms.length(); i++) {
                JSONObject a = alarms.getJSONObject(i);
                long timestamp = a.getLong("timestamp");
                String repeatType = a.optString("taskRepeatType", "once");
                boolean repeatingTask = a.has("weeklyDay") || a.has("localDate")
                        || !a.optString("taskId", "").isEmpty();
                if (repeatingTask) {
                    // A wall-clock recurrence follows the device's current
                    // timezone, including after a timezone change or reboot.
                    timestamp = nextAlarmTimestamp(a, now);
                    if (timestamp <= now) continue;
                    a.put("timestamp", timestamp);
                } else if (timestamp <= now) {
                    timestamp = nextAlarmTimestamp(a, now);
                    if (timestamp <= now) continue;
                    a.put("timestamp", timestamp);
                }
                future.put(a);
            }
            cancelAllInternal(ctx);
            prefs.edit().putString(KEY, future.toString()).commit();
            int count = canSchedule(ctx) ? scheduleInternal(ctx, future) : 0;
            // Keep bells_active in sync so BellAlarmReceiver knows whether
            // any live alarms were actually restored after this reboot.
            prefs.edit()
                    .putString(KEY, future.toString())
                    .putBoolean("bells_active", count > 0)
                    .apply();
        } catch (Exception e) {
            Log.e("BellScheduler", "Cannot restore alarms", e);
            prefs.edit().putBoolean("bells_active", false).commit();
        }
        }
    }
}
