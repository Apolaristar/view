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

const queryClient = new QueryClient();

export default function App() {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          fontFamily: '"Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif',
          colorPrimary: "#3b6cff",
          colorInfo: "#3b6cff",
          borderRadius: 8,
          colorBgLayout: "#eef0f3",
          colorBorder: "#e6e8ec",
          colorText: "#1f2329",
          colorTextSecondary: "#6b7280",
          controlHeightSM: 28,
        },
        components: {
          Layout: { headerBg: "#ffffff", siderBg: "#ffffff", headerHeight: 52 },
          Menu: { itemBorderRadius: 8, itemMarginInline: 8, itemMarginBlock: 4 },
          Button: { borderRadius: 6, fontWeight: 500 },
          Card: { borderRadiusLG: 12 },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <BoardCreateProvider>
            <FocusModeProvider>
              <Routes>
                <Route element={<AppLayout saveStatus={saveStatus} />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/boards" element={<BoardListPage />} />
                  <Route path="/boards/:id" element={<BoardCanvasPage onSaveStatus={setSaveStatus} />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </FocusModeProvider>
          </BoardCreateProvider>
        </HashRouter>
      </QueryClientProvider>
    </ConfigProvider>
  );
}
