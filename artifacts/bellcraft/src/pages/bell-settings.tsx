import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Bell, ChevronLeft, Volume2, Palmtree, ChevronRight, Zap, Clock, AlertCircle, Coffee, Star,
} from "lucide-react";
import { useBellStore } from "@/lib/bell-store";
import { readDutyAlertSettings } from "@/lib/duty-alert-prefs";
import { readTasksStore } from "@/lib/special-tasks-prefs";

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

function NavRow({
  href, icon, title, desc, enabled,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  enabled: boolean;
}) {
  return (
    <Link href={href}>
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="flex items-center justify-between p-4 tap cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            {icon}
          </span>
          <div>
            <p className="text-sm font-extrabold text-slate-900">{title}</p>
            <p className="text-[11px] text-slate-400">{desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
            }`}
          >
            {enabled ? "مفعّل" : "معطّل"}
          </span>
          <ChevronLeft className="w-4 h-4 text-slate-300" />
        </div>
      </motion.div>
    </Link>
  );
}

export default function BellSettings() {
  const { settings, updateSettings } = useBellStore();
  const dutySettings    = readDutyAlertSettings();
  const tasksStore      = readTasksStore();
  const activeTaskCount = tasksStore.tasks.filter(
    t => t.enabled && !t.completed,
  ).length;

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">إعدادات الجرس</h1>
          <p className="text-sm text-slate-500">التنبيهات والصوت</p>
        </div>
        <Link href="/settings">
          <button className="w-10 h-10 rounded-2xl bg-white border border-slate-200 card-shadow flex items-center justify-center tap">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </Link>
      </div>

      {/* General section */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <span className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <Zap className="w-4 h-4 text-blue-700" />
          </span>
          <h2 className="text-sm font-extrabold text-slate-900">الإعدادات العامة</h2>
        </div>

        {/* Auto ring */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Bell className="w-4 h-4 text-blue-700" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-800">تفعيل الجرس</p>
              <p className="text-[11px] text-slate-400">تشغيل أصوات التنبيه في أوقات الحصص</p>
            </div>
          </div>
          <Toggle on={settings.autoRing} onChange={(v) => updateSettings({ autoRing: v })} />
        </div>

        {/* Vacation mode */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <Palmtree className="w-4 h-4 text-amber-600" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-800">وضع الإجازة</p>
              <p className="text-[11px] text-slate-400">إيقاف جميع التنبيهات مؤقتًا</p>
            </div>
          </div>
          <Toggle on={settings.vacationMode} onChange={(v) => updateSettings({ vacationMode: v })} />
        </div>

        {/* Volume */}
        <div className="px-4 py-3.5 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-blue-700" />
              <span className="text-sm font-bold text-slate-700">مستوى الصوت الافتراضي</span>
            </div>
            <span className="text-sm font-bold text-blue-700 tabular-nums">
              {Math.round(settings.volume * 100)}%
            </span>
          </div>
          <input
            type="range" min={0} max={100} value={Math.round(settings.volume * 100)}
            onChange={(e) => updateSettings({ volume: Number(e.target.value) / 100 })}
            className="bc-range w-full"
          />
        </div>

        {/* Max volume */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Bell className="w-4 h-4 text-blue-700" />
            </span>
            <div>
              <p className="text-sm font-bold text-slate-800">أعلى مستوى صوت ممكن</p>
              <p className="text-[11px] text-slate-400">تضخيم الصوت حتى عند انخفاض صوت الهاتف</p>
            </div>
          </div>
          <Toggle on={settings.maxVolume} onChange={(v) => updateSettings({ maxVolume: v })} />
        </div>

      </motion.div>

      {/* Alert sub-pages */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-slate-200 bg-white card-shadow overflow-hidden divide-y divide-slate-100"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <span className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <Bell className="w-4 h-4 text-blue-700" />
          </span>
          <h2 className="text-sm font-extrabold text-slate-900">التنبيهات</h2>
        </div>

        <NavRow
          href="/bell-settings/pre-start"
          icon={<Zap className="w-4 h-4 text-blue-700" />}
          title="قبل بداية الحصة"
          desc={`التنبيه ${settings.leadTimeMin} دق قبل البداية`}
          enabled={settings.preStartEnabled}
        />
        <NavRow
          href="/bell-settings/pre-end"
          icon={<Clock className="w-4 h-4 text-blue-700" />}
          title="قبل نهاية الحصة"
          desc={`التنبيه ${settings.preEndMinBefore ?? 5} دق قبل النهاية`}
          enabled={settings.preEndEnabled}
        />
        <NavRow
          href="/bell-settings/end"
          icon={<AlertCircle className="w-4 h-4 text-blue-700" />}
          title="عند نهاية الحصة"
          desc="جرس نهاية الحصة"
          enabled={settings.endEnabled}
        />
        <NavRow
          href="/bell-settings/duty"
          icon={<Coffee className="w-4 h-4 text-amber-600" />}
          title="تنبيه المناوبة"
          desc="جرس بداية فسحة المناوبة"
          enabled={dutySettings.enabled}
        />
        <NavRow
          href="/bell-settings/special-tasks"
          icon={<Star className="w-4 h-4 text-amber-500" />}
          title="تنبيه المهام الخاصة"
          desc={tasksStore.tasks.length === 0
            ? "إضافة مهام ذات تاريخ ووقت محددين"
            : activeTaskCount > 0
            ? `${activeTaskCount} مهمة مُجدوَلة`
            : `${tasksStore.tasks.length} مهمة`}
          enabled={activeTaskCount > 0}
        />
      </motion.div>

      {/* Note */}
      <div className="rounded-2xl p-4 bg-blue-50 border border-blue-100 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-700 leading-relaxed">
          تُطبَّق التنبيهات على الجدول النشط فقط. لا يُشغَّل أي تنبيه إذا كانت خانة الحصة فارغة أو كان وضع الإجازة مفعّلاً.
        </p>
      </div>
    </div>
  );
}
