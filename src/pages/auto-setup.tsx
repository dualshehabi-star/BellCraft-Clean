import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
import { ArrowRight, Zap, CheckCircle2, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSchedule,
  getGetScheduleQueryKey,
  useClearSchedulePeriods,
  useCreatePeriod,
  useUpdatePeriod,
  useListPeriods,
  getListPeriodsQueryKey,
  getGetDashboardQueryKey,
} from "@/lib/api-client";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ARABIC_DAYS } from "@/lib/constants";
import { NativeTimePicker } from "@/components/time-drum-picker";

// ─── helpers ────────────────────────────────────────────────────────────────
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(n: number) {
  const h = Math.floor(n / 60) % 24;
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface AutoConfig {
  periodCount: number;
  periodDuration: number;
  startTime: string;
  break1Duration: number;
  break1AfterPeriod: number;
  break2Duration: number;
  break2AfterPeriod: number;
}

interface Slot {
  type: "period" | "break";
  index?: number;
  label: string;
  startTime: string;
  endTime: string;
}

function calcSlots(cfg: AutoConfig): Slot[] {
  const slots: Slot[] = [];
  let cursor = timeToMinutes(cfg.startTime);
  for (let i = 1; i <= cfg.periodCount; i++) {
    const end = cursor + cfg.periodDuration;
    slots.push({ type: "period", index: i, label: `الحصة ${i}`, startTime: minutesToTime(cursor), endTime: minutesToTime(end) });
    cursor = end;
    if (cfg.break1Duration > 0 && i === cfg.break1AfterPeriod) {
      const bEnd = cursor + cfg.break1Duration;
      slots.push({ type: "break", label: "الفسحة الأولى", startTime: minutesToTime(cursor), endTime: minutesToTime(bEnd) });
      cursor = bEnd;
    }
    if (cfg.break2Duration > 0 && i === cfg.break2AfterPeriod) {
      const bEnd = cursor + cfg.break2Duration;
      slots.push({ type: "break", label: "الفسحة الثانية", startTime: minutesToTime(cursor), endTime: minutesToTime(bEnd) });
      cursor = bEnd;
    }
  }
  return slots;
}

const DEFAULT_CFG: AutoConfig = {
  periodCount: 6,
  periodDuration: 45,
  startTime: "07:30",
  break1Duration: 15,
  break1AfterPeriod: 3,
  break2Duration: 0,
  break2AfterPeriod: 5,
};

const PERIOD_DURATIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const BREAK_DURATIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45];

