package com.bellcraft.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

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
 *   3. Per-period alert     — drops a pre-start or pre-end alarm if that
 *                              period's corresponding alert has been disabled.
 *
 *   4. Subject guard        — drops the alarm if subjectId == 0 (empty / free
 *                              period with no subject assigned).
 *                              subjectId < 0 means "special / duty alarm" and
 *                              always rings regardless of subject or day.
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

        // ── Guard 3: per-period pre-start / pre-end preferences ───────────
        // The persisted lists are updated before native alarms are rebuilt,
        // so a pending alarm racing with cancellation cannot ring a disabled
        // period. Other bell types and special-task alarms are not affected.
        String bellType = intent.getStringExtra("bellType");
        int periodId = intent.getIntExtra("periodId", -1);
        if ("pre-start".equals(bellType) && periodId > 0) {
            String disabledJson = prefs.getString("disabled_prestart_period_ids", "[]");
            try {
                JSONArray disabledIds = new JSONArray(disabledJson);
                for (int i = 0; i < disabledIds.length(); i++) {
                    if (disabledIds.getInt(i) == periodId) {
                        Log.d(TAG, "Dropping pre-start alarm — period " + periodId
                                + " has its alert disabled.");
                        return;
                    }
                }
            } catch (Exception e) {
                // Fail closed for the pre-start alert only if its preference
                // data is malformed; do not affect regular or special bells.
                Log.w(TAG, "Invalid disabled period alert list; dropping pre-start alarm.");
                return;
            }
        }
        if ("pre-end".equals(bellType) && periodId > 0) {
            String disabledJson = prefs.getString("disabled_preend_period_ids", "[]");
            try {
                JSONArray disabledIds = new JSONArray(disabledJson);
                for (int i = 0; i < disabledIds.length(); i++) {
                    if (disabledIds.getInt(i) == periodId) {
                        Log.d(TAG, "Dropping pre-end alarm — period " + periodId
                                + " has its alert disabled.");
                        return;
                    }
                }
            } catch (Exception e) {
                // Fail closed for this pre-end alert only; do not affect other bells.
                Log.w(TAG, "Invalid disabled pre-end period alert list; dropping pre-end alarm.");
                return;
            }
        }

        // ── Guard 4: subject guard ────────────────────────────────────────
        // Default -1: field absent → special / duty alarm → always ring.
        // Value   0: empty timetable slot → no class → never ring.
        // Value  >0: real subject assigned → ring normally.
        int subjectId = subjectIdPeek;
        if (subjectId == 0) {
            Log.d(TAG, "Dropping alarm — empty period (subjectId=0), "
                    + "no class scheduled.");
            return;
        }

        // Special-task alarms are single-shot AlarmManager events. Validate
        // their saved occurrence to drop stale/duplicate broadcasts, then
        // persist and schedule the next recurrence before starting audio.
        if (!advanceSpecialTaskAlarm(context, intent)) return;

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

    private boolean advanceSpecialTaskAlarm(Context context, Intent intent) {
        String taskId = intent.getStringExtra("taskId");
        if (taskId == null || taskId.isEmpty()) return true;

        int alarmId = intent.getIntExtra("alarmId", -1);
        long scheduledTimestamp = intent.getLongExtra("scheduledTimestamp", -1L);
        if (alarmId < 0 || scheduledTimestamp <= 0) {
            Log.w(TAG, "Dropping special-task alarm with missing occurrence metadata.");
            return false;
        }

        SharedPreferences prefs = context.getSharedPreferences(
                BellSchedulerPlugin.PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray saved = new JSONArray(prefs.getString(BellSchedulerPlugin.KEY, "[]"));
            JSONArray updated = new JSONArray();
            JSONObject matchingAlarm = null;
            boolean matchingIdSeen = false;

            for (int i = 0; i < saved.length(); i++) {
                JSONObject alarm = saved.getJSONObject(i);
                if (alarm.optInt("id", -1) == alarmId) {
                    matchingIdSeen = true;
                    if (!taskId.equals(alarm.optString("taskId", ""))
                            || alarm.optLong("timestamp", -1L) != scheduledTimestamp) {
                        Log.d(TAG, "Dropping stale or duplicate special-task alarm.");
                        return false;
                    }
                    matchingAlarm = alarm;
                } else {
                    updated.put(alarm);
                }
            }

            if (!matchingIdSeen || matchingAlarm == null) {
                Log.d(TAG, "Dropping special-task alarm no longer in the active schedule.");
                return false;
            }

            String repeatType = matchingAlarm.optString("taskRepeatType", "once");
            if ("daily".equals(repeatType) || "specific-days".equals(repeatType)) {
                long nextTimestamp = BellSchedulerPlugin.nextSpecialTaskTimestamp(
                        matchingAlarm, System.currentTimeMillis());
                if (nextTimestamp > System.currentTimeMillis()) {
                    matchingAlarm.put("timestamp", nextTimestamp);
                    updated.put(matchingAlarm);
                    // Commit before setting the alarm so a duplicate broadcast
                    // cannot ring twice for the same occurrence.
                    prefs.edit().putString(BellSchedulerPlugin.KEY, updated.toString()).commit();
                    JSONArray nextAlarm = new JSONArray();
                    nextAlarm.put(matchingAlarm);
                    BellSchedulerPlugin.scheduleInternal(context, nextAlarm);
                    return true;
                }
                Log.w(TAG, "No valid future recurrence found; stopping this task alarm.");
            }

            // One-time tasks are consumed; repeating tasks with invalid
            // recurrence data are also removed instead of looping forever.
            prefs.edit().putString(BellSchedulerPlugin.KEY, updated.toString()).commit();
            return true;
        } catch (JSONException e) {
            Log.e(TAG, "Unable to validate special-task alarm; dropping it.", e);
            return false;
        }
    }
}
