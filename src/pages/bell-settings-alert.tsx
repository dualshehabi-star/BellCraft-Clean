import { useRef, useCallback, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, Play, Upload, Trash2, Music, ListChecks, Square } from "lucide-react";
import { useBellStore } from "@/lib/bell-store";
import { playBellOnce, startBellLoop, stopBell, setBellEnabled, BELL_SOUNDS, BELL_SOUND_LABELS, CUSTOM_SOUND_KEYS, type BellSound } from "@/lib/audio";
import type { AppSettings } from "@/lib/api-client";

// ── Types ────────────────────────────────────────────────────────────────────
export type AlertType = "pre-start" | "pre-end" | "end";

const ALERT_TITLES: Record<AlertType, string> = {
  "pre-start": "قبل بداية الحصة",
  "pre-end": "قبل نهاية الحصة",
  "end": "عند نهاية الحصة",
};

const CUSTOM_KEY_MAP: Record<AlertType, string> = {
  "pre-start": CUSTOM_SOUND_KEYS.preStart,
  "pre-end": CUSTOM_SOUND_KEYS.preEnd,
  "end": CUSTOM_SOUND_KEYS.end,
};

const DURATION_OPTIONS = [3, 5, 6, 10, 15];
const REPEAT_OPTIONS = [1, 2, 3, 4, 5];
const MIN_BEFORE_OPTIONS = [1, 2, 3, 5, 10, 15];

// ── Alert field mapping ──────────────────────────────────────────────────────
function getAlertFields(type: AlertType, s: AppSettings) {
  if (type === "pre-start") {
    return {
      enabled: s.preStartEnabled,
      minBefore: s.leadTimeMin,
      sound: s.bellSound as BellSound,
      duration: s.ringDurationSec,
      repeat: s.preStartRepeat,
    };
  }
  if (type === "pre-end") {
    return {
      enabled: s.preEndEnabled,
      minBefore: s.preEndMinBefore,
      sound: s.preEndSound as BellSound,
      duration: s.preEndDurationSec,
      repeat: s.preEndRepeat,
    };
  }
  return {
    enabled: s.endEnabled,
    minBefore: null,
    sound: s.endSound as BellSound,
    duration: s.endDurationSec,
    repeat: s.endRepeat,
  };
}

function buildPatch(type: AlertType, field: string, value: unknown): Partial<Omit<AppSettings, "id">> {
  if (type === "pre-start") {
    const map: Record<string, string> = {
      enabled: "preStartEnabled",
      minBefore: "leadTimeMin",
      sound: "bellSound",
      duration: "ringDurationSec",
      repeat: "preStartRepeat",
    };
    return { [map[field]]: value } as Partial<Omit<AppSettings, "id">>;
  }
  if (type === "pre-end") {
    const map: Record<string, string> = {
      enabled: "preEndEnabled",
      minBefore: "preEndMinBefore",
      sound: "preEndSound",
      duration: "preEndDurationSec",
      repeat: "preEndRepeat",
    };
    return { [map[field]]: value } as Partial<Omit<AppSettings, "id">>;
  }
  const map: Record<string, string> = {
    enabled: "endEnabled",
    sound: "endSound",
    duration: "endDurationSec",
    repeat: "endRepeat",
  };
  return { [map[field]]: value } as Partial<Omit<AppSettings, "id">>;
}

// ── Sub-components ───────────────────────────────────────────────────────────
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider px-4 pt-4 pb-1">
      {children}
    </p>
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

