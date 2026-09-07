import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { setAlwaysOnTop as pinWindow, setFocusChrome, setFullScreen as setWindowFullScreen } from "../api/client";

type FocusCtx = {
  focus: boolean;
  pinned: boolean;
  fullscreen: boolean;
  setFocus: (value: boolean) => void;
  setPinned: (value: boolean) => void;
  setFullscreen: (value: boolean) => void;
};

const Ctx = createContext<FocusCtx>({
  focus: false,
  pinned: false,
  fullscreen: false,
  setFocus: () => undefined,
  setPinned: () => undefined,
  setFullscreen: () => undefined,
});

export function useFocusMode() {
  return useContext(Ctx);
}

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focus, setFocusState] = useState(false);
  const [pinned, setPinnedState] = useState(false);
  const [fullscreen, setFullscreenState] = useState(false);

  const setFullscreen = useCallback(async (value: boolean) => {
    const next = await setWindowFullScreen(value);
    setFullscreenState(next);
  }, []);

  const setFocus = useCallback(async (value: boolean) => {
    setFocusState(value);
    if (!value) {
      setFullscreenState(false);
      await setWindowFullScreen(false);
    }
    await setFocusChrome(value);
  }, []);

  const setPinned = useCallback(async (value: boolean) => {
    const next = await pinWindow(value);
    setPinnedState(next);
  }, []);

  return <Ctx.Provider value={{ focus, pinned, fullscreen, setFocus, setPinned, setFullscreen }}>{children}</Ctx.Provider>;
}
