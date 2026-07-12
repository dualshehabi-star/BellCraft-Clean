import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CalendarDays, Plus, Download, Share2, Smartphone, X, Palmtree,
} from "lucide-react";
import { toPng } from "html-to-image";
import { useToast } from "@/hooks/use-toast";
import {
  useGetDashboard,
  useListPeriods,
  getListPeriodsQueryKey,
  getGetDashboardQueryKey,
} from "@/lib/api-client";
import { useBellStore } from "@/lib/bell-store";
import { DashboardTimetable, type DashboardTimetableHandle } from "@/components/dashboard-timetable";
import { isCapacitorAndroid } from "@/lib/capacitor-bell";
import { saveNativeImage, shareNativeImage, setTimetableWidgetImage } from "@/lib/native-bell-scheduler";

// ── Date / time helpers ──────────────────────────────────────────────────────

const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const ARABIC_DAYS_FULL = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function formatClock(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? "م" : "ص";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatArabicDate(d: Date) {
  return `${ARABIC_DAYS_FULL[d.getDay()]}، ${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTimeStr(t: string) {
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "م" : "ص";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function timeToSeconds(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 3600 + m * 60;
}

function dateToSeconds(d: Date) {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function formatCountdown(diffSec: number) {
  if (diffSec <= 0) return "00:00";
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Add to home screen helper ────────────────────────────────────────────────

let deferredPrompt: { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as any;
  });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetDashboard({
    query: { queryKey: getGetDashboardQueryKey(), refetchInterval: 30_000 },
  });
  const { settings } = useBellStore();
  const { toast } = useToast();
  const [now, setNow] = useState(new Date());
  const [exportBusy, setExportBusy] = useState(false);
  const [showWidgetTip, setShowWidgetTip] = useState(false);
  const timetableRef = useRef<DashboardTimetableHandle>(null);
  const widgetCaptureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tick every second
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const activeSchedule = dashboard?.activeSchedule;
  const scheduleId = activeSchedule?.id ?? 0;
  const activeDays: number[] = (() => {
    try {
      if (!activeSchedule) return [];
      const ad = activeSchedule.activeDays;
      if (typeof ad === "string") return JSON.parse(ad);
      return Array.isArray(ad) ? ad : [];
    } catch {
      return [];
    }
  })();

  const { data: _rawPeriods } = useListPeriods(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getListPeriodsQueryKey(scheduleId), refetchInterval: 30_000 },
  });
  const allPeriods = Array.isArray(_rawPeriods) ? _rawPeriods : [];

  // ── Compute current/next period from LOCAL device time ──────────────────
  // The API's currentPeriod is computed from server UTC time which differs
  // from the user's local timezone. We recompute here using allPeriods +
  // the local `now` tick so the result is always correct regardless of
  // where the server runs.
  const localTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayDow = now.getDay();
  const isTodayActive = activeDays.length === 0 || activeDays.includes(todayDow);

  type LocalPeriod = typeof allPeriods[number];
  const todayLocalPeriods: LocalPeriod[] = isTodayActive
    ? (allPeriods as LocalPeriod[]).filter(p => p.dayOfWeek === todayDow)
    : [];

  // Sorted copy for period-number calculation (1-based index by start time)
  const sortedTodayPeriods = [...todayLocalPeriods].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );
  const periodNumber = (p: LocalPeriod | null) =>
    p ? sortedTodayPeriods.findIndex(x => x.id === p.id) + 1 : null;

  const safeTodayPeriods: LocalPeriod[] = Array.isArray(todayLocalPeriods) ? todayLocalPeriods : [];

  // Raw slot covering current time — may be empty (no subject).
  const currentPeriod: LocalPeriod | null =
    safeTodayPeriods.find(p => p.startTime <= localTimeStr && p.endTime > localTimeStr) ?? null;

  // Current period only counts for display/countdown if it has a real subject.
  // An empty slot is treated as "no current period" in the UI.
  const currentPeriodWithSubject: LocalPeriod | null =
    currentPeriod?.subjectId != null ? currentPeriod : null;

  // Next period must have an actual subject assigned — skip empty slots.
  // This way, if periods 2-4 are empty, the countdown jumps straight to period 5.
  const nextPeriod: LocalPeriod | null =
    safeTodayPeriods.find(p => p.startTime > localTimeStr && p.subjectId != null) ?? null;

  // Bell scheduling is handled globally in GlobalBellRunner (App.tsx)

  // Seconds elapsed since midnight — derived from the same `now` tick used
  // for currentPeriod/nextPeriod so all time comparisons stay in sync.
  const nowSec = dateToSeconds(now);

  // Live countdown to end of current period — only when it has a subject.
  const remainingSec = currentPeriodWithSubject
    ? Math.max(0, timeToSeconds(currentPeriodWithSubject.endTime) - nowSec)
    : null;

  // Live countdown to start of next period
  const nextPeriodSec = nextPeriod
    ? Math.max(0, timeToSeconds(nextPeriod.startTime) - nowSec)
    : null;

  // ── Auto-capture timetable for home-screen widget ───────────────────────
  // Fires 2 s after data loads (or changes) so the DOM has fully rendered.
  // Only runs inside the Android APK; no-op in the browser.
  useEffect(() => {
    if (!isCapacitorAndroid()) return;
    if (!activeSchedule || allPeriods.length === 0) return;

    if (widgetCaptureTimer.current) clearTimeout(widgetCaptureTimer.current);
    widgetCaptureTimer.current = setTimeout(async () => {
      try {
        const el = timetableRef.current?.getGridElement();
        if (!el) return;
        const dataUrl = await toPng(el, {
          backgroundColor: "#ffffff",
          style: { transform: "none" },
          pixelRatio: 2,
          skipFonts: true,
          cacheBust: false,
        });
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        await setTimetableWidgetImage(base64);
      } catch (err) {
        console.warn("[widget] auto-capture failed:", err);
      }
    }, 2000);

    return () => {
      if (widgetCaptureTimer.current) clearTimeout(widgetCaptureTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSchedule?.id, allPeriods.length]);

  // ── Image export ────────────────────────────────────────────────────────

  /** Capture the timetable grid as a PNG data-URL.
   *  skipFonts avoids CORS errors with Google Fonts CDN.
   *
   *  We pass explicit width/height (the element's natural layout dimensions,
   *  which are NOT affected by CSS transforms) so html-to-image always creates
   *  a canvas that fits the full uncropped grid — even when scale < 1 in the
   *  Android WebView.
   */
  const captureGrid = useCallback(async (): Promise<Blob | null> => {
    const el = timetableRef.current?.getGridElement();
    if (!el) return null;

    // offsetWidth / scrollHeight return the *layout* (pre-transform) dimensions,
    // so the captured image is always full-size regardless of the visual scale.
    const naturalWidth  = el.offsetWidth;
    const naturalHeight = el.scrollHeight;

    const dataUrl = await toPng(el, {
      backgroundColor: "#ffffff",
      style: { transform: "none" },   // render clone at natural size, no scale
      pixelRatio: 2,
      skipFonts: true,                 // avoids CORS fetch of Tajawal from Google Fonts
      cacheBust: true,
      width:  naturalWidth,
      height: naturalHeight,
    });
    // Convert data URL → Blob without fetch().
    // fetch('data:...') is NOT supported in Android WebView (ERR_UNKNOWN_URL_SCHEME)
    // and would silently fail on the APK, breaking both save and share.
    const comma = dataUrl.indexOf(",");
    const base64 = dataUrl.slice(comma + 1);
    const bytes  = atob(base64);
    const arr    = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: "image/png" });
  }, []);

  /** Convert a Blob to a raw base64 string (no data-URL prefix). */
  async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(",")[1] ?? dataUrl);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /** Trigger a file download in the browser using a temporary anchor. */
  function triggerDownload(blob: Blob, fileName: string) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    }, 300);
  }

  const handleDownload = async () => {
    setExportBusy(true);
    try {
      const blob = await captureGrid();
      if (!blob) {
        toast({ title: "تعذّر إنشاء الصورة", description: "تأكد من وجود حصص في الجدول", variant: "destructive" });
        return;
      }
      const fileName = `جدول-${activeSchedule?.name ?? "الجدول"}.png`;

      if (isCapacitorAndroid()) {
        // Android APK — save directly to gallery via native MediaStore plugin
        const base64 = await blobToBase64(blob);
        await saveNativeImage(base64, fileName);
        // Silently update the timetable home-screen widget image
        void setTimetableWidgetImage(base64);
        toast({ title: "تم حفظ الصورة في المعرض ✓", description: "ستجدها في مجلد BellCraft في الصور" });
      } else {
        // Web browser — anchor download
        triggerDownload(blob, fileName);
        toast({ title: "تم حفظ الصورة ✓" });
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (!isAbort) {
        console.error("[export] download failed:", err);
        toast({
          title: "فشل التنزيل",
          description: String(err instanceof Error ? err.message : err),
          variant: "destructive",
        });
      }
    } finally {
      setExportBusy(false);
    }
  };

  const handleShare = async () => {
    setExportBusy(true);
    try {
      const blob = await captureGrid();
      if (!blob) {
        toast({ title: "تعذّر إنشاء الصورة", description: "تأكد من وجود حصص في الجدول", variant: "destructive" });
        return;
      }
      const fileName = `جدول-${activeSchedule?.name ?? "الجدول"}.png`;

      if (isCapacitorAndroid()) {
        // Android APK — native Intent.ACTION_SEND via FileProvider
        const base64 = await blobToBase64(blob);
        // Silently update the timetable home-screen widget image
        void setTimetableWidgetImage(base64);
        await shareNativeImage(base64, fileName);
      } else if (navigator.canShare?.({ files: [new File([blob], fileName, { type: "image/png" })] })) {
        // Web on mobile (iOS Safari, Chrome Android) — Web Share API
        await navigator.share({ files: [new File([blob], fileName, { type: "image/png" })], title: fileName });
      } else {
        // Desktop browser — fall back to download
        triggerDownload(blob, fileName);
        toast({ title: "تم حفظ الصورة ✓", description: "المشاركة غير مدعومة، تم التنزيل بدلاً منها" });
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (!isAbort) {
        console.error("[export] share failed:", err);
        toast({ title: "فشلت المشاركة", description: String(err), variant: "destructive" });
      }
    } finally {
      setExportBusy(false);
    }
  };

  const handleWidget = async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") deferredPrompt = null;
      } catch {
        deferredPrompt = null;
      }
    } else {
      setShowWidgetTip(true);
    }
  };

  // ── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded-xl animate-pulse" />
        <div className="h-28 bg-slate-200 rounded-3xl animate-pulse" />
        <div className="h-24 bg-slate-200 rounded-2xl animate-pulse" />
        <div className="h-40 bg-slate-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  // ── Vacation mode ────────────────────────────────────────────────────────
  if (settings.vacationMode) {
    return (
      <div className="space-y-5 pb-4" dir="rtl">
        {/* Date header */}
        <DateHeader now={now} />

        {/* Vacation card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl p-8 text-center"
          style={{ background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)" }}
        >
          <div className="text-5xl mb-4">🌸</div>
          <h2 className="text-2xl font-extrabold text-amber-900 mb-2">إجازة سعيدة</h2>
          <p className="text-amber-800 font-semibold leading-relaxed">
            نتمنى لكم إجازة مليئة بالراحة والسعادة
          </p>
          <div className="mt-5 text-4xl">🌸</div>
        </motion.div>

        <div className="flex items-center gap-2 rounded-2xl p-3.5 bg-amber-50 border border-amber-200">
          <Palmtree className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-bold">وضع العطلة مُفعّل — الجرس والتنبيهات متوقفة</p>
        </div>
      </div>
    );
  }

  // ── Main dashboard ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-4" dir="rtl">
      {/* Date header */}
      <DateHeader now={now} />


      {/* Active schedule name badge */}
      {activeSchedule && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-1"
          dir="rtl"
        >
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
            <Bell className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="text-sm font-extrabold text-blue-800 leading-none">
              {activeSchedule.name}
            </span>
          </span>
        </motion.div>
      )}

      {/* No active schedule */}
      {!activeSchedule ? (
        <div className="rounded-2xl p-6 bg-white border border-slate-200 card-shadow text-center">
          <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-600 font-semibold mb-3">لا يوجد جدول نشط</p>
          <Link href="/schedules">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-700 text-white font-bold text-sm tap">
              <Plus className="w-4 h-4" /> إدارة الجداول
            </button>
          </Link>
        </div>
      ) : (
        <>
          {/* Schedule name + countdown */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl p-5 text-white relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #1d4ed8 100%)" }}
          >
            <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
            <div className="relative">
              {/* Schedule name */}
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-4 h-4 text-blue-300" />
                <span className="text-blue-200 text-xs font-bold">الجدول النشط</span>
              </div>
              <p className="text-lg font-extrabold text-white mb-4 leading-tight">
                {activeSchedule.name}
              </p>

              {/* ── Current period (only shown when it has a real subject) ── */}
              {currentPeriodWithSubject ? (
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-blue-200 text-xs font-bold mb-1.5 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bc-pulse shrink-0" />
                      الحصة الحالية
                      {periodNumber(currentPeriodWithSubject) && (
                        <span className="bg-white/20 text-white text-[10px] font-extrabold rounded-full px-1.5 py-0.5 leading-none">
                          #{periodNumber(currentPeriodWithSubject)}
                        </span>
                      )}
                    </p>
                    <p className="text-3xl font-extrabold text-white leading-tight mb-0.5">
                      {currentPeriodWithSubject.label ?? currentPeriodWithSubject.subjectName ?? "الحصة الحالية"}
                    </p>
                    {currentPeriodWithSubject.subjectName && currentPeriodWithSubject.label && (
                      <p className="text-sm font-bold text-blue-100 mb-2 leading-snug">
                        {currentPeriodWithSubject.subjectName}
                      </p>
                    )}
                    <div className="text-4xl font-extrabold tabular-nums tracking-tight text-white mt-2">
                      {remainingSec !== null ? formatCountdown(remainingSec) : "--:--"}
                    </div>
                    <p className="text-blue-300 text-[11px] mt-0.5">الوقت المتبقي في الحصة</p>
                  </div>
                  {currentPeriodWithSubject.subjectColor && (
                    <div
                      className="w-12 h-12 rounded-2xl shadow-lg shrink-0 mt-1"
                      style={{ backgroundColor: currentPeriodWithSubject.subjectColor }}
                    />
                  )}
                </div>
              ) : (
                /* ── No current period with subject (empty slot or no slot) ── */
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-blue-400/60 shrink-0" />
                  <p className="text-blue-200 font-bold text-base">لا توجد حصة الآن</p>
                </div>
              )}

              {/* ── Next period with subject / end-of-day message ──────── */}
              {nextPeriod ? (
                <div className={currentPeriodWithSubject ? "border-t border-blue-500/40 pt-4" : ""}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-blue-200 text-xs font-bold mb-1.5 flex items-center gap-1.5">
                        الحصة القادمة
                        {periodNumber(nextPeriod) && (
                          <span className="bg-white/20 text-white text-[10px] font-extrabold rounded-full px-1.5 py-0.5 leading-none">
                            #{periodNumber(nextPeriod)}
                          </span>
                        )}
                      </p>
                      <p className="text-3xl font-extrabold text-white leading-tight mb-0.5">
                        {nextPeriod.label ?? nextPeriod.subjectName ?? "الحصة القادمة"}
                      </p>
                      {nextPeriod.subjectName && nextPeriod.label && (
                        <p className="text-sm font-bold text-blue-100 mb-2 leading-snug">
                          {nextPeriod.subjectName}
                        </p>
                      )}
                      <div className="text-4xl font-extrabold tabular-nums tracking-tight text-white mt-2">
                        {nextPeriodSec !== null ? formatCountdown(nextPeriodSec) : "--:--"}
                      </div>
                      <p className="text-blue-300 text-[11px] mt-0.5">حتى بداية الحصة</p>
                    </div>
                    {nextPeriod.subjectColor && (
                      <div
                        className="w-12 h-12 rounded-2xl shadow-lg shrink-0 opacity-70 mt-1"
                        style={{ backgroundColor: nextPeriod.subjectColor }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className={`flex items-center gap-2 ${currentPeriodWithSubject ? "border-t border-blue-500/40 pt-4 mt-0" : ""}`}>
                  <div className="w-2 h-2 rounded-full bg-blue-400/40 shrink-0" />
                  <p className="text-blue-300 font-bold text-sm">لا توجد حصة قادمة اليوم</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* ── Today's schedule table ──────────────────────────────── */}
          {sortedTodayPeriods.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.07 }}
              className="rounded-2xl overflow-hidden border border-slate-200 bg-white card-shadow"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-slate-800">جدول اليوم</span>
                  <span className="text-xs font-bold text-slate-500">
                    — {ARABIC_DAYS_FULL[todayDow]}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">
                  {sortedTodayPeriods.filter(p => p.subjectId != null).length} حصة
                </span>
              </div>

              {/* Column headers */}
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100">
                <span className="w-6 shrink-0" />
                <span className="w-32 shrink-0 text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">
                  الوقت
                </span>
                <span className="flex-1 text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">
                  المادة
                </span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100">
                {sortedTodayPeriods.map((p, i) => {
                  const isCurrent = p.id === currentPeriod?.id;
                  const isPast = p.endTime <= localTimeStr;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        isCurrent
                          ? "bg-blue-50"
                          : isPast
                          ? "opacity-40"
                          : ""
                      }`}
                    >
                      {/* Period index */}
                      <span
                        className={`w-6 h-6 rounded-full text-[11px] font-extrabold flex items-center justify-center shrink-0 ${
                          isCurrent
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {i + 1}
                      </span>

                      {/* Time column */}
                      <div className="w-32 shrink-0">
                        <p className="text-xs font-bold text-slate-700 tabular-nums leading-tight">
                          {formatTimeStr(p.startTime)}
                        </p>
                        <p className="text-[10px] text-slate-400 tabular-nums leading-tight">
                          {formatTimeStr(p.endTime)}
                        </p>
                      </div>

                      {/* Subject column */}
                      <div className="flex-1 flex items-start gap-2">
                        {p.subjectColor && p.subjectId != null && (
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                            style={{ backgroundColor: p.subjectColor }}
                          />
                        )}
                        <span
                          className={`text-sm font-bold leading-snug break-words ${
                            p.subjectId != null ? "text-slate-800" : "text-slate-300"
                          }`}
                        >
                          {p.subjectName ?? p.label ?? "—"}
                        </span>
                        {isCurrent && (
                          <span className="shrink-0 text-[10px] font-extrabold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full leading-none">
                            الآن
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Full timetable */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl overflow-hidden border border-slate-200 bg-white card-shadow"
          >
            {/* Timetable title */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-extrabold text-slate-800">جدول الحصص الأسبوعي</span>
              <CalendarDays className="w-4 h-4 text-blue-600" />
            </div>

            <div className="px-3 py-3">
              {allPeriods.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  لم يتم إعداد الجدول بعد
                </div>
              ) : (
                <DashboardTimetable
                  ref={timetableRef}
                  activeDays={activeDays}
                  allPeriods={allPeriods}
                  currentPeriodId={currentPeriod?.id}
                />
              )}
            </div>
          </motion.div>

          {/* Widget button — always visible with active schedule */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <button
              onClick={handleWidget}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-blue-700 text-white card-shadow tap"
            >
              <Smartphone className="w-5 h-5 text-blue-200" />
              <span className="text-sm font-extrabold">إضافة ودجت للشاشة الرئيسية</span>
            </button>
          </motion.div>

          {/* Action buttons (export — only when periods exist) */}
          {allPeriods.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="grid grid-cols-2 gap-2"
            >
              <button
                onClick={handleDownload}
                disabled={exportBusy}
                className="flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white border border-slate-200 card-shadow tap disabled:opacity-60"
              >
                <Download className="w-5 h-5 text-blue-700" />
                <span className="text-[11px] font-bold text-slate-700">تنزيل</span>
              </button>
              <button
                onClick={handleShare}
                disabled={exportBusy}
                className="flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white border border-slate-200 card-shadow tap disabled:opacity-60"
              >
                <Share2 className="w-5 h-5 text-blue-700" />
                <span className="text-[11px] font-bold text-slate-700">مشاركة</span>
              </button>
            </motion.div>
          )}
        </>
      )}

      {/* Widget tip modal */}
      <AnimatePresence>
        {showWidgetTip && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-50"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowWidgetTip(false)}
            />
            <motion.div
              className="fixed inset-x-5 bottom-8 z-50 bg-white rounded-3xl p-6 shadow-2xl"
              initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-extrabold text-slate-800 text-base">
                  {isCapacitorAndroid() ? "إضافة الودجت للشاشة الرئيسية" : "إضافة للشاشة الرئيسية"}
                </h3>
                <button onClick={() => setShowWidgetTip(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center tap">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              {isCapacitorAndroid() ? (
                /* ── داخل الـ APK: تعليمات الودجت الأصلي ── */
                <div className="space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4">
                    <p className="font-bold text-blue-900 mb-3">🟦 خطوات إضافة الودجت</p>
                    <ol className="space-y-2 text-blue-800 text-[13px]">
                      <li><span className="font-bold">١.</span> اضغط مطوّلاً على مكان فارغ في <span className="font-bold">سطح المكتب</span></li>
                      <li><span className="font-bold">٢.</span> اختر <span className="font-bold">الودجات</span> أو <span className="font-bold">Widgets</span></li>
                      <li><span className="font-bold">٣.</span> ابحث عن <span className="font-bold">BellCraft</span> واسحبه إلى الشاشة</li>
                      <li><span className="font-bold">٤.</span> اختر الحجم المناسب (صغير / متوسط / كبير)</li>
                    </ol>
                  </div>
                  <p className="text-[11px] text-slate-400 text-center">يتحدّث الودجت تلقائيًا كل دقيقة</p>
                </div>
              ) : /android/i.test(navigator.userAgent) ? (
                /* ── متصفح أندرويد: الودجت يتطلب تثبيت الـ APK ── */
                <div className="space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
                    <p className="font-bold text-amber-900 mb-2">🤖 الودجت يعمل فقط داخل التطبيق</p>
                    <p className="text-amber-800 text-[13px] leading-relaxed">
                      الودجت الحقيقي الذي يظهر على شاشتك الرئيسية ويتحدّث كل دقيقة
                      يحتاج إلى <span className="font-bold">تثبيت تطبيق BellCraft</span> كملف APK — وليس نسخة المتصفح.
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-[13px] text-slate-700">
                    <p className="font-bold text-slate-800">بعد تثبيت الـ APK:</p>
                    <ol className="space-y-1 text-slate-600">
                      <li><span className="font-bold">١.</span> اضغط مطوّلاً على سطح المكتب</li>
                      <li><span className="font-bold">٢.</span> اختر <span className="font-bold">الودجات / Widgets</span></li>
                      <li><span className="font-bold">٣.</span> ابحث عن <span className="font-bold">BellCraft</span> واسحبه</li>
                    </ol>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Date header sub-component ────────────────────────────────────────────────
function DateHeader({ now }: { now: Date }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between"
      dir="rtl"
    >
      <div>
        <p className="text-base font-extrabold text-slate-900 leading-tight">
          {formatArabicDate(now)}
        </p>
      </div>
      <div
        className="shrink-0 rounded-2xl flex items-center px-4 py-2 gap-2"
        style={{ background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)" }}
      >
        <Bell className="w-4 h-4 text-white" strokeWidth={2.5} />
        <span className="text-white font-extrabold text-base tabular-nums">
          {formatClock(now)}
        </span>
      </div>
    </motion.div>
  );
}