// ── Main component ───────────────────────────────────────────────────────────
export default function BellSettingsAlert({ alertType }: { alertType: AlertType }) {
  const { settings, updateSettings } = useBellStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const fields = getAlertFields(alertType, settings);
  const customKey = CUSTOM_KEY_MAP[alertType];
  const customDataUrl = localStorage.getItem(customKey) ?? "";
  const customFileName = localStorage.getItem(`${customKey}_name`) ?? "";
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(
    (field: string, value: unknown) => updateSettings(buildPatch(alertType, field, value)),
    [alertType, updateSettings]
  );

  const handleTestTone = () => {
    if (isPlaying) {
      stopBell();
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      setIsPlaying(false);
      return;
    }
    setBellEnabled(true);
    setIsPlaying(true);
    const repeatCount = fields.repeat ?? 1;
    const durationSec = fields.duration ?? 6;
    startBellLoop(fields.sound, settings.volume, durationSec, {
      maxVolume: settings.maxVolume,
      repeatCount,
      customDataUrl: fields.sound === "custom" ? customDataUrl : undefined,
    });
    const totalMs = durationSec * repeatCount * 1000 + 800;
    playTimerRef.current = setTimeout(() => { stopBell(); setIsPlaying(false); }, totalMs);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      localStorage.setItem(customKey, dataUrl);
      localStorage.setItem(`${customKey}_name`, file.name);
      update("sound", "custom");
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveCustom = () => {
    localStorage.removeItem(customKey);
    localStorage.removeItem(`${customKey}_name`);
    update("sound", "classic");
  };

  return (
    <div className="space-y-4 pb-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">
            {ALERT_TITLES[alertType]}
          </h1>
          <p className="text-sm text-slate-500">إعدادات التنبيه</p>
        </div>
        <Link href="/bell-settings">
          <button className="w-10 h-10 rounded-2xl bg-white border border-slate-200 card-shadow flex items-center justify-center tap">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </Link>
      </div>

      {/* Enable / disable */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-extrabold text-slate-900">تفعيل التنبيه</p>
            <p className="text-[11px] text-slate-400">تشغيل الجرس تلقائيًا</p>
          </div>
          <Toggle on={fields.enabled} onChange={(v) => update("enabled", v)} />
        </div>

        {/* Choose which periods — only for pre-start */}
        {alertType === "pre-start" && (
          <Link href="/bell-settings/pre-start/periods">
            <motion.div
              whileTap={{ scale: 0.98 }}
              className="flex items-center justify-between px-4 py-3.5 tap cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <ListChecks className="w-4 h-4 text-blue-700" />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-800">اختر الحصص</p>
                  <p className="text-[11px] text-slate-400">حدد الحصص التي تريد التنبيه قبلها</p>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-slate-300" />
            </motion.div>
          </Link>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        {/* Timing */}
        {fields.minBefore !== null && (
          <>
            <SectionTitle>التوقيت</SectionTitle>
            <SelectRow
              label="الوقت قبل البداية / النهاية"
              value={fields.minBefore}
              options={MIN_BEFORE_OPTIONS.map((m) => ({ val: m, label: `${m} دقيقة` }))}
              onChange={(v) => update("minBefore", v)}
            />
          </>
        )}

        {/* Duration */}
        <SectionTitle>مدة الرنين</SectionTitle>
        <SelectRow
          label="مدة الرنين"
          value={fields.duration}
          options={DURATION_OPTIONS.map((d) => ({ val: d, label: `${d} ثانية` }))}
          onChange={(v) => update("duration", v)}
        />

        {/* Repeat count */}
        <SectionTitle>التكرار</SectionTitle>
        <SelectRow
          label="عدد مرات التكرار"
          value={fields.repeat}
          options={REPEAT_OPTIONS.map((r) => ({ val: r, label: r === 1 ? "مرة واحدة" : `${r} مرات` }))}
          onChange={(v) => update("repeat", v)}
        />
      </motion.div>

      {/* Sound picker */}
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Music className="w-4 h-4 text-blue-700" />
          <h2 className="text-sm font-extrabold text-slate-900">النغمة</h2>
        </div>

        {BELL_SOUNDS.map((sound) => (
          <div
            key={sound}
            className={`flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors ${
              fields.sound === sound ? "bg-blue-50" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => update("sound", sound)}
              className="flex items-center gap-3 flex-1 text-right tap"
            >
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  fields.sound === sound ? "border-blue-700" : "border-slate-300"
                }`}
                style={{ pointerEvents: "none" }}
              >
                {fields.sound === sound && <span className="w-2.5 h-2.5 rounded-full bg-blue-700" style={{ pointerEvents: "none" }} />}
              </span>
              <span className={`text-sm font-bold ${fields.sound === sound ? "text-slate-900" : "text-slate-600"}`} style={{ pointerEvents: "none" }}>
                {BELL_SOUND_LABELS[sound]}
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                playBellOnce(sound, settings.volume, { maxVolume: settings.maxVolume })
              }
              className="w-9 h-9 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-700 tap"
            >
              <Play className="w-4 h-4 fill-current" style={{ pointerEvents: "none" }} />
            </button>
          </div>
        ))}

        {/* Custom sound */}
        <div className={`px-4 py-3 transition-colors ${fields.sound === "custom" ? "bg-blue-50" : ""}`}>
          {customDataUrl ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => update("sound", "custom")}
                className="flex items-center gap-3 flex-1 text-right tap"
              >
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    fields.sound === "custom" ? "border-blue-700" : "border-slate-300"
                  }`}
                  style={{ pointerEvents: "none" }}
                >
                  {fields.sound === "custom" && <span className="w-2.5 h-2.5 rounded-full bg-blue-700" style={{ pointerEvents: "none" }} />}
                </span>
                <div className="min-w-0" style={{ pointerEvents: "none" }}>
                  <p className="text-sm font-bold text-slate-900">نغمة مخصصة</p>
                  <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
                    {customFileName || "ملف صوتي"}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                {fields.sound === "custom" && (
                  <button
                    type="button"
                    onClick={() => playBellOnce("custom", settings.volume, { maxVolume: settings.maxVolume, customDataUrl })}
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
            onChange={handleFileUpload}
          />
        </div>
      </motion.div>

      {/* ── Test tone button ── */}
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

    </div>
  );
}
