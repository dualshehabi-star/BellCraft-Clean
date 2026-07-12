import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Trash2, CalendarDays, Coffee } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListSubjects,
  useUpdatePeriod,
  useClearSubjectAssignments,
  getListPeriodsQueryKey,
} from "@/lib/api-client";
import { ARABIC_DAYS, formatTime } from "@/lib/constants";

type Period = {
  id: number;
  scheduleId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label?: string | null;
  subjectId?: number | null;
  subjectName?: string | null;
  subjectColor?: string | null;
};

function isBreak(label?: string | null) {
  return !!(label?.includes("فسحة") || label?.includes("break") || label?.includes("استراحة"));
}

/** Minutes between two "HH:MM" strings */
function diffMinutes(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

type Col =
  | { kind: "period"; index: number; period: Period }
  | { kind: "break"; label: string; startTime: string; endTime: string };

interface TimetableGridProps {
  scheduleId: number;
  activeDays: number[];
  allPeriods: Period[];
  isLoading: boolean;
}

export function TimetableGrid({ scheduleId, activeDays: _activeDays, allPeriods: _allPeriods, isLoading }: TimetableGridProps) {
  const activeDays = Array.isArray(_activeDays) ? _activeDays : [];
  const allPeriods = Array.isArray(_allPeriods) ? _allPeriods : [];
  const queryClient = useQueryClient();
  const { data: _rawSubjects } = useListSubjects();
  const subjects = Array.isArray(_rawSubjects) ? _rawSubjects : [];
  const updatePeriod = useUpdatePeriod();
  const clearAssignments = useClearSubjectAssignments();

  const [pickerPeriodId, setPickerPeriodId] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Build per-day sorted period lists ─────────────────────────────────────
  const byDay: Record<number, Period[]> = {};
  for (const p of allPeriods) {
    if (!byDay[p.dayOfWeek]) byDay[p.dayOfWeek] = [];
    byDay[p.dayOfWeek].push(p);
  }
  for (const key of Object.keys(byDay)) {
    byDay[Number(key)].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // ── Build columns from primary day (includes breaks) ──────────────────────
  const daysWithPeriods = activeDays.filter(d => byDay[d]?.length);
  const primaryDay = daysWithPeriods.length ? Math.min(...daysWithPeriods) : null;

  const columns: Col[] = [];
  let periodIndex = 0;
  if (primaryDay !== null) {
    for (const p of byDay[primaryDay] ?? []) {
      if (isBreak(p.label)) {
        columns.push({
          kind: "break",
          label: p.label ?? "فسحة",
          startTime: p.startTime,
          endTime: p.endTime,
        });
      } else {
        columns.push({ kind: "period", index: periodIndex++, period: p });
      }
    }
  }

  // Non-break period slots only (for matching cells to day rows)
  const periodCols = columns.filter((c): c is Extract<Col, { kind: "period" }> => c.kind === "period");

  // ── Actions ───────────────────────────────────────────────────────────────
  const assign = async (periodId: number, subjectId: number | null) => {
    await updatePeriod.mutateAsync({ id: periodId, data: { subjectId } });
    queryClient.invalidateQueries({ queryKey: getListPeriodsQueryKey(scheduleId) });
    setPickerPeriodId(null);
  };

  const handleClearConfirmed = async () => {
    await clearAssignments.mutateAsync({ scheduleId });
    queryClient.invalidateQueries({ queryKey: getListPeriodsQueryKey(scheduleId) });
    setShowConfirm(false);
  };

  // ── Empty / loading states ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 card-shadow h-32 flex items-center justify-center">
        <span className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (periodCols.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center">
        <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-500">لا توجد حصص بعد</p>
        <p className="text-xs text-slate-400 mt-1">استخدم الضبط التلقائي لإنشاء الجدول</p>
      </div>
    );
  }

  const COL_W = 98;   // regular period column width
  const BRK_W = 44;   // break column width
  const DAY_W = 74;   // sticky day column width
  const totalW = DAY_W + columns.reduce((s, c) => s + (c.kind === "break" ? BRK_W : COL_W), 0);

  return (
    <>
      {/* ── Grid ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-black bg-white card-shadow">
        <div className="overflow-x-auto no-scrollbar">
          <div style={{ minWidth: totalW }}>

            {/* Header row */}
            <div className="flex bg-gradient-to-b from-blue-700 to-blue-800">
              {/* Corner */}
              <div
                className="sticky right-0 z-20 flex items-center justify-center bg-blue-800 border-s border-black shrink-0"
                style={{ width: DAY_W }}
              >
                <CalendarDays className="w-4 h-4 text-blue-300" />
              </div>

              {columns.map((col, ci) => {
                if (col.kind === "break") {
                  const mins = diffMinutes(col.startTime, col.endTime);
                  return (
                    <div
                      key={`brk-${ci}`}
                      className="shrink-0 flex flex-col items-center justify-center gap-0.5 py-2 border-e border-black last:border-e-0 bg-amber-500/20"
                      style={{ width: BRK_W }}
                    >
                      <Coffee className="w-3 h-3 text-amber-300" />
                      <span className="text-[10px] font-bold text-amber-200 leading-tight text-center">
                        {mins}د
                      </span>
                    </div>
                  );
                }
                return (
                  <div
                    key={`col-${col.index}`}
                    className="shrink-0 flex flex-col items-center gap-0.5 py-2.5 px-1 border-e border-black last:border-e-0"
                    style={{ width: COL_W }}
                  >
                    <span className="w-6 h-6 rounded-full bg-white/20 text-white text-[12px] font-extrabold flex items-center justify-center">
                      {col.index + 1}
                    </span>
                    <span className="text-[12px] font-bold text-white tabular-nums">{formatTime(col.period.startTime)}</span>
                    <span className="text-[11px] text-blue-200 tabular-nums">{formatTime(col.period.endTime)}</span>
                  </div>
                );
              })}
            </div>

            {/* Day rows */}
            {activeDays.map((day, rowIdx) => {
              const dayPeriods = (byDay[day] ?? []).filter(p => !isBreak(p.label));
              const isOdd = rowIdx % 2 !== 0;
              const rowBg = isOdd ? "bg-slate-50/50" : "bg-white";
              return (
                <div key={day} className={`flex border-b border-black last:border-b-0 ${rowBg}`}>
                  {/* Day name — sticky */}
                  <div
                    className={`sticky right-0 z-10 shrink-0 flex items-center justify-center py-3 px-1 border-s border-black ${rowBg}`}
                    style={{ width: DAY_W }}
                  >
                    <span className="text-[13px] font-extrabold text-slate-700 text-center leading-tight">
                      {ARABIC_DAYS[day]}
                    </span>
                  </div>

                  {columns.map((col, ci) => {
                    if (col.kind === "break") {
                      return (
                        <div
                          key={`brk-cell-${ci}`}
                          className="shrink-0 border-e border-black last:border-e-0"
                          style={{ width: BRK_W, height: 56, backgroundColor: "#fef3c720" }}
                        >
                          <div
                            className="h-full w-full flex items-center justify-center"
                            style={{ background: "repeating-linear-gradient(135deg,transparent,transparent 4px,#fde68a22 4px,#fde68a22 8px)" }}
                          />
                        </div>
                      );
                    }

                    const period = dayPeriods[col.index];
                    const hasSubject = !!(period?.subjectName);
                    return (
                      <div
                        key={`cell-${col.index}`}
                        className="shrink-0 flex items-center justify-center border-e border-black last:border-e-0 cursor-pointer tap transition-opacity"
                        style={{
                          width: COL_W,
                          height: 56,
                          backgroundColor: hasSubject && period?.subjectColor ? period.subjectColor : undefined,
                        }}
                        onClick={() => period && setPickerPeriodId(period.id)}
                      >
                        {hasSubject ? (
                          <span className="text-[13px] font-bold text-white text-center leading-tight px-1 line-clamp-2">
                            {period.subjectName}
                          </span>
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center">
                            <Plus className="w-3 h-3 text-slate-300" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Clear button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setShowConfirm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-200 bg-red-50 text-red-600 text-sm font-bold tap"
      >
        <Trash2 className="w-4 h-4" />
        مسح المواد الدراسية
      </button>

      {/* ── Subject picker bottom sheet ───────────────────────────────────── */}
      <AnimatePresence>
        {pickerPeriodId !== null && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPickerPeriodId(null)}
            />
            <motion.div
              className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-3xl overflow-hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              dir="rtl"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <h3 className="font-extrabold text-slate-800 text-base">اختر مادة دراسية</h3>
                <button
                  onClick={() => setPickerPeriodId(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center tap"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[55vh] p-3 flex flex-col gap-2 pb-8">
                <button
                  onClick={() => assign(pickerPeriodId, null)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 tap"
                >
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <X className="w-4 h-4 text-slate-400" />
                  </div>
                  <span className="text-sm font-bold text-slate-500">بلا مادة</span>
                </button>
                {subjects.map(subject => (
                  <button
                    key={subject.id}
                    onClick={() => assign(pickerPeriodId, subject.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl tap overflow-hidden"
                    style={{ backgroundColor: subject.color + "1a" }}
                  >
                    <div className="w-8 h-8 rounded-xl shrink-0 shadow-sm" style={{ backgroundColor: subject.color }} />
                    <div className="text-start flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{subject.name}</p>
                      {subject.teacher && (
                        <p className="text-xs text-slate-400 truncate">{subject.teacher}</p>
                      )}
                    </div>
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
                  </button>
                ))}
                {subjects.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-sm font-semibold text-slate-400">لا توجد مواد بعد</p>
                    <p className="text-xs text-slate-400 mt-1">أضف مواد من صفحة المواد أولاً</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Clear confirmation dialog ─────────────────────────────────────── */}
      <AnimatePresence>
        {showConfirm && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfirm(false)}
            />
            <motion.div
              className="fixed inset-x-5 top-1/2 -translate-y-1/2 z-50 bg-white rounded-3xl p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              dir="rtl"
            >
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-7 h-7 text-red-600" />
              </div>
              <h3 className="text-center font-extrabold text-slate-800 text-lg mb-2">مسح المواد الدراسية</h3>
              <p className="text-center text-sm text-slate-500 mb-6 leading-relaxed">
                هل أنت متأكد من مسح جميع المواد من هذا الجدول؟
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm tap"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleClearConfirmed}
                  disabled={clearAssignments.isPending}
                  className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold text-sm tap disabled:opacity-60"
                >
                  {clearAssignments.isPending ? "جارٍ المسح…" : "مسح"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
