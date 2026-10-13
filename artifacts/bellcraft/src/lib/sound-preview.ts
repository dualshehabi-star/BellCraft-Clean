/** Manual previews are independent of the scheduled bell player and its gate. */
export type PreviewState = {
  owner: symbol | null;
  status: "idle" | "loading" | "playing";
};

export type PreviewOptions = {
  owner?: symbol;
  volume: number;
  maxVolume?: boolean;
  durationSec?: number;
  repeatCount?: number;
};

let state: PreviewState = { owner: null, status: "idle" };
const listeners = new Set<() => void>();
let active: { owner: symbol | null; stop: () => void } | null = null;

export const getPreviewState = () => state;
export function subscribePreview(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(next: PreviewState) {
  state = next;
  listeners.forEach(listener => listener());
}

export function stopSoundPreview(owner?: symbol): void {
  if (owner !== undefined && active?.owner !== owner) return;
  active?.stop();
}

function playbackError(error?: unknown): Error {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") {
    return new Error("لم يسمح الجهاز بتشغيل الصوت. اسمح بالصوت لهذا الموقع، ثم اضغط اختبار النغمة مجددًا.");
  }
  return new Error("تعذّر تحميل أو تشغيل ملف الصوت. تأكد من وجود الملف وأن صيغته مدعومة على جهازك.");
}

/** Call play synchronously in the click handler, not after canplaythrough. */
export function startSoundPreview(url: string, options: PreviewOptions): Promise<void> {
  stopSoundPreview();
  if (!url) return Promise.reject(new Error("اختر أو ارفع ملفًا صوتيًا للنغمة المخصصة أولًا."));
  const owner = options.owner ?? null;
  return new Promise((resolve, reject) => {
    let audio: HTMLAudioElement;
    try {
      audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = options.maxVolume ? 1 : Math.max(0, Math.min(1, Number.isFinite(options.volume) ? options.volume : 1));
    } catch (error) {
      reject(playbackError(error));
      return;
    }
    let settled = false;
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    let durationTimer: ReturnType<typeof setTimeout> | undefined;
    let played = 1;
    const repeatCount = Math.max(1, Math.floor(options.repeatCount ?? 1));
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      clearTimeout(durationTimer);
      audio.onended = null;
      audio.onerror = null;
      audio.onplaying = null;
      audio.pause();
      audio.removeAttribute("src");
      if (active?.stop === stop) {
        active = null;
        publish({ owner: null, status: "idle" });
      }
      if (error) reject(error);
      else resolve();
    };
    const stop = () => finish();
    active = { owner, stop };
    publish({ owner, status: "loading" });
    audio.onplaying = () => {
      if (settled || active?.stop !== stop) return;
      clearTimeout(loadTimer);
      publish({ owner, status: "playing" });
      // Loading time does not count as audible preview time.
      if (durationTimer === undefined && options.durationSec !== undefined) {
        durationTimer = setTimeout(stop, Math.max(1, options.durationSec) * repeatCount * 1000);
      }
    };
    const play = () => {
      try {
        audio.play().catch(error => { if (!settled) finish(playbackError(error)); });
      } catch (error) {
        finish(playbackError(error));
      }
    };
    audio.onended = () => {
      if (settled) return;
      if (played++ < repeatCount) {
        audio.currentTime = 0;
        play();
      } else finish();
    };
    audio.onerror = () => finish(playbackError());
    loadTimer = setTimeout(() => finish(new Error("انتهت مهلة تحميل الصوت. تحقق من الملف أو الاتصال وحاول مجددًا.")), 8000);
    play();
  });
}
