import { startSoundPreview } from "./sound-preview";

export type BellSound = 'classic' | 'chime' | 'gentle' | 'musical' | 'alarm' | 'school_bell' | 'custom';

// Scheduled playback gate. Manual previews have their own independent player;
// testing a sound must not enable, stop, or change the scheduled bells.
let _bellEnabled = false;
let playbackGeneration = 0;

export function setBellEnabled(enabled: boolean): void {
  _bellEnabled = enabled;
  if (enabled) getCtx();
  else {
    scheduledBellQueue.length = 0;
    stopBell();
  }
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Classic bell MP3 file (in public/)
function classicBellUrl(): string {
  return `${import.meta.env.BASE_URL}classic-bell.mp3`;
}

// Neptune / gentle bell MP3 file (in public/)
function gentleUrl(): string {
  return `${import.meta.env.BASE_URL}neptune.mp3`;
}

// Chime bell MP3 file (in public/)
function chimeUrl(): string {
  return `${import.meta.env.BASE_URL}chime.mp3`;
}

// Musical bell MP3 file (in public/)
function musicalUrl(): string {
  return `${import.meta.env.BASE_URL}musical-bell.mp3`;
}

// Alarm sound MP3 file (in public/)
function alarmUrl(): string {
  return `${import.meta.env.BASE_URL}alarm-bell.mp3`;
}

// School bell WAV file (high-quality, in public/)
function schoolBellUrl(): string {
  return `${import.meta.env.BASE_URL}school-bell.wav`;
}

const SOUND_DURATION: Record<Exclude<BellSound, 'custom'>, number> = {
  classic: 5,
  chime: 5,
  gentle: 4.5,
  musical: 30,
  alarm: 10,
  school_bell: 5,
};


// Custom sound stored as localStorage data URL
export const CUSTOM_SOUND_KEYS = {
  preStart: 'bellcraft_custom_sound_prestart',
  preEnd: 'bellcraft_custom_sound_preend',
  end: 'bellcraft_custom_sound_end',
  legacy: 'bellcraft_custom_sound_legacy',
} as const;

/**
 * Play an audio file or data-URL.
 *
 * On Android Capacitor WebView, new Audio(url).play() can be rejected
 * immediately because the asset hasn't been buffered yet.  We load the audio
 * first, wait for 'canplaythrough', then play.  Errors are always logged to
 * console so they appear in Android Logcat.
 * A 8-second safety timeout prevents the Promise from hanging forever.
 */
function playCustomAudio(url: string, volume: number, maxVolume: boolean): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = maxVolume ? 1 : Math.max(0, Math.min(1, volume));
    currentAudio = audio;

    let settled = false;
    let safetyTimer: number | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (safetyTimer !== undefined) clearTimeout(safetyTimer);
      audio.pause();
      if (currentAudio === audio) currentAudio = null;
      if (activeFinish === finish) activeFinish = null;
      resolve();
    };
    activeFinish = finish;

    audio.onended = finish;
    audio.onerror = (e) => {
      console.error('[BellCraft] audio error loading:', url, e);
      finish();
    };

    safetyTimer = window.setTimeout(() => {
      console.error('[BellCraft] audio play timed out (8s):', url);
      finish();
    }, 8_000);

    // Load first, then play — avoids Android WebView NotAllowedError on first call
    audio.addEventListener('canplaythrough', () => {
      clearTimeout(safetyTimer);
      safetyTimer = window.setTimeout(() => {
        console.error('[BellCraft] audio play timeout after canplaythrough:', url);
        finish();
      }, Math.max(10_000, (Number.isFinite(audio.duration) ? audio.duration * 1000 : 3_600_000) + 3000));
      audio.onended = finish;
      audio.play().then(() => {}).catch((err) => {
        console.error('[BellCraft] audio.play() after canplaythrough failed:', err, 'url:', url);
        finish();
      });
    }, { once: true });

    audio.src = url;
    audio.load();

  });
}

let stopTimer: number | null = null;
let loopTimer: number | null = null;
// Tracks the audio element currently playing (classic / gentle / custom / one-shot).
// stopBell() pauses it so the user can actually stop a test tone mid-play.
let currentAudio: HTMLAudioElement | null = null;
// Allows stopBell() to immediately resolve any pending playCustomAudio / playBellOnce promise.
let activeFinish: (() => void) | null = null;

