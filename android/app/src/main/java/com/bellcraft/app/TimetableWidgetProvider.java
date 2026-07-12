package com.bellcraft.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.File;
import java.util.Calendar;

/**
 * TimetableWidgetProvider — Home-screen App Widget that displays the
 * saved timetable image (PNG captured from the schedule grid).
 *
 * Data flow:
 *   JS captureGrid() → base64 PNG
 *     → BellSchedulerPlugin.setTimetableWidgetImage()
 *     → ctx.getFilesDir()/timetable_widget.png
 *     → TimetableWidgetProvider.refreshAll()
 *     → RemoteViews.setImageViewBitmap(R.id.iv_timetable, scaledBitmap)
 *
 * Common crash causes that are handled here:
 *   1. setImageViewBitmap(null) — NEVER pass null; hide the ImageView instead.
 *   2. TransactionTooLargeException — scale the bitmap before IPC.
 *   3. OutOfMemoryError from decodeFile — use inSampleSize + try-catch.
 *   4. Any exception in onUpdate — caught so the widget always adds.
 *
 * ── Logcat filtering ──────────────────────────────────────────────────────
 *   adb logcat -s BellCraftWidget
 *
 * The widget shows placeholder text when no image has been saved yet.
 * Tapping the widget opens the BellCraft app.
 */
public class TimetableWidgetProvider extends AppWidgetProvider {

    /** Use this tag in adb logcat: adb logcat -s BellCraftWidget */
    static final String TAG = "BellCraftWidget";

    /** Fixed filename for the timetable snapshot stored in internal storage. */
    static final String IMAGE_FILE = "timetable_widget.png";

    /**
     * Maximum number of pixels (width × height) we allow through binder IPC.
     * RemoteViews are limited to ~1 MB uncompressed; at 2 bytes/px (RGB_565)
     * that is ~512 K px.  800×600 = 480 000 — comfortably under the limit.
     */
    private static final int MAX_PIXELS = 800 * 600;

    // ── AppWidgetProvider callbacks ───────────────────────────────────────

    @Override
    public void onEnabled(Context ctx) {
        Log.i(TAG, "TimetableWidget: onEnabled — first instance added");
    }

    @Override
    public void onDisabled(Context ctx) {
        Log.i(TAG, "TimetableWidget: onDisabled — last instance removed");
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        Log.d(TAG, "TimetableWidget: onUpdate() for " + ids.length + " widget(s): " + intArrayStr(ids));
        for (int id : ids) {
            Log.d(TAG, "TimetableWidget: updating widget id=" + id);
            try {
                updateWidget(ctx, mgr, id);
                Log.d(TAG, "TimetableWidget: widget id=" + id + " updated successfully");
            } catch (Exception e) {
                // ─────────────────────────────────────────────────────────
                // If you see "Unable to add widget" on the home screen, this
                // log line will show the EXACT exception that caused it.
                // ─────────────────────────────────────────────────────────
                Log.e(TAG, "TimetableWidget: onUpdate FAILED for id=" + id
                        + " — this is why Android shows 'Unable to add widget'", e);
                showFallback(ctx, mgr, id);
            }
        }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        Log.v(TAG, "TimetableWidget: onReceive action=" + intent.getAction());
        super.onReceive(ctx, intent);
    }

    // ── Widget rendering ──────────────────────────────────────────────────

    private static void updateWidget(Context ctx, AppWidgetManager mgr, int widgetId) {
        Log.d(TAG, "TimetableWidget: updateWidget() — pkg=" + ctx.getPackageName()
                + " layout=widget_timetable");

        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_timetable);
        Log.d(TAG, "TimetableWidget: RemoteViews created");

        // ── Load the timetable image ──────────────────────────────────────
        Bitmap bmp = loadScaledTimetableBitmap(ctx);

