/**
 * تنبيه المهام الخاصة
 *
 * Unlimited task-based alarm system.  Each task has its own date, time,
 * ringtone, and duration and fires via AlarmManager / ForegroundService —
 * same infrastructure as the school bells.
 */
import { useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight, Bell, Plus, Trash2, Pencil,
  Play, Square, Upload, Music, Calendar, Clock,
  CheckCircle, AlertCircle, Star, X, ClipboardList,
} from "lucide-react";
import {
  useSpecialTasksStore, makeNewTask, taskSoundKey,
  type SpecialTask,
} from "@/lib/special-tasks-prefs";
import { useBellStore } from "@/lib/bell-store";
import {
  playBellOnce, startBellLoop, stopBell, setBellEnabled,
  BELL_SOUNDS, BELL_SOUND_LABELS, type BellSound,
} from "@/lib/audio";

// ── Constants ─────────────────────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { val: 5,    label: "5 ث" },
  { val: 10,   label: "10 ث" },
  { val: 15,   label: "15 ث" },
  { val: 30,   label: "30 ث" },
  { val: 60,   label: "دقيقة" },
  { val: 3600, label: "يدوي" },
];
const REPEAT_OPTIONS = [1, 2, 3, 4, 5];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatArabicDate(dateStr: string): string {
  if (!dateStr) return "لم يحدد";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("ar-SA", { weekday: "long", month: "long", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatTime12(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h < 12 ? "ص" : "م";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function isTaskPast(task: Pick<SpecialTask, "date" | "time">): boolean {
  if (!task.date || !task.time) return false;
  return new Date(`${task.date}T${task.time}:00`).getTime() < Date.now();
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-12 h-7 rounded-full transition-colors tap shrink-0 ${on ? "bg-blue-700" : "bg-slate-300"}`}
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

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task, onToggle, onEdit, onDelete,
}: {
  task: SpecialTask;
  onToggle: (v: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const past = isTaskPast(task);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <span className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <Star className="w-4 h-4 text-amber-500" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-slate-900 truncate">
            {task.name || <span className="text-slate-400 font-bold">مهمة بدون اسم</span>}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {formatArabicDate(task.date)} — {formatTime12(task.time)}
          </p>
        </div>
        <Toggle on={task.enabled && !task.completed} onChange={onToggle} />
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between px-4 pb-3">
        <div className="flex gap-1.5">
          {task.completed && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> تم
            </span>
          )}
          {!task.completed && past && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              انتهى الوقت
            </span>
          )}
          {!task.completed && !past && task.enabled && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              مُجدوَل
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-600 tap"
          >
            <Pencil className="w-3.5 h-3.5" style={{ pointerEvents: "none" }} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 tap"
          >
            <Trash2 className="w-3.5 h-3.5" style={{ pointerEvents: "none" }} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Task Modal (bottom sheet) ─────────────────────────────────────────────────

function TaskModal({
  task: initialTask,
  isNew,
  globalVolume,
  globalMaxVolume,
  onSave,
  onCancel,
}: {
  task: SpecialTask;
  isNew: boolean;
  globalVolume: number;
  globalMaxVolume: boolean;
  onSave: (task: SpecialTask) => void;
  onCancel: () => void;
}) {
  const [task, setTask] = useState<SpecialTask>({ ...initialTask });

  // Custom sound for this task
  const soundKey = taskSoundKey(task.id);
  const [customDataUrl, setCustomDataUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(soundKey) ?? null; } catch { return null; }
  });
  const [customFileName, setCustomFileName] = useState<string>(() => {
    try { return localStorage.getItem(`${soundKey}_name`) ?? ""; } catch { return ""; }
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((p: Partial<SpecialTask>) => setTask(prev => ({ ...prev, ...p })), []);

  // ── Validation ──────────────────────────────────────────────────────────────
  const isPast = isTaskPast(task);
  const isEmpty = !task.date || !task.time;
  const canEnable = !isEmpty && !isPast;

  // ── Test tone ───────────────────────────────────────────────────────────────
  const handleTestTone = () => {
    if (isPlaying) {
      stopBell();
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      setIsPlaying(false);
      return;
    }
    setBellEnabled(true);
    setIsPlaying(true);
    const sound = (task.bellSound ?? "classic") as BellSound;
    const dur = Math.min(task.durationSec === 3600 ? 10 : task.durationSec, 30);
    startBellLoop(sound, globalVolume, dur, {
      maxVolume: globalMaxVolume,
      repeatCount: task.repeatCount,
      customDataUrl: sound === "custom" ? (customDataUrl ?? undefined) : undefined,
    });
    playTimerRef.current = setTimeout(() => { stopBell(); setIsPlaying(false); }, dur * 1000 + 800);
  };

  // ── Custom file upload ──────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        localStorage.setItem(soundKey, dataUrl);
        localStorage.setItem(`${soundKey}_name`, file.name);
      } catch {}
      setCustomDataUrl(dataUrl);
      setCustomFileName(file.name);
      patch({ bellSound: "custom" });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveCustom = () => {
    try {
      localStorage.removeItem(soundKey);
      localStorage.removeItem(`${soundKey}_name`);
    } catch {}
    setCustomDataUrl(null);
    setCustomFileName("");
    if (task.bellSound === "custom") patch({ bellSound: "classic" });
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = () => {
    // Stop any test tone
    if (isPlaying) { stopBell(); if (playTimerRef.current) clearTimeout(playTimerRef.current); }
    const finalTask = { ...task };
    // If enabling but not valid → keep disabled
    if (finalTask.enabled && (!canEnable)) finalTask.enabled = false;
    // Clear completed flag if re-enabling or date/time changed
    if (finalTask.enabled) finalTask.completed = false;
    onSave(finalTask);
  };

  const sound = (task.bellSound ?? "classic") as BellSound;
  const today = new Date().toISOString().split("T")[0];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onCancel}
      />

      {/* Bottom sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[92vh] flex flex-col"
        dir="rtl"
      >
        {/* Handle + header */}
        <div className="shrink-0 px-4 pt-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900">
              {isNew ? "إضافة مهمة جديدة" : "تعديل المهمة"}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 tap"
            >
              <X className="w-4 h-4" style={{ pointerEvents: "none" }} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">

          {/* Task name */}
          <div>
            <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">
              اسم المهمة
            </p>
            <input
              type="text"
              value={task.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="مثال: اجتماع ميزانية، جمع الكتب..."
              className="w-full text-sm font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-300"
              dir="rtl"
            />
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3.5 border border-slate-200">
            <div>
              <p className="text-sm font-extrabold text-slate-900">تفعيل التنبيه</p>
              {!canEnable && !task.completed && (
                <p className="text-[11px] text-amber-600 mt-0.5">
                  {isEmpty ? "حدد التاريخ والوقت أولاً" : "الوقت قد مضى"}
                </p>
              )}
            </div>
            <Toggle
              on={task.enabled && !task.completed}
              onChange={(v) => patch({ enabled: canEnable ? v : false, completed: false })}
            />
          </div>

          {/* Date & Time */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <Calendar className="w-4 h-4 text-blue-700" />
              <h3 className="text-sm font-extrabold text-slate-900">التاريخ والوقت</h3>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-800">التاريخ</span>
              <input
                type="date"
                value={task.date}
                min={today}
                onChange={(e) => patch({ date: e.target.value, completed: false })}
                className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                dir="ltr"
              />
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-bold text-slate-800 flex items-center gap-1">
                <Clock className="w-4 h-4 text-blue-600" />
                الوقت
              </span>
              <input
                type="time"
                value={task.time}
                onChange={(e) => patch({ time: e.target.value, completed: false })}
                className="text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                dir="ltr"
              />
            </div>
          </div>

          {/* Duration & Repeat */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100">
              <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                مدة الرنين
              </p>
              <div className="flex gap-2 flex-wrap">
                {DURATION_OPTIONS.map(d => (
                  <button
                    key={d.val}
                    type="button"
                    onClick={() => patch({ durationSec: d.val })}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all tap
                      ${task.durationSec === d.val
                        ? "bg-blue-700 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 py-3.5">
              <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                عدد التكرار
              </p>
              <div className="flex gap-2 flex-wrap">
                {REPEAT_OPTIONS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => patch({ repeatCount: r })}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all tap
                      ${task.repeatCount === r
                        ? "bg-blue-700 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {r === 1 ? "مرة" : `${r}×`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ringtone picker */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <Music className="w-4 h-4 text-blue-700" />
              <h3 className="text-sm font-extrabold text-slate-900">النغمة</h3>
            </div>

            {BELL_SOUNDS.map((s) => (
              <div
                key={s}
                className={`flex items-center justify-between px-4 py-3 border-b border-slate-100 transition-colors ${sound === s ? "bg-blue-50" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => patch({ bellSound: s })}
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
                  onClick={() => playBellOnce(s, globalVolume, { maxVolume: globalMaxVolume })}
                  className="w-9 h-9 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-700 tap"
                >
                  <Play className="w-4 h-4 fill-current" style={{ pointerEvents: "none" }} />
                </button>
              </div>
            ))}

            {/* Custom sound row */}
            <div className={`px-4 py-3 transition-colors ${sound === "custom" ? "bg-blue-50" : ""}`}>
              {customDataUrl ? (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => patch({ bellSound: "custom" })}
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
                        onClick={() => playBellOnce("custom", globalVolume, { maxVolume: globalMaxVolume, customDataUrl: customDataUrl ?? undefined })}
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
          </div>

          {/* Test tone */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-4">
              <p className="text-sm font-extrabold text-slate-900 mb-1">اختبار النغمة</p>
              <p className="text-[11px] text-slate-400 mb-3">يُشغَّل الصوت المختار بالإعدادات الحالية</p>
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
          </div>

          {/* Past warning */}
          {isPast && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-amber-50 border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-[11px] text-amber-700 font-bold">
                التاريخ والوقت قد مضيا — لن يرنّ التنبيه.
              </p>
            </div>
          )}

          {/* Spacer for button */}
          <div className="h-2" />
        </div>

        {/* Save / Cancel */}
        <div className="shrink-0 px-4 pt-3 pb-6 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm tap"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-3 rounded-2xl bg-blue-700 text-white font-extrabold text-sm tap shadow-sm"
          >
            {isNew ? "إضافة" : "حفظ"}
          </button>
        </div>
      </motion.div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SpecialTasks() {
  const { store, updateStore, addTask, updateTask, deleteTask } = useSpecialTasksStore();
  const { settings: bellGlobal } = useBellStore();

  const [editTask, setEditTask] = useState<SpecialTask | null>(null);
  const [isNew, setIsNew] = useState(false);

  const openAdd = () => {
    setIsNew(true);
    setEditTask(makeNewTask());
  };

  const openEdit = (task: SpecialTask) => {
    setIsNew(false);
    setEditTask({ ...task });
  };

  const handleSave = (task: SpecialTask) => {
    if (isNew) {
      addTask(task);
    } else {
      updateTask(task.id, task);
    }
    setEditTask(null);
  };

  const handleToggle = (task: SpecialTask, v: boolean) => {
    const past = isTaskPast(task);
    if (v && past) return; // block enabling past tasks
    updateTask(task.id, { enabled: v, completed: v ? false : task.completed });
  };

  const enabledCount = store.tasks.filter(t => t.enabled && !t.completed && !isTaskPast(t)).length;

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">المهام الخاصة</h1>
          <p className="text-sm text-slate-500">
            {store.tasks.length === 0
              ? "لا توجد مهام بعد"
              : enabledCount > 0
              ? `${enabledCount} مهمة مُجدوَلة`
              : `${store.tasks.length} مهمة`}
          </p>
        </div>
        <Link href="/bell-settings">
          <button className="w-10 h-10 rounded-2xl bg-white border border-slate-200 card-shadow flex items-center justify-center tap">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </Link>
      </div>

      {/* After-fire setting */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <span className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <Bell className="w-4 h-4 text-blue-700" />
          </span>
          <h2 className="text-sm font-extrabold text-slate-900">بعد تنفيذ المهمة</h2>
        </div>
        <button
          type="button"
          onClick={() => updateStore({ autoDeleteCompleted: false })}
          className={`w-full flex items-center justify-between px-4 py-3.5 border-b border-slate-100 tap transition-colors ${!store.autoDeleteCompleted ? "bg-blue-50" : ""}`}
        >
          <span className={`text-sm font-bold ${!store.autoDeleteCompleted ? "text-slate-900" : "text-slate-600"}`}>
            الاحتفاظ بالمهمة حتى الحذف اليدوي
          </span>
          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${!store.autoDeleteCompleted ? "border-blue-700" : "border-slate-300"}`} style={{ pointerEvents: "none" }}>
            {!store.autoDeleteCompleted && <span className="w-2.5 h-2.5 rounded-full bg-blue-700" style={{ pointerEvents: "none" }} />}
          </span>
        </button>
        <button
          type="button"
          onClick={() => updateStore({ autoDeleteCompleted: true })}
          className={`w-full flex items-center justify-between px-4 py-3.5 tap transition-colors ${store.autoDeleteCompleted ? "bg-blue-50" : ""}`}
        >
          <span className={`text-sm font-bold ${store.autoDeleteCompleted ? "text-slate-900" : "text-slate-600"}`}>
            حذف المهمة تلقائياً بعد تنفيذها
          </span>
          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${store.autoDeleteCompleted ? "border-blue-700" : "border-slate-300"}`} style={{ pointerEvents: "none" }}>
            {store.autoDeleteCompleted && <span className="w-2.5 h-2.5 rounded-full bg-blue-700" style={{ pointerEvents: "none" }} />}
          </span>
        </button>
      </motion.div>

      {/* Task list */}
      {store.tasks.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-slate-200 bg-white card-shadow p-8 flex flex-col items-center gap-3"
        >
          <span className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
            <ClipboardList className="w-7 h-7 text-amber-400" />
          </span>
          <p className="text-sm font-extrabold text-slate-700">لا توجد مهام بعد</p>
          <p className="text-[11px] text-slate-400 text-center">
            أضف مهامك الخاصة مثل الاجتماعات وجمع الكتب والمناوبات
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {store.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={(v) => handleToggle(task, v)}
                onEdit={() => openEdit(task)}
                onDelete={() => deleteTask(task.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add button */}
      <motion.button
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        type="button"
        onClick={openAdd}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 font-extrabold text-sm tap hover:bg-blue-100 transition-colors"
      >
        <Plus className="w-5 h-5" style={{ pointerEvents: "none" }} />
        إضافة مهمة جديدة
      </motion.button>

      {/* Info */}
      <div className="rounded-2xl p-4 bg-blue-50 border border-blue-100 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-700 leading-relaxed">
          يرنّ كل تنبيه مرة واحدة في تاريخه ووقته بغضّ النظر عن وضع الإجازة أو حالة التطبيق. يعمل حتى عند إغلاق التطبيق أو قفل الشاشة.
        </p>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {editTask && (
          <TaskModal
            task={editTask}
            isNew={isNew}
            globalVolume={bellGlobal.volume}
            globalMaxVolume={bellGlobal.maxVolume}
            onSave={handleSave}
            onCancel={() => setEditTask(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
