import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { theme as antdTheme, type ThemeConfig } from "antd";
import { request } from "./api/client";
import { useSettings } from "./api/hooks";

export const THEME_IDS = ["atelier", "night", "paper"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEMES: {
  id: ThemeId;
  label: string;
  blurb: string;
}[] = [
  { id: "atelier", label: "画室", blurb: "分区卡片、圆角、中间留白给图" },
  { id: "night", label: "墨夜", blurb: "紧凑全幅、直角、侧栏收窄" },
  { id: "paper", label: "稿纸", blurb: "笔记本边线、宽留白、楷体" },
];

const STORAGE_KEY = "pb-ui-theme";

export function parseTheme(value?: string | null): ThemeId {
  if (value === "night" || value === "paper" || value === "atelier") return value;
  return "atelier";
}

function readStoredTheme(): ThemeId {
  try {
    return parseTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "atelier";
  }
}

type ThemeCtx = {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
};

const Ctx = createContext<ThemeCtx>({ theme: "atelier", setTheme: () => undefined });

export function useUiTheme() {
  return useContext(Ctx);
}

export function antdThemeFor(id: ThemeId): ThemeConfig {
  if (id === "night") {
    return {
      algorithm: antdTheme.darkAlgorithm,
      token: {
        fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
        colorPrimary: "#7aa2ff",
        colorInfo: "#7aa2ff",
        borderRadius: 8,
        colorBgLayout: "#12141a",
        colorBorder: "#2a2e38",
        colorText: "#e8eaed",
        colorTextSecondary: "#9aa0ab",
        controlHeightSM: 28,
      },
      components: {
        Layout: { headerBg: "#16181f", siderBg: "#14161c", headerHeight: 48 },
        Menu: { itemBorderRadius: 8, itemMarginInline: 10, itemMarginBlock: 4, darkItemBg: "#14161c" },
        Button: { borderRadius: 8, fontWeight: 500 },
        Card: { borderRadiusLG: 12 },
      },
    };
  }
  if (id === "paper") {
    return {
      token: {
        fontFamily: '"KaiTi", "STKaiti", "Kaiti SC", "Segoe UI", "Microsoft YaHei", serif',
        colorPrimary: "#c45c26",
        colorInfo: "#c45c26",
        borderRadius: 4,
        colorBgLayout: "#efe4ce",
        colorBorder: "#e0d0b2",
        colorText: "#3a2a1c",
        colorTextSecondary: "#8a7358",
        controlHeightSM: 28,
      },
      components: {
        Layout: { headerBg: "#fff8ee", siderBg: "#f4ead6", headerHeight: 48 },
        Menu: { itemBorderRadius: 4, itemMarginInline: 10, itemMarginBlock: 4 },
        Button: { borderRadius: 4, fontWeight: 500 },
        Card: { borderRadiusLG: 6 },
      },
    };
  }
  return {
    token: {
      fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
      colorPrimary: "#3b6cff",
      colorInfo: "#3b6cff",
      borderRadius: 10,
      colorBgLayout: "#f3f4f7",
      colorBorder: "#e8eaef",
      colorText: "#1c1f26",
      colorTextSecondary: "#8a9099",
      controlHeightSM: 28,
    },
    components: {
        Layout: { headerBg: "#ffffff", siderBg: "#dce6fa", headerHeight: 48 },
      Menu: { itemBorderRadius: 8, itemMarginInline: 10, itemMarginBlock: 4 },
      Button: { borderRadius: 8, fontWeight: 500 },
      Card: { borderRadiusLG: 14 },
    },
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const settings = useSettings();
  const [theme, setThemeState] = useState<ThemeId>(() => (typeof window === "undefined" ? "atelier" : readStoredTheme()));

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      /* ignore */
    }
    if (settings.data?.ui_theme) setThemeState(parseTheme(settings.data.ui_theme));
  }, [settings.data?.ui_theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback(
    (id: ThemeId) => {
      setThemeState(id);
      void request("/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ui_theme: id }),
      })
        .then(() => qc.invalidateQueries({ queryKey: ["settings"] }))
        .catch(() => undefined);
    },
    [qc]
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
