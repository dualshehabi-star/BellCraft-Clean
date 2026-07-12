/**
 * تنبيه المناوبة
 *
 * Allows the user to configure up to two duty-shift alerts (one per break).
 * Each shift has an independent day-of-week + period selector.
 * Settings are stored in localStorage — no API required.
 */
import { useRef, useCallback, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ChevronRight, Bell, Music, Play, Upload, Trash2,
  Coffee, AlertCircle, Square,
} from "lucide-react";
import { useGetDashboard, useListPeriods, getListPeriodsQueryKey } from "@/lib/api-client";
import { useBellStore } from "@/lib/bell-store";
import {
  useDutyAlertSettings,
  DUTY_CUSTOM_SOUND_KEY,
  type DutyShift,
} from "@/lib/duty-alert-prefs";
import {
  playBellOnce,
  startBellLoop,
  stopBell,
  setBellEnabled,
  BELL_SOUNDS,
  BELL_SOUND_LABELS,
  type BellSound,
} from "@/lib/audio";
import { formatTime } from "@/lib/constants";

// ── Constants ────────────────────────────────────────────────────────────────
const ARABIC_DAYS_SHORT = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const DURATION_OPTIONS = [3, 5, 6, 10, 15];
const REPEAT_OPTIONS = [1, 2, 3, 5];

function isBreakLabel(label?: string | null) {
  return !!(label?.includes("فسحة") || label?.includes("break") || label?.includes("استراحة"));
}

// ── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-12 h-7 rounded-full transition-colors tap ${on ? "bg-blue-700" : "bg-slate-300"}`}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md ${on ? "left-0.5" : "right-0.5"}`}
        style={{ pointerEvents: "none" }}
      />
    </button>
  );
}

// ── Shift picker ─────────────────────────────────────────────────────────────
type Period = {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label?: string | null;
  subjectName?: string | null;
  subjectColor?: string | null;
};

