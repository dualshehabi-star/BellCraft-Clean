import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { Coffee, CalendarDays } from "lucide-react";
import { ARABIC_DAYS, formatTime } from "@/lib/constants";

type Period = {
  id: number;
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

function diffMinutes(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

type Col =
  | { kind: "period"; index: number; period: Period }
  | { kind: "break"; label: string; startTime: string; endTime: string };

export interface DashboardTimetableHandle {
  getGridElement: () => HTMLDivElement | null;
}

interface Props {
  activeDays: number[];
  allPeriods: Period[];
  currentPeriodId?: number | null;
}

const DashboardTimetable = forwardRef<DashboardTimetableHandle, Props>(
  ({ activeDays: _activeDays, allPeriods: _allPeriods, currentPeriodId }, ref) => {
    const activeDays = Array.isArray(_activeDays) ? _activeDays : [];
    const allPeriods = Array.isArray(_allPeriods) ? _allPeriods : [];
    const containerRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useImperativeHandle(ref, () => ({
      getGridElement: () => gridRef.current,
    }));

    // ── Build per-day sorted period lists ─────────────────────────────────
    const byDay: Record<number, Period[]> = {};
    for (const p of allPeriods) {
      if (!byDay[p.dayOfWeek]) byDay[p.dayOfWeek] = [];
      byDay[p.dayOfWeek].push(p);
    }
    for (const key of Object.keys(byDay)) {
      byDay[Number(key)].sort((a, b) => a.startTime.localeCompare(b.startTime));
    }

    // ── Build columns from primary day ────────────────────────────────────
    // When activeDays is empty (schedule has no days configured yet),
    // fall back to any days that actually have periods rather than showing nothing.
    const effectiveDays = activeDays.length > 0
      ? activeDays
      : Object.keys(byDay).map(Number).sort((a, b) => a - b);
    const daysWithPeriods = effectiveDays.filter(d => byDay[d]?.length);
    const primaryDay = daysWithPeriods.length ? Math.min(...daysWithPeriods) : null;

    const columns: Col[] = [];
    let periodIndex = 0;
    if (primaryDay !== null) {
      for (const p of byDay[primaryDay] ?? []) {
        if (isBreak(p.label)) {
          columns.push({ kind: "break", label: p.label ?? "فسحة", startTime: p.startTime, endTime: p.endTime });
        } else {
          columns.push({ kind: "period", index: periodIndex++, period: p });
        }
      }
    }

    const periodCols = columns.filter(c => c.kind === "period");
    if (periodCols.length === 0) return null;

    // Column widths (pre-scale natural sizes)
    const COL_W = 86;
    const BRK_W = 36;
    const DAY_W = 62;
    const totalW = DAY_W + columns.reduce((s, c) => s + (c.kind === "break" ? BRK_W : COL_W), 0);

    // Auto-scale to fit container
    useEffect(() => {
      const update = () => {
        const cont = containerRef.current;
        if (!cont) return;
        const availW = cont.offsetWidth;
        if (availW > 0 && totalW > availW) {
          setScale(availW / totalW);
        } else {
          setScale(1);
        }
      };
      update();
      const ro = new ResizeObserver(update);
      if (containerRef.current) ro.observe(containerRef.current);
      return () => ro.disconnect();
    }, [totalW]);

    const scaledH = gridRef.current ? gridRef.current.scrollHeight * scale : "auto";

    return (
      <div ref={containerRef} style={{ overflow: "hidden", height: scaledH, border: "1px solid #000", borderRadius: 8 }} dir="rtl">
        <div
          ref={gridRef}
          style={{
            width: totalW,
            transformOrigin: "top right",
            transform: `scale(${scale})`,
          }}
        >
          {/* Header row */}
          <div className="flex" style={{ background: "linear-gradient(to bottom, #1d4ed8, #1e3a8a)" }}>
            {/* Corner */}
            <div
              className="sticky right-0 shrink-0 flex items-center justify-center border-s border-black"
              style={{ width: DAY_W }}
            >
              <CalendarDays style={{ width: 14, height: 14, color: "#93c5fd" }} />
            </div>
            {columns.map((col, ci) => {
              if (col.kind === "break") {
                return (
                  <div
                    key={`bh-${ci}`}
                    className="shrink-0 flex flex-col items-center justify-center gap-0.5 border-e border-black"
                    style={{ width: BRK_W, paddingTop: 6, paddingBottom: 6, background: "rgba(245,158,11,0.25)" }}
                  >
                    <Coffee style={{ width: 10, height: 10, color: "#fcd34d" }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#fde68a", lineHeight: 1 }}>
                      {diffMinutes(col.startTime, col.endTime)}د
                    </span>
                  </div>
                );
              }
              return (
                <div
                  key={`ph-${col.index}`}
                  className="shrink-0 flex flex-col items-center gap-0.5 border-e border-black last:border-e-0"
                  style={{ width: COL_W, paddingTop: 7, paddingBottom: 7, paddingLeft: 2, paddingRight: 2 }}
                >
                  <span
                    className="rounded-full flex items-center justify-center"
                    style={{ width: 22, height: 22, background: "rgba(255,255,255,0.2)", color: "white", fontSize: 12, fontWeight: 800 }}
                  >
                    {col.index + 1}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "white", fontVariantNumeric: "tabular-nums" }}>
                    {formatTime(col.period.startTime)}
                  </span>
                  <span style={{ fontSize: 10, color: "#bfdbfe", fontVariantNumeric: "tabular-nums" }}>
                    {formatTime(col.period.endTime)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Day rows */}
          {effectiveDays.map((day, rowIdx) => {
            const dayPeriods = (byDay[day] ?? []).filter(p => !isBreak(p.label));
            const isOdd = rowIdx % 2 !== 0;
            const rowBg = isOdd ? "#f8fafc" : "#ffffff";
            return (
              <div
                key={day}
                className="flex"
                style={{ background: rowBg, borderBottom: "1px solid #000" }}
              >
                {/* Day name */}
                <div
                  className="shrink-0 flex items-center justify-center border-s border-black"
                  style={{ width: DAY_W, paddingTop: 10, paddingBottom: 10 }}
                >
                  <span
                    style={{ fontSize: 13, fontWeight: 800, color: "#334155", textAlign: "center", lineHeight: 1.2 }}
                  >
                    {ARABIC_DAYS[day]}
                  </span>
                </div>

                {columns.map((col, ci) => {
                  if (col.kind === "break") {
                    return (
                      <div
                        key={`bc-${ci}`}
                        className="shrink-0 border-e border-black"
                        style={{
                          width: BRK_W,
                          height: 44,
                          background: "repeating-linear-gradient(135deg,transparent,transparent 4px,rgba(253,230,138,0.2) 4px,rgba(253,230,138,0.2) 8px)",
                        }}
                      />
                    );
                  }
                  const period = dayPeriods[col.index];
                  const hasSubject = !!(period?.subjectName);
                  const isCurrent = period?.id === currentPeriodId;
                  return (
                    <div
                      key={`pc-${col.index}`}
                      className="shrink-0 flex items-center justify-center border-e border-black last:border-e-0"
                      style={{
                        width: COL_W,
                        height: 44,
                        backgroundColor: hasSubject && period?.subjectColor
                          ? period.subjectColor
                          : isCurrent
                          ? "#eff6ff"
                          : undefined,
                        outline: isCurrent ? "2px solid #3b82f6" : undefined,
                        outlineOffset: -2,
                      }}
                    >
                      {hasSubject ? (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: "white",
                            textAlign: "center",
                            lineHeight: 1.3,
                            padding: "0 3px",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {period.subjectName}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

DashboardTimetable.displayName = "DashboardTimetable";
export { DashboardTimetable };
