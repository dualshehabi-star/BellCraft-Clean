import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import { ArrowRight, Clock, CheckCircle2, Loader2, Coffee } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSchedule,
  getGetScheduleQueryKey,
  useListPeriods,
  getListPeriodsQueryKey,
  useUpdatePeriod,
  getGetDashboardQueryKey,
} from "@/lib/api-client";
import { Skeleton } from "@/components/ui/skeleton";
import { NativeTimePicker } from "@/components/time-drum-picker";

// ─── read periodCount from auto-setup localStorage ───────────────────────────
function loadPeriodCount(scheduleId: number): number {
  try {
    const raw = localStorage.getItem(`autoSetup_${scheduleId}`);
    if (raw) {
      const cfg = JSON.parse(raw) as { periodCount?: number };
      if (typeof cfg.periodCount === "number" && cfg.periodCount > 0) return cfg.periodCount;
    }
  } catch {}
  return 6; // default matches auto-setup DEFAULT_CFG
}

// ─── main page ───────────────────────────────────────────────────────────────
export default function ManualSetup() {
  const { id: idStr } = useParams();
  const scheduleId = parseInt(idStr || "0", 10);
  const queryClient = useQueryClient();

  // Re-read on every mount so changes in auto-setup are immediately reflected
  const [periodCount, setPeriodCount] = useState(() => loadPeriodCount(scheduleId));
  useEffect(() => {
    setPeriodCount(loadPeriodCount(scheduleId));
  }, [scheduleId]);

  const { data: schedule, isLoading: loadingSched } = useGetSchedule(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getGetScheduleQueryKey(scheduleId) },
  });
  const { data: periods = [], isLoading: loadingPeriods } = useListPeriods(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getListPeriodsQueryKey(scheduleId) },
  });

  const updatePeriod = useUpdatePeriod();

  // Local draft keyed by primary-day period id
  const [draft, setDraft] = useState<Record<number, { startTime: string; endTime: string }>>({});
  const [saveStatus, setSaveStatus] = useState<Record<number, "idle" | "saving" | "saved">>({});
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // siblings map: primary period id → sibling ids in other days at same slot
  const siblingsRef = useRef<Record<number, number[]>>({});

  const isBreak = (label?: string | null) =>
    !!(label?.includes("فسحة") || label?.includes("break") || label?.includes("استراحة"));

  // Derive primary-day display list + build siblings map whenever periods change
  const [primaryDayPeriods, setPrimaryDayPeriods] = useState<typeof periods>([]);

  useEffect(() => {
    if (periods.length === 0) return;

    // Group by dayOfWeek
    const byDay: Record<number, typeof periods> = {};
    for (const p of periods) {
      if (!byDay[p.dayOfWeek]) byDay[p.dayOfWeek] = [];
      byDay[p.dayOfWeek].push(p);
    }
    const sortedDays = Object.keys(byDay).map(Number).sort((a, b) => a - b);
    const primaryDay = sortedDays[0];
    const primarySorted = [...byDay[primaryDay]].sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Build siblings: for each slot index in primaryDay, collect same-index ids from other days
    const map: Record<number, number[]> = {};
    for (let i = 0; i < primarySorted.length; i++) {
      const siblings: number[] = [];
      for (const day of sortedDays.slice(1)) {
        const daySorted = [...byDay[day]].sort((a, b) => a.startTime.localeCompare(b.startTime));
        if (daySorted[i]) siblings.push(daySorted[i].id);
      }
      map[primarySorted[i].id] = siblings;
    }
    siblingsRef.current = map;
    setPrimaryDayPeriods(primarySorted);
  }, [periods.length]);

  // Initialise draft from primary day periods
  useEffect(() => {
    if (primaryDayPeriods.length > 0) {
      const init: typeof draft = {};
      for (const p of primaryDayPeriods) {
        init[p.id] = { startTime: p.startTime, endTime: p.endTime };
      }
      setDraft(init);
    }
  }, [primaryDayPeriods.length]);

  // Debounced save — updates primary period + all sibling days
  // Subjects are intentionally preserved: only startTime/endTime are updated.
  const saveField = useCallback(
    (periodId: number, startTime: string, endTime: string) => {
      if (timers.current[periodId]) clearTimeout(timers.current[periodId]);
      setSaveStatus((s) => ({ ...s, [periodId]: "saving" }));
      timers.current[periodId] = setTimeout(() => {
        const siblings = siblingsRef.current[periodId] ?? [];
        const allIds = [periodId, ...siblings];

        let done = 0;
        for (const id of allIds) {
          updatePeriod.mutate(
            { id, data: { startTime, endTime } },
            {
              onSuccess: () => {
                done++;
                if (done === allIds.length) {
                  setSaveStatus((s) => ({ ...s, [periodId]: "saved" }));
                  queryClient.invalidateQueries({ queryKey: getListPeriodsQueryKey(scheduleId) });
                  queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
                  setTimeout(() => setSaveStatus((s) => ({ ...s, [periodId]: "idle" })), 1800);
                }
              },
            }
          );
        }
      }, 700);
    },
    [updatePeriod, queryClient, scheduleId]
  );

  const handleChange = (
    periodId: number,
    field: "startTime" | "endTime",
    val: string
  ) => {
    setDraft((prev) => {
      const cur = prev[periodId] ?? { startTime: "08:00", endTime: "08:45" };
      const next = { ...cur, [field]: val };
      saveField(periodId, next.startTime, next.endTime);
      return { ...prev, [periodId]: next };
    });
  };

  const isLoading = loadingSched || loadingPeriods;

  // From primary day: separate periods (capped) and breaks (all), sort together
  const safePrimaryDayPeriods = Array.isArray(primaryDayPeriods) ? primaryDayPeriods : [];

  const periodEntries = safePrimaryDayPeriods
    .filter((p) => !isBreak(p.label))
    .slice(0, periodCount);

  const breakEntries = safePrimaryDayPeriods.filter((p) => isBreak(p.label));

  const periodList = [...periodEntries, ...breakEntries].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  if (isLoading) {
    return (
      <div className="space-y-4 pb-4" dir="rtl">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <Skeleton className="w-48 h-7" />
        </div>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center" dir="rtl">
        <p className="text-slate-500 mb-4">الجدول غير موجود</p>
        <Link href="/schedules">
          <button className="px-4 py-2 rounded-xl bg-blue-700 text-white font-bold text-sm tap">
            العودة
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/schedules/${scheduleId}`}>
          <button className="w-9 h-9 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors tap card-shadow">
            <ArrowRight className="h-4 w-4" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-blue-700 font-semibold truncate">{schedule.name}</p>
          <h1 className="text-xl font-extrabold text-slate-900">الضبط اليدوي للأوقات</h1>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-md shadow-blue-500/20">
          <Clock className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-2xl p-3.5 bg-blue-50 border border-blue-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-blue-700 shrink-0" />
          <p className="text-xs font-semibold text-blue-800">
            عدّل أوقات الحصص — يُحفظ تلقائياً
          </p>
        </div>
        <span className="text-xs font-extrabold text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full shrink-0">
          {periodCount} حصص
        </span>
      </div>

      {/* No periods */}
      {periodList.length === 0 && (
        <div className="rounded-2xl p-8 bg-white border border-dashed border-slate-300 card-shadow text-center">
          <Clock className="w-9 h-9 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold mb-1">لا توجد حصص بعد</p>
          <p className="text-xs text-slate-400 mb-4">
            استخدم الضبط التلقائي أولاً لإنشاء الحصص
          </p>
          <Link href={`/schedules/${scheduleId}/auto`}>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-700 text-white font-bold text-sm tap">
              الضبط التلقائي
            </button>
          </Link>
        </div>
      )}

      {/* Period cards */}
      <AnimatePresence>
        {periodList.map((period, idx) => {
          const d = draft[period.id] ?? { startTime: period.startTime, endTime: period.endTime };
          const status = saveStatus[period.id] ?? "idle";
          const entryIsBreak = isBreak(period.label);
          const periodNum = periodList.slice(0, idx + 1).filter((p) => !isBreak(p.label)).length;
          const breakNum = periodList.slice(0, idx + 1).filter((p) => isBreak(p.label)).length;

          return (
            <motion.div
              key={period.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
              className={`rounded-2xl overflow-hidden card-shadow border ${
                entryIsBreak
                  ? "bg-amber-50 border-amber-200"
                  : "bg-white border-slate-200"
              }`}
            >
              {/* Card header */}
              <div className={`flex items-center justify-between px-4 py-3 border-b ${
                entryIsBreak ? "border-amber-200 bg-amber-100/40" : "border-slate-100 bg-slate-50/60"
              }`}>
                <div className="flex items-center gap-2.5">
                  {entryIsBreak ? (
                    <span className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center">
                      <Coffee className="w-4 h-4 text-white" />
                    </span>
                  ) : (
                    <span className="w-8 h-8 rounded-xl bg-blue-700 flex items-center justify-center text-white font-extrabold text-sm">
                      {periodNum}
                    </span>
                  )}
                  <span className={`font-bold text-sm ${entryIsBreak ? "text-amber-800" : "text-slate-800"}`}>
                    {period.label ?? (entryIsBreak ? `الفسحة ${breakNum}` : `الحصة ${periodNum}`)}
                  </span>
                </div>

                {/* Save indicator */}
                <AnimatePresence mode="wait">
                  {status === "saving" && (
                    <motion.span
                      key="saving"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1 text-[11px] text-slate-400"
                    >
                      <Loader2 className="w-3 h-3 animate-spin" />
                      جاري الحفظ
                    </motion.span>
                  )}
                  {status === "saved" && (
                    <motion.span
                      key="saved"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      حُفظ
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Time fields */}
              <div className="flex items-start justify-around gap-2 px-4 py-4">
                <div className="flex flex-col items-center gap-2">
                  <p className="text-[11px] font-bold text-slate-500">وقت البداية</p>
                  <NativeTimePicker
                    value={d.startTime}
                    onChange={(v) => handleChange(period.id, "startTime", v)}
                  />
                </div>
                <div className="w-px self-stretch bg-slate-100 mx-1 mt-6" />
                <div className="flex flex-col items-center gap-2">
                  <p className="text-[11px] font-bold text-slate-500">وقت النهاية</p>
                  <NativeTimePicker
                    value={d.endTime}
                    onChange={(v) => handleChange(period.id, "endTime", v)}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
