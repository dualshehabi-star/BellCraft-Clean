package com.bellcraft.app;

import java.util.Calendar;

/** Pure wall-clock recurrence logic; also exercised by JVM tests without Android. */
final class BellRecurrence {
    private BellRecurrence() {}

    static long next(String date, String time, String repeat, int[] days, long after) {
        try {
            String[] parts = time.split(":");
            if (parts.length != 2) return -1L;
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return -1L;
            Calendar anchor = Calendar.getInstance();
            anchor.setTimeInMillis(after);
            if (date != null && !date.isEmpty()) {
                String[] d = date.split("-");
                if (d.length != 3) return -1L;
                anchor.clear();
                anchor.setLenient(false);
                anchor.set(Integer.parseInt(d[0]), Integer.parseInt(d[1]) - 1,
                        Integer.parseInt(d[2]), hour, minute, 0);
                anchor.getTimeInMillis(); // reject impossible dates
            }
            if ("once".equals(repeat)) {
                if (date == null || date.isEmpty()) return -1L;
                return anchor.getTimeInMillis() > after ? anchor.getTimeInMillis() : -1L;
            }
            if (!"daily".equals(repeat) && !"specific-days".equals(repeat)) return -1L;
            if ("specific-days".equals(repeat) && (days == null || days.length == 0)) return -1L;

            Calendar cursor = Calendar.getInstance();
            cursor.setTimeInMillis(Math.max(anchor.getTimeInMillis(), after));
            cursor.set(Calendar.HOUR_OF_DAY, 0);
            cursor.set(Calendar.MINUTE, 0);
            cursor.set(Calendar.SECOND, 0);
            cursor.set(Calendar.MILLISECOND, 0);
            for (int offset = 0; offset <= 7; offset++) {
                Calendar candidate = (Calendar) cursor.clone();
                candidate.set(Calendar.HOUR_OF_DAY, hour);
                candidate.set(Calendar.MINUTE, minute);
                boolean matches = "daily".equals(repeat);
                int dow = candidate.get(Calendar.DAY_OF_WEEK) - 1;
                if (days != null) for (int day : days) if (day == dow) matches = true;
                if (matches && candidate.getTimeInMillis() > after) return candidate.getTimeInMillis();
                cursor.add(Calendar.DATE, 1);
            }
        } catch (RuntimeException invalid) {
            return -1L;
        }
        return -1L;
    }
}