        if (bmp != null) {
            Log.d(TAG, "TimetableWidget: bitmap loaded — showing image "
                    + bmp.getWidth() + "×" + bmp.getHeight() + " px");
            // Image is available — show it; hide the placeholder.
            // NOTE: setImageViewBitmap MUST NOT be called with null — it
            //       causes NPE when RemoteViews is parcelled.  We only call it
            //       here when bmp is guaranteed non-null.
            views.setImageViewBitmap(R.id.iv_timetable, bmp);
            views.setViewVisibility(R.id.iv_timetable,             View.VISIBLE);
            views.setViewVisibility(R.id.tv_timetable_placeholder, View.GONE);
        } else {
            Log.d(TAG, "TimetableWidget: no timetable image — showing placeholder text");
            // No image yet — hide ImageView (never call setImageViewBitmap(null)!)
            views.setViewVisibility(R.id.iv_timetable,             View.GONE);
            views.setViewVisibility(R.id.tv_timetable_placeholder, View.VISIBLE);
        }

        // ── Holiday badge (shown on top of the image when today is off) ──
        boolean holiday = isTodayHoliday(ctx);
        Log.d(TAG, "TimetableWidget: isTodayHoliday=" + holiday);
        views.setViewVisibility(R.id.tv_holiday_badge,
                holiday ? View.VISIBLE : View.GONE);

        // ── Tap → open app ────────────────────────────────────────────────
        Intent launch = new Intent(ctx, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pi = PendingIntent.getActivity(ctx, 8100, launch, piFlags);
        views.setOnClickPendingIntent(R.id.widget_timetable_root, pi);
        Log.d(TAG, "TimetableWidget: tap PendingIntent attached");

        // ── Push RemoteViews to launcher ──────────────────────────────────
        mgr.updateAppWidget(widgetId, views);
        Log.d(TAG, "TimetableWidget: AppWidgetManager.updateAppWidget() succeeded for id=" + widgetId);
    }

