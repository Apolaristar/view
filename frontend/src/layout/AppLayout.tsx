import { Layout, Menu, Button, Typography, Dropdown, message } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import NAV, { boardsReturnPath } from "../nav";
import { useHome, useJobs } from "../api/hooks";
import { request } from "../api/client";
import { formatDate, formatDateTime } from "../i18n";
import TitleBar from "../components/TitleBar";
import { useFocusMode } from "../components/FocusMode";
import { useImportFlow } from "../components/ImportFlow";
import { usePoseSearch } from "../components/PoseSearch";

const { Header, Sider, Content } = Layout;

export default function AppLayout({
  saveStatus,
}: {
  saveStatus: "idle" | "saving" | "saved" | "failed";
}) {
  const loc = useLocation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const jobs = useJobs();
  const home = useHome();
  const { importFiles, importFolder, importWithTags } = useImportFlow();
  const { openSearch } = usePoseSearch();
  const [reprocessingAll, setReprocessingAll] = useState(false);

  const selected = NAV.find((n) => loc.pathname === n.key || (n.key !== "/" && loc.pathname.startsWith(n.key)))?.key || "/";

  const overdue = home.data?.backup_overdue;
  const { focus } = useFocusMode();
  const isBoardCanvas = /^\/boards\/\d+/.test(loc.pathname);

  async function reprocessLibrary() {
    if (reprocessingAll) return;
    setReprocessingAll(true);
    try {
      const data = await request<{ queued: number }>("/api/v1/library/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pose: true, color: false }),
      });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["images"] });
      qc.invalidateQueries({ queryKey: ["image"] });
      message.success(data.queued ? `已开始重新识别 ${data.queued} 张` : "图库是空的");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "重新识别失败";
      message.error(
        /405|404|Method Not Allowed|Not Found/i.test(msg)
          ? "当前后台还是旧版。请退出托盘图标后，重新运行「快速开发.bat」"
          : msg,
      );
    } finally {
      setReprocessingAll(false);
    }
  }

  useEffect(() => {
    if (loc.pathname === "/boards" || /^\/boards\/\d+/.test(loc.pathname)) {
      sessionStorage.setItem("lastBoardsPath", loc.pathname);
    }
  }, [loc.pathname]);

  return (
    <div className="pb-shell">
      {focus ? null : <TitleBar />}
      <Layout className="pb-shell-body">
        {focus ? null : (
          <Sider theme="light" width={168} className="pb-sider" style={{ overflow: "auto" }}>
            <Menu
              selectedKeys={[selected]}
              style={{ border: "none", padding: "10px 4px 12px" }}
              items={NAV.map((n) => ({ key: n.key, label: n.label }))}
              onClick={(e) => {
                if (e.key === "/boards") {
                  nav(boardsReturnPath(sessionStorage.getItem("lastBoardsPath")));
                  return;
                }
                nav(e.key);
              }}
            />
          </Sider>
        )}
        <Layout style={{ height: "100%", overflow: "hidden", minHeight: 0 }} className={`pb-stage${focus ? " is-focus" : ""}`}>
          {focus ? null : (
            <Header className="pb-header">
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {formatDate(new Date())}
              </Typography.Text>
              <Dropdown
                menu={{
                  items: [
                    { key: "files", label: "导入文件", onClick: () => void importFiles() },
                    { key: "folder", label: "导入文件夹", onClick: () => void importFolder() },
                    { key: "tagged", label: "先选标签再导入", onClick: () => importWithTags() },
                  ],
                }}
              >
                <Button type="primary" size="small">
                  导入
                </Button>
              </Dropdown>
              {selected === "/library" ? (
                <Button size="small" loading={reprocessingAll} disabled={reprocessingAll} onClick={() => void reprocessLibrary()}>
                  全部重新识别
                </Button>
              ) : null}
              <Button size="small" onClick={openSearch}>
                姿态搜图
              </Button>
              <span className="pb-status">处理中 {jobs.data?.pending || 0}</span>
              {jobs.data?.failed ? (
                <Button type="link" size="small" onClick={() => nav("/library?failed=1")}>
                  失败 {jobs.data.failed}
                </Button>
              ) : null}
              <span className="pb-status">
                {saveStatus === "saving" ? "保存中" : saveStatus === "failed" ? "保存失败" : saveStatus === "saved" ? "已保存" : ""}
              </span>
              <span className="pb-status" style={{ marginLeft: "auto", color: overdue ? "#d4380d" : undefined }}>
                {home.data?.last_backup_at ? `备份 ${formatDateTime(home.data.last_backup_at)}` : "尚未备份"}
                {overdue ? "（超过 7 天）" : ""}
              </span>
            </Header>
          )}
          <Content
            className={`pb-scroll pb-main${focus ? " is-focus" : ""}${isBoardCanvas ? " is-canvas" : ""}`}
          >
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </div>
  );
}
