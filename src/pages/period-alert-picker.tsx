import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Bell, BellOff, CheckCircle2 } from "lucide-react";
import { useGetDashboard, useListPeriods, getListPeriodsQueryKey } from "@/lib/api-client";
import { useDisabledPeriodAlerts } from "@/lib/period-alert-prefs";
import { ARABIC_DAYS, formatTime } from "@/lib/constants";

const ARABIC_DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

type Period = {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label?: string | null;
  subjectId?: number | null;
  subjectName?: string | null;
  subjectColor?: string | null;
};

function isBreak(p: Period) {
  return !!(p.label?.includes("فسحة") || p.label?.includes("break") || p.label?.includes("استراحة"));
}

export default function PeriodAlertPicker() {
  const { data: dashboard } = useGetDashboard();
  const activeSchedule = dashboard?.activeSchedule;
  const scheduleId = activeSchedule?.id ?? 0;
  const activeDays: number[] = Array.isArray(activeSchedule?.activeDays)
    ? (activeSchedule!.activeDays as number[])
    : [0, 1, 2, 3, 4, 5, 6];

  const { data: _rawAllPeriods = [] } = useListPeriods(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getListPeriodsQueryKey(scheduleId) },
  });
  const allPeriods: Period[] = Array.isArray(_rawAllPeriods) ? (_rawAllPeriods as Period[]) : [];

  const { disabled, toggle, isEnabled, enableAll, disableAll } = useDisabledPeriodAlerts();

  // Group by day, sorted by startTime
  const byDay: Record<number, Period[]> = {};
  for (const p of allPeriods as Period[]) {
    if (!byDay[p.dayOfWeek]) byDay[p.dayOfWeek] = [];
    byDay[p.dayOfWeek].push(p);
  }
  for (const day of Object.keys(byDay)) {
    byDay[Number(day)].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // Only show active school days that have at least one period
  const daysToShow = activeDays.filter(d => byDay[d]?.length > 0);

  const totalWithSubject = (allPeriods as Period[]).filter(p => p.subjectId && !isBreak(p)).length;
  const enabledCount = [...(allPeriods as Period[])]
    .filter(p => p.subjectId && !isBreak(p) && isEnabled(p.id))
    .length;

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">اختر الحصص</h1>
          <p className="text-sm text-slate-500">
            {enabledCount} من {totalWithSubject} حصة مُفعَّلة
          </p>
        </div>
        <Link href="/bell-settings/pre-start">
          <button className="w-10 h-10 rounded-2xl bg-white border border-slate-200 card-shadow flex items-center justify-center tap">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </Link>
      </div>

      {/* Info banner */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 flex items-start gap-3"
      >
        <Bell className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-[11.5px] text-blue-700 leading-relaxed">
          فعّل التنبيه للحصص التي تحتاج تنبيهاً قبلها. الحصص الفارغة والفسح لا تدعم التنبيه.
        </p>
      </motion.div>

      {/* No schedule */}
      {!scheduleId ? (
        <div className="rounded-2xl border border-slate-200 bg-white card-shadow p-8 text-center">
          <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-semibold">لا يوجد جدول نشط</p>
        </div>
      ) : daysToShow.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white card-shadow p-8 text-center">
          <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-semibold">لم يتم إعداد الجدول بعد</p>
        </div>
      ) : (
        <div className="space-y-3">
          {daysToShow.map((day, dayIdx) => (
            <motion.div
              key={day}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: dayIdx * 0.04 }}
              className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
            >
              {/* Day header */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <div className="w-2 h-2 rounded-full bg-blue-600" />
                <span className="text-xs font-extrabold text-slate-700 tracking-wide">
                  {ARABIC_DAY_LABELS[day]}
                </span>
              </div>

              {/* Periods */}
              {byDay[day].map((p, idx) => {
                const hasSubject = !!p.subjectId;
                const isFsaha = isBreak(p);
                const canToggle = hasSubject && !isFsaha;
                const enabled = canToggle ? isEnabled(p.id) : false;

                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors ${
                      canToggle ? "cursor-pointer active:bg-slate-50" : "opacity-50"
                    }`}
                    onClick={() => canToggle && toggle(p.id)}
                  >
                    {/* Subject color dot */}
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-white shadow-sm"
                      style={{
                        backgroundColor: p.subjectColor ?? (isFsaha ? "#94a3b8" : "#e2e8f0"),
                      }}
                    />

                    {/* Period info */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold leading-tight ${enabled ? "text-slate-900" : "text-slate-400"}`}>
                        {p.subjectName ?? (isFsaha ? "فسحة" : p.label ?? `حصة ${idx + 1}`)}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                        {formatTime(p.startTime)} — {formatTime(p.endTime)}
                      </p>
                    </div>

                    {/* Toggle indicator */}
                    <AnimatePresence mode="wait" initial={false}>
                      {canToggle ? (
                        enabled ? (
                          <motion.span
                            key="on"
                            initial={{ scale: 0.7, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.7, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="off"
                            initial={{ scale: 0.7, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.7, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <BellOff className="w-5 h-5 text-slate-300 shrink-0" />
                          </motion.span>
                        )
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                          {isFsaha ? "فسحة" : "فارغة"}
                        </span>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          ))}
        </div>
      )}

      {/* Enable all / disable all */}
      {daysToShow.length > 0 && totalWithSubject > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex gap-2"
        >
          <button
            onClick={enableAll}
            className="flex-1 py-3 rounded-2xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-extrabold tap"
          >
            تفعيل الكل
          </button>
          <button
            onClick={() => {
              const ids = (allPeriods as Period[])
                .filter(p => p.subjectId && !isBreak(p))
                .map(p => p.id);
              disableAll(ids);
            }}
            className="flex-1 py-3 rounded-2xl border border-slate-200 bg-white text-slate-500 text-sm font-extrabold tap"
          >
            تعطيل الكل
          </button>
        </motion.div>
      )}
    </div>
  );
}
