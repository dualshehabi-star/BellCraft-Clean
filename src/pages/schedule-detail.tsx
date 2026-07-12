import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Zap, ChevronLeft, SlidersHorizontal, LayoutGrid } from "lucide-react";

import {
  useGetSchedule,
  getGetScheduleQueryKey,
  useUpdateSchedule,
  useCreatePeriod,
  useListPeriods,
  getListPeriodsQueryKey,
  getListSchedulesQueryKey,
  getGetDashboardQueryKey,
} from "@/lib/api-client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ARABIC_DAYS } from "@/lib/constants";
import { TimetableGrid } from "@/components/timetable-grid";

const DAYS_ALL = [0, 1, 2, 3, 4, 5, 6];

export default function ScheduleDetail() {
  const { id: idStr } = useParams();
  const scheduleId = parseInt(idStr || "0", 10);
  const queryClient = useQueryClient();

  const { data: schedule, isLoading } = useGetSchedule(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getGetScheduleQueryKey(scheduleId) },
  });

  const { data: _rawPeriods, isLoading: loadingPeriods } = useListPeriods(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getListPeriodsQueryKey(scheduleId) },
  });
  const allPeriods = Array.isArray(_rawPeriods) ? _rawPeriods : [];

  const updateSchedule = useUpdateSchedule();
  const createPeriod = useCreatePeriod();
  // Use the schedule's own activeDays — never fall back to a hardcoded Sun–Thu list.
  // If the schedule has no days configured yet, treat all 7 days as available so the
  // user can see and toggle every column (including Fri and Sat).
  const activeDays: number[] = schedule?.activeDays?.length
    ? schedule.activeDays
    : [0, 1, 2, 3, 4, 5, 6];

  const toggleDay = async (day: number) => {
    const isAdding = !activeDays.includes(day);
    const next = isAdding
      ? [...activeDays, day].sort((a, b) => a - b)
      : activeDays.filter((d) => d !== day);

    // When adding a new day, copy periods from the primary day if none exist yet
    if (isAdding && allPeriods.length > 0) {
      const byDay: Record<number, typeof allPeriods> = {};
      for (const p of allPeriods) {
        if (!byDay[p.dayOfWeek]) byDay[p.dayOfWeek] = [];
        byDay[p.dayOfWeek].push(p);
      }
      const daysWithPeriods = activeDays.filter((d) => byDay[d]?.length);
      const primaryDay = daysWithPeriods.length ? Math.min(...daysWithPeriods) : null;

      if (primaryDay !== null && !byDay[day]?.length) {
        const sourcePeriods = [...(byDay[primaryDay] ?? [])].sort((a, b) =>
          a.startTime.localeCompare(b.startTime)
        );
        await Promise.all(
          sourcePeriods.map((p) =>
            createPeriod.mutateAsync({
              scheduleId,
              data: {
                dayOfWeek: day,
                startTime: p.startTime,
                endTime: p.endTime,
                label: p.label ?? undefined,
                alertMinutesBefore: p.alertMinutesBefore ?? 5,
              },
            })
          )
        );
        queryClient.invalidateQueries({ queryKey: getListPeriodsQueryKey(scheduleId) });
      }
    }

    updateSchedule.mutate(
      { id: scheduleId, data: { activeDays: next } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetScheduleQueryKey(scheduleId) });
          queryClient.invalidateQueries({ queryKey: getListSchedulesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4" dir="rtl">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <Skeleton className="w-48 h-7" />
        </div>
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <h2 className="text-xl font-bold text-destructive mb-2">الجدول غير موجود</h2>
        <Link href="/schedules">
          <Button variant="outline" className="gap-2 mt-4">
            <ArrowRight className="w-4 h-4" />العودة للجداول
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/schedules">
          <button className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors tap card-shadow">
            <ArrowRight className="h-4 w-4" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-extrabold text-slate-900 truncate">{schedule.name}</h1>
          <p className="text-xs text-slate-400 mt-0.5">إعدادات الجدول</p>
        </div>
      </div>

      {/* Days selection */}
      <div className="bg-white rounded-2xl border border-slate-200 card-shadow p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">أيام الدراسة</h2>
        <div className="flex flex-wrap gap-2">
          {DAYS_ALL.map((day) => {
            const active = activeDays.includes(day);
            return (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`px-3.5 py-2 rounded-xl text-sm font-bold transition-all tap border ${
                  active
                    ? "bg-blue-700 text-white border-blue-700 shadow-sm"
                    : "bg-slate-50 text-slate-500 border-slate-200"
                }`}
              >
                {ARABIC_DAYS[day]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3">اضغط على اليوم لتفعيله أو إلغائه • يُحفظ تلقائياً</p>
      </div>

      {/* Setup cards */}
      <div className="grid gap-3">
        <Link href={`/schedules/${scheduleId}/auto`}>
          <div
            className="rounded-2xl p-4 flex items-center justify-between cursor-pointer tap card-shadow-lg"
            style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)" }}
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/15 p-2 rounded-xl">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">الضبط التلقائي للحصص</p>
                <p className="text-white/70 text-xs mt-0.5">توليد أوقات الحصص والفسح تلقائياً</p>
              </div>
            </div>
            <ChevronLeft className="h-5 w-5 text-white/50" />
          </div>
        </Link>

        <Link href={`/schedules/${scheduleId}/manual`}>
          <div className="rounded-2xl p-4 flex items-center justify-between cursor-pointer tap bg-white border border-slate-200 card-shadow">
            <div className="flex items-center gap-3">
              <div className="bg-blue-50 p-2 rounded-xl">
                <SlidersHorizontal className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">الضبط اليدوي لتوقيت الحصص</p>
                <p className="text-slate-400 text-xs mt-0.5">تعديل وقت البداية والنهاية لكل حصة</p>
              </div>
            </div>
            <ChevronLeft className="h-5 w-5 text-slate-300" />
          </div>
        </Link>
      </div>

      {/* Timetable grid */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <LayoutGrid className="h-4 w-4 text-blue-700" />
          <h2 className="font-bold text-sm text-slate-800">جدول الحصص الأسبوعي</h2>
          {loadingPeriods && (
            <span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin ms-auto" />
          )}
        </div>

        <TimetableGrid
          scheduleId={scheduleId}
          activeDays={activeDays}
          allPeriods={allPeriods}
          isLoading={loadingPeriods}
        />
      </div>
    </div>
  );
}
