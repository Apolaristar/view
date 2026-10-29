import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  setAlwaysOnTop as pinWindow,
  setFocusChrome,
  setFullScreen as setWindowFullScreen,
  subscribeOverlay,
  windowEnterFloat,
  windowLeaveFloat,
  windowLockPosition,
  windowSetClickThrough,
  windowSetOpacity,
} from "../api/client";

type OverlayState = { locked: boolean; opacity: number; clickThrough: boolean };

type FocusCtx = {
  focus: boolean;
  pinned: boolean;
  fullscreen: boolean;
  locked: boolean;
  opacity: number;
  clickThrough: boolean;
  setFocus: (value: boolean) => void;
  setPinned: (value: boolean) => void;
  setFullscreen: (value: boolean) => void;
  setLocked: (value: boolean) => void;
  setOpacity: (value: number) => void;
  setClickThrough: (value: boolean) => void;
};

const Ctx = createContext<FocusCtx>({
  focus: false,
  pinned: false,
  fullscreen: false,
  locked: false,
  opacity: 1,
  clickThrough: false,
  setFocus: () => undefined,
  setPinned: () => undefined,
  setFullscreen: () => undefined,
  setLocked: () => undefined,
  setOpacity: () => undefined,
  setClickThrough: () => undefined,
});

export function useFocusMode() {
  return useContext(Ctx);
}

function fromOverlay(raw: { locked?: boolean; opacity?: number; clickThrough?: boolean } | boolean | undefined): OverlayState | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    locked: Boolean(raw.locked),
    opacity: typeof raw.opacity === "number" ? raw.opacity : 1,
    clickThrough: Boolean(raw.clickThrough),
  };
}

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focus, setFocusState] = useState(false);
  const [pinned, setPinnedState] = useState(false);
  const [fullscreen, setFullscreenState] = useState(false);
  const [locked, setLockedState] = useState(false);
  const [opacity, setOpacityState] = useState(1);
  const [clickThrough, setClickThroughState] = useState(false);

  useEffect(() => {
    return subscribeOverlay((raw) => {
      const next = fromOverlay(raw);
      if (!next) return;
      setLockedState(next.locked);
      setOpacityState(next.opacity);
      setClickThroughState(next.clickThrough);
      if (next.clickThrough) setPinnedState(true);
    });
  }, []);

  const setFullscreen = useCallback(async (value: boolean) => {
    const next = await setWindowFullScreen(value);
    setFullscreenState(next);
  }, []);

  const setFocus = useCallback(async (value: boolean) => {
    if (value) {
      setFocusState(true);
      const overlay = fromOverlay(await windowEnterFloat());
      if (overlay) {
        setLockedState(overlay.locked);
        setOpacityState(overlay.opacity);
        setClickThroughState(overlay.clickThrough);
      }
      await setFocusChrome(true);
      return;
    }
    setFocusState(false);
    setFullscreenState(false);
    setLockedState(false);
    setClickThroughState(false);
    setOpacityState(1);
    await setWindowFullScreen(false);
    await windowLeaveFloat();
    await setFocusChrome(false);
  }, []);

  const setPinned = useCallback(async (value: boolean) => {
    const next = await pinWindow(value);
    setPinnedState(next);
  }, []);

  const setLocked = useCallback(async (value: boolean) => {
    const next = await windowLockPosition(value);
    setLockedState(next);
  }, []);

  const setOpacity = useCallback(async (value: number) => {
    const next = await windowSetOpacity(value);
    setOpacityState(next);
  }, []);

  const setClickThrough = useCallback(async (value: boolean) => {
    const next = await windowSetClickThrough(value);
    setClickThroughState(next);
    if (next) {
      const pinnedNow = await pinWindow(true);
      setPinnedState(pinnedNow);
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        focus,
        pinned,
        fullscreen,
        locked,
        opacity,
        clickThrough,
        setFocus,
        setPinned,
        setFullscreen,
        setLocked,
        setOpacity,
        setClickThrough,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