function ShiftPicker({
  label,
  shift,
  activeDays,
  allPeriods,
  onChange,
}: {
  label: string;
  shift: DutyShift;
  activeDays: number[];
  allPeriods: Period[];
  onChange: (patch: Partial<DutyShift>) => void;
}) {
  const dayPeriods = shift.dayOfWeek !== null
    ? allPeriods
        .filter(p => p.dayOfWeek === shift.dayOfWeek)
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
    : [];

  return (
    <div>
      <p className="text-[11px] font-extrabold text-slate-400 px-4 pt-3 pb-2 uppercase tracking-wide">
        {label}
      </p>

      {/* Day picker */}
      <div className="flex gap-1.5 px-4 pb-3">
        {ARABIC_DAYS_SHORT.map((name, dow) => {
          const isActive = activeDays.includes(dow);
          const isSelected = shift.dayOfWeek === dow;
          return (
            <button
              key={dow}
              type="button"
              disabled={!isActive}
              onClick={() => onChange({ dayOfWeek: dow, periodId: null, startTime: null })}
              className={`flex-1 py-1.5 rounded-xl text-[10px] font-extrabold transition-all tap
                ${isSelected
                  ? "bg-blue-700 text-white shadow-sm"
                  : isActive
                  ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  : "bg-slate-50 text-slate-300 cursor-not-allowed"}`}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* Period list for selected day */}
      {shift.dayOfWeek !== null && (
        dayPeriods.length === 0 ? (
          <p className="text-[11px] text-slate-400 px-4 pb-3">لا توجد حصص لهذا اليوم</p>
        ) : (
          <div className="px-4 pb-3 flex flex-col gap-1.5">
            {dayPeriods.map((p, idx) => {
              const isBreakP = isBreakLabel(p.label);
              const isSelected = shift.periodId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChange({ periodId: p.id, startTime: p.startTime })}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-all tap
                    ${isSelected
                      ? "bg-blue-700 shadow-sm"
                      : isBreakP
                      ? "bg-amber-50 border border-amber-200 hover:bg-amber-100"
                      : "bg-slate-50 hover:bg-slate-100"}`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-extrabold
                      ${isSelected ? "bg-white/20 text-white" : isBreakP ? "bg-amber-100 text-amber-600" : "bg-slate-200 text-slate-500"}`}
                  >
                    {isBreakP ? <Coffee className="w-3.5 h-3.5" /> : idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-extrabold truncate ${isSelected ? "text-white" : "text-slate-800"}`}>
                      {p.label ?? p.subjectName ?? "حصة"}
                    </p>
                    <p className={`text-[10px] ${isSelected ? "text-blue-100" : "text-slate-400"}`}>
                      {formatTime(p.startTime)} — {formatTime(p.endTime)}
                    </p>
                  </div>
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                      ${isSelected ? "border-white" : "border-slate-300"}`}
                  >
                    {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                  </span>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DutyAlert() {
  const { settings: globalSettings } = useBellStore();
  const { settings, update, updateShift } = useDutyAlertSettings();

  const { data: dashboard } = useGetDashboard();
  const scheduleId = dashboard?.activeSchedule?.id ?? 0;
  const { data: allPeriodsRaw = [] } = useListPeriods(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getListPeriodsQueryKey(scheduleId) },
  });
  const allPeriods = allPeriodsRaw as Period[];

  const activeDays: number[] = Array.isArray(dashboard?.activeSchedule?.activeDays)
    ? (dashboard!.activeSchedule!.activeDays as number[])
    : [0, 1, 2, 3, 4, 5, 6];

  // ── Custom sound ────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [customDataUrl, setCustomDataUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(DUTY_CUSTOM_SOUND_KEY); } catch { return null; }
  });
  const [customFileName, setCustomFileName] = useState<string>(() => {
    try { return localStorage.getItem(DUTY_CUSTOM_SOUND_KEY + "_name") ?? ""; } catch { return ""; }
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      try {
        localStorage.setItem(DUTY_CUSTOM_SOUND_KEY, url);
        localStorage.setItem(DUTY_CUSTOM_SOUND_KEY + "_name", file.name);
      } catch {}
      setCustomDataUrl(url);
      setCustomFileName(file.name);
      update({ bellSound: "custom" });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [update]);

  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTestTone = () => {
    if (isPlaying) {
      stopBell();
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      setIsPlaying(false);
      return;
    }
    const currentSound = settings.bellSound as BellSound ?? "classic";
    const repeatCount = settings.repeatCount ?? 1;
    const durationSec = settings.ringDurationSec ?? 6;
    setBellEnabled(true);
    setIsPlaying(true);
    startBellLoop(currentSound, globalSettings.volume, durationSec, {
      maxVolume: globalSettings.maxVolume,
      repeatCount,
      customDataUrl: currentSound === "custom" ? (customDataUrl ?? undefined) : undefined,
    });
    const totalMs = durationSec * repeatCount * 1000 + 800;
    playTimerRef.current = setTimeout(() => { stopBell(); setIsPlaying(false); }, totalMs);
  };

  const handleRemoveCustom = useCallback(() => {
    try {
      localStorage.removeItem(DUTY_CUSTOM_SOUND_KEY);
      localStorage.removeItem(DUTY_CUSTOM_SOUND_KEY + "_name");
    } catch {}
    setCustomDataUrl(null);
    setCustomFileName("");
    if (settings.bellSound === "custom") update({ bellSound: "classic" });
  }, [settings.bellSound, update]);

  const currentSound = settings.bellSound as BellSound;

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">تنبيه المناوبة</h1>
          <p className="text-sm text-slate-500">جرس الفسحة والمناوبة</p>
        </div>
        <Link href="/bell-settings">
          <button className="w-10 h-10 rounded-2xl bg-white border border-slate-200 card-shadow flex items-center justify-center tap">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </Link>
      </div>

      {/* Enable toggle */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Bell className="w-4 h-4 text-blue-700" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-slate-900">تفعيل تنبيه المناوبة</p>
              <p className="text-[11px] text-slate-400">تشغيل الجرس عند بداية فسحة المناوبة</p>
            </div>
          </div>
          <Toggle on={settings.enabled} onChange={(v) => update({ enabled: v })} />
        </div>
      </motion.div>

      {/* Sound + Duration */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        {/* Duration */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Music className="w-4 h-4 text-blue-700" />
          <h2 className="text-sm font-extrabold text-slate-900">النغمة</h2>
        </div>

        {BELL_SOUNDS.map((sound) => (
          <div
            key={sound}
            className={`flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors ${
              currentSound === sound ? "bg-blue-50" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => update({ bellSound: sound })}
              className="flex items-center gap-3 flex-1 text-right tap"
            >
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  currentSound === sound ? "border-blue-700" : "border-slate-300"
                }`}
                style={{ pointerEvents: "none" }}
              >
                {currentSound === sound && (
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-700" style={{ pointerEvents: "none" }} />
                )}
              </span>
              <span
                className={`text-sm font-bold ${currentSound === sound ? "text-slate-900" : "text-slate-600"}`}
                style={{ pointerEvents: "none" }}
              >
                {BELL_SOUND_LABELS[sound]}
              </span>
            </button>
            <button
              type="button"
              onClick={() => playBellOnce(sound, globalSettings.volume, { maxVolume: globalSettings.maxVolume })}
              className="w-9 h-9 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-700 tap"
            >
              <Play className="w-4 h-4 fill-current" style={{ pointerEvents: "none" }} />
            </button>
          </div>
        ))}

        {/* Custom sound */}
        <div className={`px-4 py-3 transition-colors ${currentSound === "custom" ? "bg-blue-50" : ""}`}>
          {customDataUrl ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => update({ bellSound: "custom" })}
                className="flex items-center gap-3 flex-1 text-right tap"
              >
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    currentSound === "custom" ? "border-blue-700" : "border-slate-300"
                  }`}
                  style={{ pointerEvents: "none" }}
                >
                  {currentSound === "custom" && (
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-700" style={{ pointerEvents: "none" }} />
                  )}
                </span>
                <div className="min-w-0" style={{ pointerEvents: "none" }}>
                  <p className="text-sm font-bold text-slate-900">نغمة مخصصة</p>
                  <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
                    {customFileName || "ملف صوتي"}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {currentSound === "custom" && (
                  <button
                    type="button"
                    onClick={() =>
                      playBellOnce("custom", globalSettings.volume, {
                        maxVolume: globalSettings.maxVolume,
                        customDataUrl: customDataUrl ?? undefined,
                      })
                    }
                    className="w-9 h-9 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-700 tap"
                  >
                    <Play className="w-4 h-4 fill-current" style={{ pointerEvents: "none" }} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRemoveCustom}
                  className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 tap"
                >
                  <Trash2 className="w-4 h-4" style={{ pointerEvents: "none" }} />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-3 w-full text-right tap"
            >
              <span className="w-9 h-9 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4 text-slate-400" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-700">إضافة نغمة مخصصة</p>
                <p className="text-[11px] text-slate-400">MP3، AAC، WAV…</p>
              </div>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Ring duration */}
        <div className="border-t border-slate-100 px-4 py-3.5">
          <p className="text-[11px] font-extrabold text-slate-400 mb-2">مدة الرنين</p>
          <div className="flex gap-2 flex-wrap">
            {DURATION_OPTIONS.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => update({ ringDurationSec: d })}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all tap
                  ${settings.ringDurationSec === d
                    ? "bg-blue-700 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {d} ث
              </button>
            ))}
          </div>
        </div>

        {/* Repeat count */}
        <div className="border-t border-slate-100 px-4 py-3.5">
          <p className="text-[11px] font-extrabold text-slate-400 mb-2">عدد مرات التكرار</p>
          <div className="flex gap-2 flex-wrap">
            {REPEAT_OPTIONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => update({ repeatCount: r })}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all tap
                  ${(settings.repeatCount ?? 1) === r
                    ? "bg-blue-700 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {r === 1 ? "رنة واحدة" : `${r} رنات`}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Test tone card ── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="px-4 py-4">
          <p className="text-sm font-extrabold text-slate-900 text-right mb-1">اختبار النغمة</p>
          <p className="text-[11px] text-slate-400 text-right mb-4">
            يُشغَّل الصوت المختار بمدة ومرات التكرار المضبوطة
          </p>
          <button
            type="button"
            onClick={handleTestTone}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors tap ${
              isPlaying
                ? "bg-red-50 text-red-600 border border-red-200"
                : "bg-blue-700 text-white"
            }`}
          >
            {isPlaying
              ? <><Square className="w-4 h-4 fill-current" style={{ pointerEvents: "none" }} /> إيقاف</>
              : <><Play className="w-4 h-4 fill-current" style={{ pointerEvents: "none" }} /> اختبار النغمة</>
            }
          </button>
        </div>
      </motion.div>

      {/* Shift pickers */}
      {([0, 1] as const).map((idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 + idx * 0.04 }}
          className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
              <Coffee className="w-3.5 h-3.5 text-amber-600" />
            </span>
            <h2 className="text-sm font-extrabold text-slate-900">
              {idx === 0 ? "الفسحة الأولى" : "الفسحة الثانية"}
            </h2>
            {settings.shifts[idx].periodId !== null && (
              <span className="mr-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                محدد
              </span>
            )}
          </div>
          <ShiftPicker
            label={idx === 0 ? "اختر اليوم والفسحة" : "اختر اليوم والفسحة"}
            shift={settings.shifts[idx]}
            activeDays={activeDays}
            allPeriods={allPeriods}
            onChange={(patch) => updateShift(idx, patch)}
          />
        </motion.div>
      ))}

      {/* Info note */}
      <div className="rounded-2xl p-4 bg-blue-50 border border-blue-100 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-700 leading-relaxed">
          يُشغَّل الجرس تلقائيًا في بداية الفسحة المختارة في يومها المحدد. يمكن تحديد فسحة مختلفة لكل يوم.
        </p>
      </div>
    </div>
  );
}
