import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { resolveBellSoundUrl, type BellSound } from "@/lib/audio";
import { getPreviewState, startSoundPreview, stopSoundPreview, subscribePreview } from "@/lib/sound-preview";
import { useToast } from "@/hooks/use-toast";

type Options = {
  sound: BellSound;
  volume: number;
  maxVolume?: boolean;
  customDataUrl?: string | null;
  durationSec: number;
  repeatCount?: number;
};

/** One preview owner per settings screen/modal, with actual shared player state. */
export function useSoundPreview(options: Options) {
  const owner = useRef(Symbol("sound-preview")).current;
  const state = useSyncExternalStore(subscribePreview, getPreviewState, getPreviewState);
  const { toast } = useToast();
  const isPlaying = state.owner === owner && state.status !== "idle";
  const stopPreview = useCallback(() => stopSoundPreview(owner), [owner]);
  useEffect(() => stopPreview, [stopPreview]);
  // Changing the selection cancels its old preview, including pending loads.
  useEffect(() => { stopPreview(); }, [options.sound, options.customDataUrl, stopPreview]);

  const run = useCallback((sound: BellSound, customDataUrl?: string | null, fullTest = false) => {
    void startSoundPreview(resolveBellSoundUrl(sound, customDataUrl ?? undefined), {
      owner, volume: options.volume, maxVolume: options.maxVolume,
      durationSec: fullTest ? options.durationSec : 30,
      repeatCount: fullTest ? options.repeatCount : 1,
    }).catch((error: Error) => {
      toast({ title: "تعذّر تشغيل النغمة", description: error.message, variant: "destructive" });
    });
  }, [owner, options.volume, options.maxVolume, options.durationSec, options.repeatCount, toast]);

  const previewSound = useCallback((sound: BellSound, customDataUrl?: string | null) => run(sound, customDataUrl), [run]);
  const handleTestTone = useCallback(() => {
    if (getPreviewState().owner === owner && getPreviewState().status !== "idle") stopPreview();
    else run(options.sound, options.customDataUrl, true);
  }, [owner, stopPreview, run, options.sound, options.customDataUrl]);
  return { isPlaying, handleTestTone, previewSound, stopPreview };
}
