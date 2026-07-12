import { useState, useEffect, useRef, useCallback } from "react";

// ─── constants ────────────────────────────────────────────────────────────────
const ITEM_H = 44;
const VISIBLE = 5;
const DRUM_H = ITEM_H * VISIBLE; // 220px
const PAD = ITEM_H * Math.floor(VISIBLE / 2); // 88px

// ─── helpers ──────────────────────────────────────────────────────────────────
function to12h(time24: string): { hour: number; minute: number; ampm: "am" | "pm" } {
  const parts = (time24 || "08:00").split(":");
  const h = parseInt(parts[0] ?? "8", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const ampm: "am" | "pm" = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return { hour, minute: m, ampm };
}

function to24h(hour: number, minute: number, ampm: "am" | "pm"): string {
  let h = hour % 12;
  if (ampm === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const HOUR_VALUES = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTE_VALUES = Array.from({ length: 60 }, (_, i) => i);

// ─── TimeDrum ─────────────────────────────────────────────────────────────────
function TimeDrum({
  values,
  value,
  onChange,
  label,
  min,
  max,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  label: string;
  min: number;
  max: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrolling = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const idx = Math.max(0, values.indexOf(value));

  const snapTo = useCallback((i: number, smooth = true) => {
    scrollRef.current?.scrollTo({
      top: i * ITEM_H,
      behavior: smooth ? "smooth" : "instant",
    });
  }, []);

  useEffect(() => {
    snapTo(idx, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userScrolling.current) snapTo(idx);
  }, [idx, snapTo]);

  const onScroll = useCallback(() => {
    userScrolling.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      userScrolling.current = false;
      const el = scrollRef.current;
      if (!el) return;
      const snapped = Math.max(0, Math.min(Math.round(el.scrollTop / ITEM_H), values.length - 1));
      snapTo(snapped);
      onChange(values[snapped]);
    }, 120);
  }, [values, onChange, snapTo]);

  const handleItemClick = (v: number, i: number) => {
    if (v === value) {
      setDraft(label === "س" ? String(v) : String(v).padStart(2, "0"));
      setEditing(true);
    } else {
      snapTo(i);
      onChange(v);
    }
  };

  const commitEdit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= min && n <= max) {
      const newIdx = values.indexOf(n);
      if (newIdx >= 0) {
        onChange(n);
        snapTo(newIdx);
      }
    }
    setEditing(false);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-extrabold tracking-widest text-slate-400">{label}</span>
      <div className="relative" style={{ width: 52, height: DRUM_H }}>
        {/* center highlight */}
        <div
          className="absolute inset-x-1 rounded-xl border border-blue-200 bg-blue-50/80 pointer-events-none z-10"
          style={{ top: PAD, height: ITEM_H }}
        />
        {/* gradient fade mask */}
        <div
          className="absolute inset-0 pointer-events-none z-20"
          style={{
            background:
              "linear-gradient(to bottom, white 0%, transparent 28%, transparent 72%, white 100%)",
          }}
        />
        {/* scrollable drum */}
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-scroll no-scrollbar z-30"
          style={{ scrollSnapType: "y mandatory" }}
          onScroll={onScroll}
        >
          <div style={{ height: PAD }} aria-hidden="true" />
          {values.map((v, i) => (
            <div
              key={v}
              className="flex items-center justify-center select-none cursor-pointer transition-all"
              style={{
                height: ITEM_H,
                scrollSnapAlign: "center",
                color: v === value ? "#1d4ed8" : "#94a3b8",
                fontWeight: v === value ? 800 : 500,
                fontSize: v === value ? "1.2rem" : "0.9rem",
                transform: v === value ? "scale(1)" : "scale(0.82)",
              }}
              onClick={() => handleItemClick(v, i)}
            >
              {String(v).padStart(2, "0")}
            </div>
          ))}
          <div style={{ height: PAD }} aria-hidden="true" />
        </div>

        {/* keyboard edit overlay */}
        {editing && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/95 rounded-xl border-2 border-blue-500 shadow-xl">
            <input
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full text-center text-2xl font-extrabold text-blue-700 bg-transparent border-none outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NativeTimePicker (exported) ──────────────────────────────────────────────
export interface NativeTimePickerProps {
  value: string; // "HH:mm" 24-hour
  onChange: (v: string) => void;
}

export function NativeTimePicker({ value, onChange }: NativeTimePickerProps) {
  const { hour, minute, ampm } = to12h(value || "08:00");

  const set = (patch: Partial<{ hour: number; minute: number; ampm: "am" | "pm" }>) => {
    const next = { hour, minute, ampm, ...patch };
    onChange(to24h(next.hour, next.minute, next.ampm));
  };

  return (
    <div className="flex items-center gap-1" dir="ltr">
      <TimeDrum
        values={HOUR_VALUES}
        value={hour}
        onChange={(h) => set({ hour: h })}
        label="س"
        min={1}
        max={12}
      />
      <span
        className="font-extrabold text-slate-300 self-center"
        style={{ fontSize: "1.4rem", marginTop: 14 }}
      >
        :
      </span>
      <TimeDrum
        values={MINUTE_VALUES}
        value={minute}
        onChange={(m) => set({ minute: m })}
        label="د"
        min={0}
        max={59}
      />
      <div className="flex flex-col gap-1.5" style={{ marginTop: 14 }}>
        <button
          onClick={() => set({ ampm: "am" })}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold tap transition-colors ${
            ampm === "am" ? "bg-blue-700 text-white shadow-sm" : "bg-slate-100 text-slate-400"
          }`}
        >
          ص
        </button>
        <button
          onClick={() => set({ ampm: "pm" })}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold tap transition-colors ${
            ampm === "pm" ? "bg-blue-700 text-white shadow-sm" : "bg-slate-100 text-slate-400"
          }`}
        >
          م
        </button>
      </div>
    </div>
  );
}
