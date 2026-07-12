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
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }
        // Re-apply all bell alarms from SharedPreferences
        BellSchedulerPlugin.rescheduleFromPrefs(context);

        // Refresh the timetable image widget with any previously saved image.
        TimetableWidgetProvider.refreshAll(context);
    }
}