// ─── native select (no Radix portals) ────────────────────────────────────────
function NativeSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      dir="rtl"
      style={{
        height: "36px",
        width: "112px",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        backgroundColor: "#fff",
        paddingRight: "12px",
        paddingLeft: "12px",
        fontSize: "14px",
        fontFamily: "inherit",
        color: "#1e293b",
        outline: "none",
        WebkitAppearance: "auto" as React.CSSProperties["WebkitAppearance"],
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ─── component ──────────────────────────────────────────────────────────────
export default function AutoSetup() {
  const { id: idStr } = useParams();
  const scheduleId = parseInt(idStr || "0", 10);
  const queryClient = useQueryClient();

  const { data: schedule, isLoading } = useGetSchedule(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getGetScheduleQueryKey(scheduleId) },
  });
  const { data: existingPeriods = [], isLoading: loadingPeriods } = useListPeriods(scheduleId, {
    query: { enabled: !!scheduleId, queryKey: getListPeriodsQueryKey(scheduleId) },
  });

  const clearPeriods = useClearSchedulePeriods();
  const createPeriod = useCreatePeriod();
  const updatePeriod = useUpdatePeriod();

  // Always-current snapshot so saveToApi (useCallback) can safely read it
  const existingPeriodsRef = useRef<typeof existingPeriods>([]);
  useEffect(() => { existingPeriodsRef.current = existingPeriods; }, [existingPeriods]);

  const storageKey = `autoSetup_${scheduleId}`;

  const [cfg, setCfg] = useState<AutoConfig>(() => {
    try {
      const saved = localStorage.getItem(`autoSetup_${scheduleId}`);
      if (saved) return { ...DEFAULT_CFG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_CFG;
  });

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // Rehydrate cfg from localStorage when scheduleId changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`autoSetup_${scheduleId}`);
      if (saved) setCfg({ ...DEFAULT_CFG, ...JSON.parse(saved) });
    } catch {}
  }, [scheduleId]);

  // Never fall back to a hardcoded Sun–Thu list — use the user's own activeDays.
  const activeDays: number[] = schedule?.activeDays?.length
    ? schedule.activeDays
    : [0, 1, 2, 3, 4, 5, 6];

  const saveToApi = useCallback(async (config: AutoConfig, days: number[]) => {
    setSaveStatus("saving");
    try {
      const current = existingPeriodsRef.current;

      // Step 1: Capture subject assignments by (dayOfWeek, slotIndex) before clearing
      // slotIndex = position within that day's sorted period list
      const subjectBySlot: Record<string, number> = {};
      if (current.length > 0) {
        const byDay: Record<number, typeof current> = {};
        for (const p of current) {
          if (!byDay[p.dayOfWeek]) byDay[p.dayOfWeek] = [];
          byDay[p.dayOfWeek].push(p);
        }
        for (const [dayStr, dayPeriods] of Object.entries(byDay)) {
          const sorted = [...dayPeriods].sort((a, b) => a.startTime.localeCompare(b.startTime));
          sorted.forEach((p, i) => {
            if (p.subjectId != null) subjectBySlot[`${dayStr}_${i}`] = p.subjectId;
          });
        }
      }

      // Step 2: Clear all periods
      await clearPeriods.mutateAsync({ scheduleId });

      // Step 3: Create new periods, capturing new period IDs by (day, slotIndex)
      const newSlots = calcSlots(config);
      const newIdBySlot: Record<string, number> = {};
      const creates: Promise<void>[] = [];
      for (const day of days) {
        for (let i = 0; i < newSlots.length; i++) {
          const slot = newSlots[i];
          const key = `${day}_${i}`;
          creates.push(
            createPeriod.mutateAsync({
              scheduleId,
              data: {
                dayOfWeek: day,
                startTime: slot.startTime,
                endTime: slot.endTime,
                label: slot.type === "break" ? slot.label : undefined,
                alertMinutesBefore: slot.type === "period" ? 5 : 0,
              },
            }).then((p) => { newIdBySlot[key] = p.id; })
          );
        }
      }
      await Promise.all(creates);

      // Step 4: Restore subjects for matching slot positions
      const restores: Promise<unknown>[] = [];
      for (const [slotKey, subjectId] of Object.entries(subjectBySlot)) {
        const newId = newIdBySlot[slotKey];
        if (newId != null) {
          restores.push(updatePeriod.mutateAsync({ id: newId, data: { subjectId } }));
        }
      }
      if (restores.length > 0) await Promise.all(restores);

      await queryClient.invalidateQueries({ queryKey: getListPeriodsQueryKey(scheduleId) });
      await queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      if (isMounted.current) setSaveStatus("saved");
    } catch {
      if (isMounted.current) setSaveStatus("idle");
    }
  }, [scheduleId, clearPeriods, createPeriod, updatePeriod, queryClient]);

  // Auto-init: if schedule loaded and no periods exist yet, apply config immediately
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!schedule || isLoading || loadingPeriods) return;
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    if (existingPeriods.length === 0) {
      const days: number[] = schedule.activeDays?.length ? schedule.activeDays : [0, 1, 2, 3, 4, 5, 6];
      saveToApi(cfg, days);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.id, isLoading, loadingPeriods, existingPeriods.length]);

  const update = (patch: Partial<AutoConfig>) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveStatus("idle");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveToApi(next, activeDays);
      }, 900);
      return next;
    });
  };

  // Clamp break after period options
  const break1Options = Array.from({ length: cfg.periodCount - 1 }, (_, i) => i + 1);
  const break2Options = Array.from({ length: cfg.periodCount - 1 }, (_, i) => i + 1).filter(n => n !== cfg.break1AfterPeriod);

  if (isLoading) {
    return (
      <div className="space-y-4" dir="rtl">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/schedules/${scheduleId}`}>
          <button className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors">
            <ArrowRight className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">الضبط التلقائي للحصص</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{schedule?.name}</p>
        </div>
        <div className="mr-auto">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              جاري الحفظ...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              تم الحفظ
            </span>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="bg-card rounded-2xl border border-border shadow-sm divide-y divide-border">
        {/* Period count */}
        <SettingRow label="عدد الحصص" sub="الحد الأقصى ١٠ حصص">
          <NativeSelect
            value={String(cfg.periodCount)}
            onChange={(v) => update({ periodCount: Number(v) })}
            options={Array.from({ length: 10 }, (_, i) => ({
              value: String(i + 1),
              label: `${i + 1} حصص`,
            }))}
          />
        </SettingRow>

        {/* Period duration */}
        <SettingRow label="مدة الحصة" sub="الحد الأقصى ٦٠ دقيقة">
          <NativeSelect
            value={String(cfg.periodDuration)}
            onChange={(v) => update({ periodDuration: Number(v) })}
            options={PERIOD_DURATIONS.map((n) => ({ value: String(n), label: `${n} دقيقة` }))}
          />
        </SettingRow>

        {/* Start time */}
        <SettingRow label="وقت بداية الحصة الأولى" sub="حسب توقيت الجهاز">
          <NativeTimePicker value={cfg.startTime} onChange={v => update({ startTime: v })} />
        </SettingRow>

        {/* Break 1 duration */}
        <SettingRow label="مدة الفسحة الأولى" sub="الحد الأقصى ٤٥ دقيقة • ٠ = لا فسحة">
          <NativeSelect
            value={String(cfg.break1Duration)}
            onChange={(v) => update({ break1Duration: Number(v) })}
            options={BREAK_DURATIONS.map((n) => ({
              value: String(n),
              label: n === 0 ? "لا فسحة" : `${n} دقيقة`,
            }))}
          />
        </SettingRow>

        {/* Break 1 after period */}
        {cfg.break1Duration > 0 && (
          <SettingRow label="الفسحة الأولى بعد الحصة" sub="">
            <NativeSelect
              value={String(cfg.break1AfterPeriod)}
              onChange={(v) => update({ break1AfterPeriod: Number(v) })}
              options={break1Options.map((n) => ({ value: String(n), label: `الحصة ${n}` }))}
            />
          </SettingRow>
        )}

        {/* Break 2 duration */}
        <SettingRow label="مدة الفسحة الثانية" sub="الحد الأقصى ٤٥ دقيقة • ٠ = لا فسحة">
          <NativeSelect
            value={String(cfg.break2Duration)}
            onChange={(v) => update({ break2Duration: Number(v) })}
            options={BREAK_DURATIONS.map((n) => ({
              value: String(n),
              label: n === 0 ? "لا فسحة" : `${n} دقيقة`,
            }))}
          />
        </SettingRow>

        {/* Break 2 after period */}
        {cfg.break2Duration > 0 && (
          <SettingRow label="الفسحة الثانية بعد الحصة" sub="">
            <NativeSelect
              value={String(cfg.break2AfterPeriod)}
              onChange={(v) => update({ break2AfterPeriod: Number(v) })}
              options={break2Options.map((n) => ({ value: String(n), label: `الحصة ${n}` }))}
            />
          </SettingRow>
        )}
      </div>

    </div>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
