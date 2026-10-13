import { Bell, BookOpen, ChevronLeft, VolumeX, Volume2, X, BookMarked } from "lucide-react";
import { Link } from "wouter";
import { useListSubjects } from "@/lib/api-client";
import { motion } from "framer-motion";
import { useBellRunner } from "@/lib/bell-runner-context";
import { isCapacitorAndroid } from "@/lib/capacitor-bell";

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4 border border-slate-200 bg-white card-shadow">
      <div className="flex items-center gap-2 mb-4">
        {icon && <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">{icon}</span>}
        <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
      </div>
      {children}
    </motion.div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-12 h-7 rounded-full transition-colors tap ${on ? "bg-blue-700" : "bg-slate-300"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md ${on ? "left-0.5" : "right-0.5"}`}
      />
    </button>
  );
}

function SettingRow({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">{icon}</span>
        <div>
          <div className="text-sm font-bold text-slate-800">{title}</div>
          <div className="text-[11px] text-slate-400">{desc}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { data: subjects = [] } = useListSubjects();
  const { audioUnlocked, pushEnabled, handleEnableAudio, handleDisableAudio } = useBellRunner();
  return (
    <div className="space-y-5 pb-4" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">الإعدادات</h1>
        <p className="text-sm text-slate-500">الجرس وإعدادات التطبيق</p>
      </div>

      {/* User guide nav row */}
      <Link href="/user-guide">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white card-shadow tap cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <BookMarked className="w-4 h-4 text-blue-700" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-slate-900">دليل الاستخدام</p>
              <p className="text-[11px] text-slate-400">شرح شامل لجميع وظائف التطبيق</p>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </motion.div>
      </Link>

      {/* Subjects nav row */}
      <Link href="/subjects">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white card-shadow tap cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-blue-700" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-slate-900">المواد الدراسية</p>
              <p className="text-[11px] text-slate-400">
                {subjects.length > 0 ? `${subjects.length} مادة مضافة` : "لا توجد مواد بعد"}
              </p>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </motion.div>
      </Link>

      {/* Bell settings nav row */}
      <Link href="/bell-settings">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white card-shadow tap cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-blue-700" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-slate-900">إعدادات الجرس</p>
              <p className="text-[11px] text-slate-400">
                التنبيهات، النغمات، الصوت
              </p>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </motion.div>
      </Link>

      {/* ── Web bell toggle (browser only) ─────────────────────────────── */}
      {!isCapacitorAndroid() && (!audioUnlocked ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3.5 flex items-center gap-3"
        >
          <span className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <VolumeX className="w-4 h-4 text-blue-600" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-blue-900 leading-tight">الجرس غير مفعّل</p>
            <p className="text-[11px] text-blue-700 mt-0.5 leading-snug">
              اضغط لتفعيل صوت الجرس في هذه الجلسة
            </p>
          </div>
          <button
            onClick={handleEnableAudio}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-700 text-white text-xs font-extrabold tap active:scale-95 transition-transform"
          >
            <Volume2 className="w-3.5 h-3.5" />
            تفعيل الجرس
          </button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-3"
        >
          <span className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-green-700" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-extrabold text-green-900">🔔 الجرس مفعّل</p>
            <p className="text-[11px] text-green-700 leading-snug">
              {pushEnabled
                ? "يرن حتى لو أُغلقت الصفحة"
                : "يرن طالما الصفحة مفتوحة"}
            </p>
          </div>
          <button
            onClick={handleDisableAudio}
            className="shrink-0 w-7 h-7 rounded-full bg-green-100 flex items-center justify-center tap"
            title="إيقاف"
          >
            <X className="w-3.5 h-3.5 text-green-700" />
          </button>
        </motion.div>
      ))}


      {/* About */}
      <div className="rounded-2xl p-5 text-center card-shadow-lg" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)" }}>
        <div className="w-14 h-14 mx-auto rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center mb-3">
          <Bell className="w-7 h-7 text-white" strokeWidth={2.5} />
        </div>
        <h3 className="font-extrabold text-white text-base" style={{ fontFamily: "system-ui, sans-serif" }}>BellCraft</h3>
        <p className="text-xs text-blue-200 mt-1">الإصدار 1.0.0 — إدارة الجداول والجرس الذكي</p>
      </div>

      <p className="text-center text-[11px] text-slate-400 pt-2">صُنع بشغف لإدارة الحصص الدراسية 💙</p>
    </div>
  );
}
