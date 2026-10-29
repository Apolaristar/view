import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { request } from "./api/client";
import { useSettings } from "./api/hooks";

export type FilterLayout = "vertical" | "horizontal";

const PIN_KEY = "pb-filter-pin";
const LAYOUT_KEY = "pb-filter-layout";

export function parseFilterPin(value?: string | null): boolean {
  if (value === "0" || value === "false") return false;
  return true;
}

export function parseFilterLayout(value?: string | null): FilterLayout {
  return value === "horizontal" ? "horizontal" : "vertical";
}

function readStoredPin(): boolean {
  try {
    const stored = window.localStorage.getItem(PIN_KEY);
    if (stored === null) return true;
    return parseFilterPin(stored);
  } catch {
    return true;
  }
}

function readStoredLayout(): FilterLayout {
  try {
    return parseFilterLayout(window.localStorage.getItem(LAYOUT_KEY));
  } catch {
    return "vertical";
  }
}

type UiPrefsCtx = {
  filterPinned: boolean;
  filterLayout: FilterLayout;
  setFilterPinned: (pinned: boolean) => void;
  setFilterLayout: (layout: FilterLayout) => void;
};

const Ctx = createContext<UiPrefsCtx>({
  filterPinned: true,
  filterLayout: "vertical",
  setFilterPinned: () => undefined,
  setFilterLayout: () => undefined,
});

export function useUiPrefs() {
  return useContext(Ctx);
}

export function UiPrefsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const settings = useSettings();
  const [filterPinned, setPinState] = useState<boolean>(() => (typeof window === "undefined" ? true : readStoredPin()));
  const [filterLayout, setLayoutState] = useState<FilterLayout>(() =>
    typeof window === "undefined" ? "vertical" : readStoredLayout()
  );

  useEffect(() => {
    try {
      if (window.localStorage.getItem(PIN_KEY) === null && settings.data?.filter_pin != null) {
        setPinState(parseFilterPin(settings.data.filter_pin));
      }
      if (window.localStorage.getItem(LAYOUT_KEY) === null && settings.data?.filter_layout) {
        setLayoutState(parseFilterLayout(settings.data.filter_layout));
      }
    } catch {
      /* ignore */
    }
  }, [settings.data?.filter_pin, settings.data?.filter_layout]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PIN_KEY, filterPinned ? "1" : "0");
      window.localStorage.setItem(LAYOUT_KEY, filterLayout);
    } catch {
      /* ignore */
    }
  }, [filterPinned, filterLayout]);

  const setFilterPinned = useCallback(
    (pinned: boolean) => {
      setPinState(pinned);
      void request("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter_pin: pinned ? "1" : "0" }),
      })
        .then(() => qc.invalidateQueries({ queryKey: ["settings"] }))
        .catch(() => undefined);
    },
    [qc]
  );

  const setFilterLayout = useCallback(
    (layout: FilterLayout) => {
      setLayoutState(layout);
      void request("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter_layout: layout }),
      })
        .then(() => qc.invalidateQueries({ queryKey: ["settings"] }))
        .catch(() => undefined);
    },
    [qc]
  );

  const value = useMemo(
    () => ({ filterPinned, filterLayout, setFilterPinned, setFilterLayout }),
    [filterPinned, filterLayout, setFilterPinned, setFilterLayout]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
