package com.bellcraft.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;

import java.util.Calendar;

/**
 * BellAlarmReceiver
 *
 * Receives exact AlarmManager broadcasts and starts BellRingerService.
 * Runs even when the app is completely closed.
 *
 * Guard layers applied in order before starting the ringer:
 *
 *   1. bells_active flag  — false when the user disabled autoRing or enabled
 *                           vacation mode.  Catches the edge case where an
 *                           alarm fires after settings changed but before the
 *                           JS re-schedule cancelled the pending intents.
 *
 *   2. Active-day check   — drops the alarm if today is not a configured school
 *                           day.  Defence-in-depth against any scenario where
 *                           an alarm was scheduled for a non-school day.
 *
 *   3. Subject guard       — drops the alarm if subjectId == 0 (empty / free
 *                           period with no subject assigned).
 *                           subjectId < 0 means "special / duty alarm" and
 *                           always rings regardless of subject or day.
 */
public class BellAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "BellAlarmReceiver";

    public static final String ACTION_BELL = "com.bellcraft.app.ACTION_BELL";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_BELL.equals(intent.getAction())) return;

        SharedPreferences prefs = context.getSharedPreferences(
                BellSchedulerPlugin.PREFS, Context.MODE_PRIVATE);

        // ── Guard 1: bells_active ─────────────────────────────────────────
        // Set to false by cancelAll() (called whenever autoRing is turned off
        // or vacation mode is enabled).  Default true for backward-compat with
        // existing installs that predate this key.
        boolean bellsActive = prefs.getBoolean("bells_active", true);
        if (!bellsActive) {
            Log.d(TAG, "Dropping alarm — bells_active=false "
                    + "(autoRing off or vacation mode on).");
            return;
        }

        // ── Guard 2: active-day check ─────────────────────────────────────
        // widget_active_days is written by updateWidgetData() and by
        // scheduleNativeBells() via saveWidgetData().
        // Format: JSON array of 0-based day-of-week integers (0=Sun … 6=Sat).
        // Special / duty alarms have subjectId < 0 and bypass this check so
        // they always ring on the scheduled date regardless of the school week.
        int subjectIdPeek = intent.getIntExtra("subjectId", -1);
        if (subjectIdPeek > 0) {  // only regular class alarms are day-checked
            String activeDaysJson = prefs.getString("widget_active_days", "");
            if (activeDaysJson != null
                    && !activeDaysJson.isEmpty()
                    && !activeDaysJson.equals("[]")) {
                try {
                    JSONArray activeDays = new JSONArray(activeDaysJson);
                    if (activeDays.length() > 0) {
                        // Calendar.DAY_OF_WEEK: 1=Sun … 7=Sat  →  subtract 1
                        int dow = Calendar.getInstance()
                                .get(Calendar.DAY_OF_WEEK) - 1;
                        boolean todayActive = false;
                        for (int i = 0; i < activeDays.length(); i++) {
                            if (activeDays.getInt(i) == dow) {
                                todayActive = true;
                                break;
                            }
                        }
                        if (!todayActive) {
                            Log.d(TAG, "Dropping alarm — today (dow=" + dow
                                    + ") is not an active school day."
                                    + " activeDays=" + activeDaysJson);
                            return;
                        }
                    }
                } catch (Exception e) {
                    // Malformed JSON — fail open (allow alarm) and log.
                    Log.w(TAG, "Failed to parse widget_active_days, "
                            + "allowing alarm: " + e.getMessage());
                }
            }
            // If widget_active_days is absent / empty, fail open: the alarm was
            // scheduled correctly and we have no override data to block it.
        }

        // ── Guard 3: subject guard ────────────────────────────────────────
        // Default -1: field absent → special / duty alarm → always ring.
        // Value   0: empty timetable slot → no class → never ring.
        // Value  >0: real subject assigned → ring normally.
        int subjectId = subjectIdPeek;
        if (subjectId == 0) {
            Log.d(TAG, "Dropping alarm — empty period (subjectId=0), "
                    + "no class scheduled.");
            return;
        }

        // All guards passed — start the ringer service.
        Intent svc = new Intent(context, BellRingerService.class);
        svc.putExtra("label",       intent.getStringExtra("label"));
        svc.putExtra("volume",      intent.getFloatExtra("volume", 1.0f));
        svc.putExtra("durationSec", intent.getIntExtra("durationSec", 6));
        svc.putExtra("repeatCount", intent.getIntExtra("repeatCount", 1));
        svc.putExtra("soundFile",   intent.getStringExtra("soundFile"));
        svc.putExtra("subjectId",   subjectId);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(svc);
        } else {
            context.startService(svc);
        }
    }
}
