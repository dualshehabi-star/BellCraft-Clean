import { useRef, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ChevronRight, Play, Square, Upload, Trash2, Music,
  Calendar, Clock, CheckCircle, AlertCircle, Star,
} from "lucide-react";
import {
  useSpecialDutySettings,
  writeSpecialDutySettings,
  SPECIAL_DUTY_CUSTOM_SOUND_KEY,
} from "@/lib/special-duty-prefs";
import { useBellStore } from "@/lib/bell-store";
import {
  playBellOnce, startBellLoop, stopBell, setBellEnabled,
  BELL_SOUNDS, BELL_SOUND_LABELS, type BellSound,
} from "@/lib/audio";

const DURATION_OPTIONS = [
  { val: 5,    label: "5 ثوانٍ" },
  { val: 10,   label: "10 ثوانٍ" },
  { val: 15,   label: "15 ثانية" },
  { val: 30,   label: "30 ثانية" },
  { val: 60,   label: "دقيقة واحدة" },
  { val: 3600, label: "حتى الإيقاف اليدوي" },
];
const REPEAT_OPTIONS = [1, 2, 3, 4, 5];

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
        className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md ${on ? "right-0.5" : "left-0.5"}`}
        style={{ pointerEvents: "none" }}
      />
    </button>
  );
}

function SelectRow({
  label, value, options, onChange,
}: {
  label: string;
  value: number;
  options: { val: number; label: string }[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-b-0">
      <span className="text-sm font-bold text-slate-800">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        dir="rtl"
      >
        {options.map((o) => (
          <option key={o.val} value={o.val}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function SpecialDuty() {
  const { settings, update } = useSpecialDutySettings();
  const { settings: bellGlobal } = useBellStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const customDataUrl = (() => {
    try { return localStorage.getItem(SPECIAL_DUTY_CUSTOM_SOUND_KEY) ?? ""; } catch { return ""; }
  })();
  const customFileName = (() => {
    try { return localStorage.getItem(`${SPECIAL_DUTY_CUSTOM_SOUND_KEY}_name`) ?? ""; } catch { return ""; }
  })();

  // ── Validation ─────────────────────────────────────────────────────────────
  const isPast = (() => {
    if (!settings.date || !settings.time) return false;
    return new Date(`${settings.date}T${settings.time}:00`).getTime() < Date.now();
  })();

  const isEmpty = !settings.date || !settings.time;

  // ── Enable/disable toggle ──────────────────────────────────────────────────
  const handleToggle = (v: boolean) => {
    if (v && (isEmpty || isPast)) return; // block enabling if not ready
    update({ enabled: v, completed: v ? false : settings.completed });
  };

  // ── Test tone ──────────────────────────────────────────────────────────────
  const handleTestTone = () => {
    if (isPlaying) {
      stopBell();
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      setIsPlaying(false);
      return;
    }
    setBellEnabled(true);
    setIsPlaying(true);
    const sound = (settings.bellSound ?? "classic") as BellSound;
    const dur = Math.min(settings.durationSec, 30); // cap test at 30s
    startBellLoop(sound, bellGlobal.volume, dur, {
      maxVolume: bellGlobal.maxVolume,
      repeatCount: settings.repeatCount,
      customDataUrl: sound === "custom" ? customDataUrl : undefined,
    });
    playTimerRef.current = setTimeout(() => { stopBell(); setIsPlaying(false); }, dur * 1000 + 800);
  };

  // ── Custom file upload ─────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        localStorage.setItem(SPECIAL_DUTY_CUSTOM_SOUND_KEY, dataUrl);
        localStorage.setItem(`${SPECIAL_DUTY_CUSTOM_SOUND_KEY}_name`, file.name);
      } catch {}
      update({ bellSound: "custom" });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCustom = () => {
    try {
      localStorage.removeItem(SPECIAL_DUTY_CUSTOM_SOUND_KEY);
      localStorage.removeItem(`${SPECIAL_DUTY_CUSTOM_SOUND_KEY}_name`);
    } catch {}
    update({ bellSound: "classic" });
  };

  // ── Mark completed manually (reset) ───────────────────────────────────────
  const handleReset = () => {
    writeSpecialDutySettings({ ...settings, completed: false, enabled: false });
  };

  const sound = (settings.bellSound ?? "classic") as BellSound;

  return (
    <div className="space-y-4 pb-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500" />
            تنبيه مناوبة خاص
          </h1>
          <p className="text-sm text-slate-500">تنبيه لمرة واحدة في تاريخ ووقت محدد</p>
        </div>
        <Link href="/bell-settings">
          <button className="w-10 h-10 rounded-2xl bg-white border border-slate-200 card-shadow flex items-center justify-center tap">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </Link>
      </div>

      {/* Completed banner */}
      {settings.completed && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200"
        >
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-800">تم تشغيل التنبيه ✓</p>
            <p className="text-[11px] text-emerald-600">رنّ التنبيه في موعده. اضغط «إعادة ضبط» لجدولة تنبيه جديد.</p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] font-bold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 tap"
          >
            إعادة ضبط
          </button>
        </motion.div>
      )}

      {/* Validation warning */}
      {!settings.completed && isPast && (
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-[11px] text-amber-700 font-bold">
            التاريخ والوقت المحددان قد مضيا — لن يُجدوَل أي تنبيه.
          </p>
        </div>
      )}

      {/* Enable / Disable */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-sm font-extrabold text-slate-900">تفعيل التنبيه</p>
            <p className="text-[11px] text-slate-400">
              {settings.enabled
                ? "التنبيه مُجدوَل — سيرنّ مرة واحدة فقط"
                : "التنبيه معطّل"}
            </p>
          </div>
          <Toggle on={settings.enabled && !settings.completed} onChange={handleToggle} />
        </div>
        {(isEmpty && !settings.completed) && (
          <p className="px-4 pb-3 text-[11px] text-amber-600">
            يجب تحديد التاريخ والوقت أولاً لتفعيل التنبيه.
          </p>
        )}
      </motion.div>

      {/* Date & Time */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Calendar className="w-4 h-4 text-blue-700" />
          <h2 className="text-sm font-extrabold text-slate-900">التاريخ والوقت</h2>
        </div>

        {/* Date */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-bold text-slate-800">التاريخ</span>
          <input
            type="date"
            value={settings.date}
            onChange={(e) => update({ date: e.target.value, completed: false })}
            min={new Date().toISOString().split("T")[0]}
            className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            dir="ltr"
          />
        </div>

        {/* Time */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-bold text-slate-800 flex items-center gap-1">
            <Clock className="w-4 h-4 text-blue-600" />
            الوقت
          </span>
          <input
            type="time"
            value={settings.time}
            onChange={(e) => update({ time: e.target.value, completed: false })}
            className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            dir="ltr"
          />
        </div>
      </motion.div>

      {/* Duration & Repeat */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <SelectRow
          label="مدة الرنين"
          value={settings.durationSec}
          options={DURATION_OPTIONS}
          onChange={(v) => update({ durationSec: v })}
        />
        <SelectRow
          label="عدد مرات التكرار"
          value={settings.repeatCount}
          options={REPEAT_OPTIONS.map((r) => ({ val: r, label: r === 1 ? "مرة واحدة" : `${r} مرات` }))}
          onChange={(v) => update({ repeatCount: v })}
        />
      </motion.div>

      {/* Notification text (optional) */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.07 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">عنوان الإشعار (اختياري)</p>
          <input
            type="text"
            value={settings.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="تنبيه المناوبة الخاص"
            className="w-full text-sm font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300"
            dir="rtl"
          />
        </div>
        <div className="px-4 py-3">
          <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-2">نص الإشعار (اختياري)</p>
          <input
            type="text"
            value={settings.body}
            onChange={(e) => update({ body: e.target.value })}
            placeholder="حان وقت التنبيه الخاص"
            className="w-full text-sm font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300"
            dir="rtl"
          />
        </div>
      </motion.div>

      {/* Ringtone picker */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.09 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Music className="w-4 h-4 text-blue-700" />
          <h2 className="text-sm font-extrabold text-slate-900">النغمة</h2>
        </div>

        {BELL_SOUNDS.map((s) => (
          <div
            key={s}
            className={`flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors ${sound === s ? "bg-blue-50" : ""}`}
          >
            <button
              type="button"
              onClick={() => update({ bellSound: s })}
              className="flex items-center gap-3 flex-1 text-right tap"
            >
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${sound === s ? "border-blue-700" : "border-slate-300"}`}
                style={{ pointerEvents: "none" }}
              >
                {sound === s && <span className="w-2.5 h-2.5 rounded-full bg-blue-700" style={{ pointerEvents: "none" }} />}
              </span>
              <span className={`text-sm font-bold ${sound === s ? "text-slate-900" : "text-slate-600"}`} style={{ pointerEvents: "none" }}>
                {BELL_SOUND_LABELS[s]}
              </span>
            </button>
            <button
              type="button"
              onClick={() => playBellOnce(s, bellGlobal.volume, { maxVolume: bellGlobal.maxVolume })}
              className="w-9 h-9 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-700 tap"
            >
              <Play className="w-4 h-4 fill-current" style={{ pointerEvents: "none" }} />
            </button>
          </div>
        ))}

        {/* Custom sound */}
        <div className={`px-4 py-3 transition-colors ${sound === "custom" ? "bg-blue-50" : ""}`}>
          {customDataUrl ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => update({ bellSound: "custom" })}
                className="flex items-center gap-3 flex-1 text-right tap"
              >
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${sound === "custom" ? "border-blue-700" : "border-slate-300"}`}
                  style={{ pointerEvents: "none" }}
                >
                  {sound === "custom" && <span className="w-2.5 h-2.5 rounded-full bg-blue-700" style={{ pointerEvents: "none" }} />}
                </span>
                <div className="min-w-0" style={{ pointerEvents: "none" }}>
                  <p className="text-sm font-bold text-slate-900">نغمة مخصصة</p>
                  <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{customFileName || "ملف صوتي"}</p>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {sound === "custom" && (
                  <button
                    type="button"
                    onClick={() => playBellOnce("custom", bellGlobal.volume, { maxVolume: bellGlobal.maxVolume, customDataUrl })}
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
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
        </div>
      </motion.div>

      {/* Test tone */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.11 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="px-4 py-4">
          <p className="text-sm font-extrabold text-slate-900 mb-1">اختبار النغمة</p>
          <p className="text-[11px] text-slate-400 mb-4">يُشغَّل الصوت المختار للتأكد منه</p>
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

      {/* Info note */}
      <div className="rounded-2xl p-4 bg-blue-50 border border-blue-100 flex items-start gap-3">
        <Star className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-700 leading-relaxed">
          يرنّ هذا التنبيه مرة واحدة فقط في التاريخ والوقت المحددين، ثم يُعطَّل تلقائياً.
          يعمل حتى عند إغلاق التطبيق أو قفل الشاشة أو وضع الإجازة.
        </p>
      </div>
    </div>
  );
}