export function playBellOnce(
  sound: BellSound,
  volume: number,
  opts?: { maxVolume?: boolean; customDataUrl?: string }
): Promise<void> {
  return startSoundPreview(resolveBellSoundUrl(sound, opts?.customDataUrl), {
    volume, maxVolume: opts?.maxVolume,
  });
}

export function resolveBellSoundUrl(sound: BellSound, customDataUrl?: string): string {
  switch (sound) {
    case "classic": return classicBellUrl();
    case "gentle": return gentleUrl();
    case "chime": return chimeUrl();
    case "musical": return musicalUrl();
    case "alarm": return alarmUrl();
    case "school_bell": return schoolBellUrl();
    case "custom": return customDataUrl ?? "";
    default: return "";
  }
}

export function startBellLoop(
  sound: BellSound,
  volume: number,
  durationSec: number,
  opts?: { maxVolume?: boolean; repeatCount?: number; customDataUrl?: string }
): void {
  // Hard gate: never play unless explicitly enabled by the user in this session.
  if (!_bellEnabled) return;
  stopBell();
  const generation = playbackGeneration;
  const { maxVolume = false, repeatCount = 1, customDataUrl } = opts ?? {};

  const url = sound === 'classic' ? classicBellUrl()
    : sound === 'gentle' ? gentleUrl()
    : sound === 'chime' ? chimeUrl()
    : sound === 'musical' ? musicalUrl()
    : sound === 'alarm' ? alarmUrl()
    : sound === 'school_bell' ? schoolBellUrl()
    : (customDataUrl ?? '');
  if (!url) return;
  let played = 0;
  const playNext = () => {
    if (generation !== playbackGeneration || !_bellEnabled) return;
    if (played >= repeatCount) return;
    played++;
    playCustomAudio(url, volume, maxVolume).then(() => {
      if (played < repeatCount) playNext();
    }).catch((e: unknown) => { console.error('[BellCraft] startBellLoop playNext error:', e); });
  };
  playNext();
  stopTimer = window.setTimeout(() => stopBell(), Math.max(1, durationSec) * Math.max(1, repeatCount) * 1000);
}

type ScheduledBell = {
  sound: BellSound;
  volume: number;
  durationSec: number;
  opts?: { maxVolume?: boolean; repeatCount?: number; customDataUrl?: string };
};

const scheduledBellQueue: ScheduledBell[] = [];
let scheduledBellPlaying = false;

/**
 * Queue scheduler-originated bells so simultaneous class and duty alerts do
 * not stop one another. Manual/test playback uses the separate preview player.
 */
export function enqueueScheduledBell(
  sound: BellSound,
  volume: number,
  durationSec: number,
  opts?: { maxVolume?: boolean; repeatCount?: number; customDataUrl?: string },
): void {
  scheduledBellQueue.push({ sound, volume, durationSec, opts });
  if (scheduledBellPlaying) return;

  const playNext = () => {
    const next = scheduledBellQueue.shift();
    if (!next) {
      scheduledBellPlaying = false;
      return;
    }

    scheduledBellPlaying = true;
    startBellLoop(next.sound, next.volume, next.durationSec, next.opts);
    window.setTimeout(() => {
      scheduledBellPlaying = false;
      playNext();
    }, Math.max(1, next.durationSec) * Math.max(1, next.opts?.repeatCount ?? 1) * 1000 + 100);
  };

  playNext();
}

export function stopBell(): void {
  playbackGeneration++;
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
  // Stop any HTMLAudioElement playing (classic / gentle / custom one-shots)
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.onended = null;
    currentAudio = null;
  }
  // Immediately resolve any pending playBellOnce / playCustomAudio promise
  if (activeFinish) { activeFinish(); activeFinish = null; }
}

export function unlockAudio(): void { getCtx(); }

export { SOUND_DURATION };

export const BELL_SOUND_LABELS: Record<BellSound, string> = {
  classic:     'جرس المدرسة الكلاسيكي',
  chime:       'أجراس موسيقية',
  gentle:      'نغمة هادئة',
  musical:     'نغمة هادئة',
  alarm:       'صوت الإنذار',
  school_bell: 'جرس المدرسة (WAV)',
  custom:      'نغمة مخصصة',
};

export const BELL_SOUNDS: BellSound[] = ['classic', 'chime', 'gentle', 'musical', 'alarm', 'school_bell'];
