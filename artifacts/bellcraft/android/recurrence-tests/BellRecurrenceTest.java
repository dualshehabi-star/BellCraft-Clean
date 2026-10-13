package com.bellcraft.app;

import java.util.Calendar;
import java.util.TimeZone;

public final class BellRecurrenceTest {
    private static int checks;
    private static long at(int month, int day, int hour, int minute) {
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(2026, month - 1, day, hour, minute, 0);
        return c.getTimeInMillis();
    }
    private static void equal(long actual, long expected, String label) {
        if (actual != expected) throw new AssertionError(label + ": " + actual + " != " + expected);
        checks++;
    }
    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Bahrain"));
        equal(BellRecurrence.next("2026-10-12", "09:00", "daily", null, at(10, 13, 8, 0)), at(10, 13, 9, 0), "daily today");
        equal(BellRecurrence.next("2026-10-12", "09:00", "daily", null, at(10, 13, 9, 0)), at(10, 14, 9, 0), "strict future");
        equal(BellRecurrence.next("2026-10-12", "09:00", "specific-days", new int[] { 2, 4 }, at(10, 13, 10, 0)), at(10, 15, 9, 0), "selected weekdays");
        equal(BellRecurrence.next("", "09:45", "specific-days", new int[] { 2 }, at(10, 13, 10, 0)), at(10, 20, 9, 45), "weekly class after reboot");
        equal(BellRecurrence.next("", "00:15", "specific-days", new int[] { 3 }, at(10, 13, 23, 30)), at(10, 14, 0, 15), "overnight end");
        equal(BellRecurrence.next("2026-10-20", "09:00", "daily", null, at(10, 13, 10, 0)), at(10, 20, 9, 0), "future start date");
        equal(BellRecurrence.next("2026-10-12", "09:00", "once", null, at(10, 13, 10, 0)), -1, "once not replayed");
        equal(BellRecurrence.next("2026-10-14", "09:00", "once", null, at(10, 13, 10, 0)), at(10, 14, 9, 0), "once future");
        equal(BellRecurrence.next("2026-02-30", "09:00", "daily", null, at(10, 13, 10, 0)), -1, "invalid date");
        equal(BellRecurrence.next("", "99:00", "daily", null, at(10, 13, 10, 0)), -1, "invalid time");
        equal(BellRecurrence.next("", "09:00", "specific-days", new int[] {}, at(10, 13, 10, 0)), -1, "no weekdays");
        equal(BellRecurrence.next("", "09:00", "specific-days", new int[] { 9 }, at(10, 13, 10, 0)), -1, "invalid weekdays");
        TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
        equal(BellRecurrence.next("2026-03-01", "09:00", "daily", null, at(3, 7, 10, 0)), at(3, 8, 9, 0), "spring DST wall clock");
        equal(BellRecurrence.next("2026-10-01", "09:00", "daily", null, at(10, 31, 10, 0)), at(11, 1, 9, 0), "autumn DST wall clock");
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Tokyo"));
        equal(BellRecurrence.next("", "09:45", "specific-days", new int[] { 2 }, at(10, 13, 8, 0)), at(10, 13, 9, 45), "new timezone local time");
        System.out.println("PASS: " + checks + " JVM recurrence checks");
    }
}