    /**
     * Minimal safe layout shown when updateWidget() throws so the widget is
     * always added to the home screen even when something goes wrong.
     */
    private static void showFallback(Context ctx, AppWidgetManager mgr, int widgetId) {
        Log.w(TAG, "TimetableWidget: showing safe fallback for id=" + widgetId);
        try {
            RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_timetable);
            views.setViewVisibility(R.id.iv_timetable,             View.GONE);
            views.setViewVisibility(R.id.tv_timetable_placeholder, View.VISIBLE);
            mgr.updateAppWidget(widgetId, views);
        } catch (Exception e) {
            Log.e(TAG, "TimetableWidget: showFallback also failed — widget may be stuck", e);
        }
    }

    // ── Bitmap loading with safe scaling ─────────────────────────────────

    /**
     * Load the saved timetable PNG from internal storage, scaled down so it
     * fits within MAX_PIXELS to avoid TransactionTooLargeException over IPC.
     * Returns null if no image file exists or decoding fails.
     */
    static Bitmap loadScaledTimetableBitmap(Context ctx) {
        File f = new File(ctx.getFilesDir(), IMAGE_FILE);
        Log.d(TAG, "TimetableWidget: image path=" + f.getAbsolutePath()
                + " exists=" + f.exists()
                + " size=" + (f.exists() ? f.length() + " bytes" : "n/a"));

        if (!f.exists()) {
            Log.d(TAG, "TimetableWidget: no timetable image file — user hasn't exported yet");
            return null;
        }

        try {
            // ── Pass 1: read dimensions only (no pixel memory allocated) ──
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getAbsolutePath(), opts);

            int w = opts.outWidth;
            int h = opts.outHeight;
            Log.d(TAG, "TimetableWidget: raw image size=" + w + "×" + h
                    + " mimeType=" + opts.outMimeType);

            if (w <= 0 || h <= 0) {
                Log.e(TAG, "TimetableWidget: BitmapFactory could not read dimensions"
                        + " — file may be corrupt");
                return null;
            }

            // ── Compute power-of-2 sample size ────────────────────────────
            // Downsample until decoded pixels ≤ MAX_PIXELS.
            int sample = 1;
            while ((w / sample) * (h / sample) > MAX_PIXELS) sample *= 2;
            Log.d(TAG, "TimetableWidget: inSampleSize=" + sample
                    + " → decoded ~" + (w / sample) + "×" + (h / sample) + " px"
                    + " (MAX_PIXELS=" + MAX_PIXELS + ")");

            // ── Pass 2: decode pixels at reduced resolution ────────────────
            opts.inJustDecodeBounds = false;
            opts.inSampleSize       = sample;
            opts.inPreferredConfig  = Bitmap.Config.RGB_565; // 2 bytes/px vs 4 for ARGB_8888

            Bitmap bmp = BitmapFactory.decodeFile(f.getAbsolutePath(), opts);
            if (bmp == null) {
                Log.e(TAG, "TimetableWidget: BitmapFactory.decodeFile returned null"
                        + " — file may be corrupt or OOM");
            } else {
                int bytes = bmp.getByteCount();
                Log.d(TAG, "TimetableWidget: bitmap decoded OK — "
                        + bmp.getWidth() + "×" + bmp.getHeight()
                        + " " + bmp.getConfig()
                        + " " + bytes + " bytes in memory");
                if (bytes > 900_000) {
                    Log.w(TAG, "TimetableWidget: bitmap is " + bytes + " bytes"
                            + " — approaching 1 MB binder limit;"
                            + " TransactionTooLargeException risk");
                }
            }
            return bmp;

        } catch (OutOfMemoryError oom) {
            Log.e(TAG, "TimetableWidget: OutOfMemoryError loading timetable image", oom);
            return null;
        } catch (Exception e) {
            Log.e(TAG, "TimetableWidget: unexpected error loading timetable image", e);
            return null;
        }
    }

    /**
     * Returns true when today's day-of-week is NOT in the schedule's active
     * days — meaning it's a holiday and the "إجازة اليوم" badge should be shown.
     *
     * Reads the same SharedPreferences key ("widget_active_days") that
     * BellSchedulerPlugin writes via updateWidgetData().
     * Returns false (no badge) when the prefs are empty or parsing fails —
     * we prefer to hide the badge rather than incorrectly show it.
     */
    private static boolean isTodayHoliday(Context ctx) {
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(
                    BellSchedulerPlugin.PREFS, Context.MODE_PRIVATE);
            String activeDaysStr = prefs.getString("widget_active_days", "[]");
            if (activeDaysStr == null || activeDaysStr.equals("[]")) {
                Log.d(TAG, "TimetableWidget: isTodayHoliday — activeDays empty → not holiday");
                return false;
            }
            JSONArray activeDays = new JSONArray(activeDaysStr);
            if (activeDays.length() == 0) return false;

            int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1; // 0=Sun…6=Sat
            for (int i = 0; i < activeDays.length(); i++) {
                if (activeDays.getInt(i) == dow) return false; // today is a school day
            }
            Log.d(TAG, "TimetableWidget: isTodayHoliday — dow=" + dow + " → holiday");
            return true;
        } catch (JSONException e) {
            Log.e(TAG, "TimetableWidget: isTodayHoliday — JSON error", e);
            return false;
        } catch (Exception e) {
            Log.e(TAG, "TimetableWidget: isTodayHoliday — unexpected error", e);
            return false;
        }
    }

    /**
     * Called from BellSchedulerPlugin after a new timetable image is saved.
     * Immediately refreshes all active widget instances on the home screen.
     */
    static void refreshAll(Context ctx) {
        Log.d(TAG, "TimetableWidget: refreshAll() called");
        try {
            AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
            ComponentName cn = new ComponentName(ctx, TimetableWidgetProvider.class);
            int[] ids = mgr.getAppWidgetIds(cn);
            Log.d(TAG, "TimetableWidget: refreshAll — " + ids.length + " active instance(s)");
            for (int id : ids) {
                try {
                    updateWidget(ctx, mgr, id);
                } catch (Exception e) {
                    Log.e(TAG, "TimetableWidget: refreshAll — updateWidget failed for id=" + id, e);
                    showFallback(ctx, mgr, id);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "TimetableWidget: refreshAll failed entirely", e);
        }
    }

    // ── Utility ───────────────────────────────────────────────────────────

    private static String intArrayStr(int[] arr) {
        if (arr == null || arr.length == 0) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < arr.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append(arr[i]);
        }
        return sb.append("]").toString();
    }
}
