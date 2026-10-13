package com.bellcraft.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * BellBootReceiver
 *
 * Re-schedules all saved bell alarms after the device reboots.
 * Requires RECEIVE_BOOT_COMPLETED permission (already declared).
 */
public class BellBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        boolean bootAction = Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || "com.huawei.systemmanager.optimize.process.action.BOOT_COMPLETED".equals(action);
        boolean clockChanged = Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action);
        boolean permissionGranted = "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED".equals(action);
        if (!bootAction && !clockChanged && !permissionGranted) {
            return;
        }
        // Re-apply alarms from SharedPreferences. Repeating task alarms are
        // recalculated from their saved local date/time and selected weekdays.
        BellSchedulerPlugin.rescheduleFromPrefs(context);

        if (bootAction) {
            // Refresh the timetable image widget with any previously saved image.
            TimetableWidgetProvider.refreshAll(context);
        }
    }
}
