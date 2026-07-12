import { createContext, useContext } from "react";

export interface BellRunnerCtx {
  audioUnlocked: boolean;
  pushEnabled: boolean;
  handleEnableAudio: () => void;
  handleDisableAudio: () => void;
}

export const BellRunnerContext = createContext<BellRunnerCtx>({
  audioUnlocked: false,
  pushEnabled: false,
  handleEnableAudio: () => {},
  handleDisableAudio: () => {},
});

export function useBellRunner(): BellRunnerCtx {
  return useContext(BellRunnerContext);
}
