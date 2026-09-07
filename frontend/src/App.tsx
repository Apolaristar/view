import { useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");
import AppLayout from "./layout/AppLayout";
import HomePage from "./pages/Home";
import LibraryPage from "./pages/Library";
import BoardListPage from "./pages/BoardList";
import BoardCanvasPage from "./pages/BoardCanvas";
import SettingsPage from "./pages/Settings";
import { BoardCreateProvider } from "./components/BoardCreate";
import { FocusModeProvider } from "./components/FocusMode";
import { ThemeProvider, antdThemeFor, useUiTheme } from "./theme";

const queryClient = new QueryClient();

function ThemedRoutes({
  saveStatus,
  onSaveStatus,
}: {
  saveStatus: "idle" | "saving" | "saved" | "failed";
  onSaveStatus: (s: "idle" | "saving" | "saved" | "failed") => void;
}) {
  const { theme } = useUiTheme();
  return (
    <ConfigProvider locale={zhCN} theme={antdThemeFor(theme)}>
      <HashRouter>
        <BoardCreateProvider>
          <FocusModeProvider>
            <Routes>
              <Route element={<AppLayout saveStatus={saveStatus} />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/boards" element={<BoardListPage />} />
                <Route path="/boards/:id" element={<BoardCanvasPage onSaveStatus={onSaveStatus} />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </FocusModeProvider>
        </BoardCreateProvider>
      </HashRouter>
    </ConfigProvider>
  );
}

export default function App() {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedRoutes saveStatus={saveStatus} onSaveStatus={setSaveStatus} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
