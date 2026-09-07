import { Layout, Menu, Button, Space, Typography, Dropdown, Modal, Upload, message } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import NAV from "../nav";
import { useHome, useImport, useJobs } from "../api/hooks";
import { request, selectLocalFolder, selectLocalPaths } from "../api/client";
import type { ImageItem } from "../types";
import { formatDate, formatDateTime } from "../i18n";
import MediaImg from "../components/MediaImg";
import TitleBar from "../components/TitleBar";
import { useFocusMode } from "../components/FocusMode";

const { Header, Sider, Content } = Layout;

export default function AppLayout({
  saveStatus,
}: {
  saveStatus: "idle" | "saving" | "saved" | "failed";
}) {
  const loc = useLocation();
  const nav = useNavigate();
  const jobs = useJobs();
  const home = useHome();
  const importer = useImport();
  const [poseOpen, setPoseOpen] = useState(false);
  const [poseItems, setPoseItems] = useState<ImageItem[] | { id: number; thumbnail_path?: string; distance: number }[]>([]);
  const [poseMsg, setPoseMsg] = useState("");

  const selected = NAV.find((n) => loc.pathname === n.key || (n.key !== "/" && loc.pathname.startsWith(n.key)))?.key || "/";

  async function doImport(kind: "files" | "folder") {
    const paths = kind === "files" ? await selectLocalPaths() : await selectLocalFolder();
    if (!paths.length) {
      message.info("请在桌面应用中选择文件，或确认已通过 Electron 启动");
      return;
    }
    const result: any = await importer.mutateAsync(paths);
    message.success(`导入 ${result.imported_count}，跳过 ${result.skipped_count}`);
  }

  async function searchPoseFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    try {
      const data = await request<{ items: any[]; total: number; empty?: boolean }>("/api/v1/search/by-pose", {
        method: "POST",
        body: form,
      });
      setPoseMsg("");
      setPoseItems(data.items || []);
      if (!data.items?.length) setPoseMsg(data.empty ? "图库为空" : "没有结果");
    } catch (err: any) {
      setPoseItems([]);
      setPoseMsg(err.message || "检测不到人体");
    }
  }

  const overdue = home.data?.backup_overdue;
  const { focus } = useFocusMode();
  const isBoardCanvas = /^\/boards\/\d+/.test(loc.pathname);

  useEffect(() => {
    if (loc.pathname === "/boards" || /^\/boards\/\d+/.test(loc.pathname)) {
      sessionStorage.setItem("lastBoardsPath", loc.pathname);
    }
  }, [loc.pathname]);

  return (
    <div className="pb-shell">
      <TitleBar compact={focus} />
      <Layout className="pb-shell-body">
        {focus ? null : (
          <Sider theme="light" width={168} className="pb-sider" style={{ overflow: "auto" }}>
            <Menu
              selectedKeys={[selected]}
              style={{ border: "none", padding: "10px 4px 12px" }}
              items={NAV.map((n) => ({ key: n.key, label: n.label }))}
              onClick={(e) => {
                if (e.key === "/boards") {
                  const lastPath = sessionStorage.getItem("lastBoardsPath");
                  if (lastPath) {
                    nav(lastPath);
                    return;
                  }
                  const last = home.data?.last_board?.id || sessionStorage.getItem("lastBoardId");
                  nav(last ? `/boards/${last}` : "/boards");
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
                    { key: "files", label: "导入文件", onClick: () => doImport("files") },
                    { key: "folder", label: "导入文件夹", onClick: () => doImport("folder") },
                  ],
                }}
              >
                <Button type="primary" size="small">
                  导入
                </Button>
              </Dropdown>
              <Button size="small" onClick={() => setPoseOpen(true)}>
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
      <Modal title="姿态搜图" open={poseOpen} onCancel={() => setPoseOpen(false)} footer={null} width={720}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Upload.Dragger
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => {
              searchPoseFile(file as File);
              return false;
            }}
          >
            <p className="ant-upload-text">点击或拖拽图片到这里</p>
            <p className="ant-upload-hint">用于按姿态搜索图库，支持 jpg / png / webp</p>
          </Upload.Dragger>
          {poseMsg ? <Typography.Text type="danger">{poseMsg}</Typography.Text> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {poseItems.map((item: any) => (
              <MediaImg
                key={item.id}
                thumb={item.thumbnail_url || `/media/thumbnails/${item.uid || ""}`}
                original={item.original_url}
                width={96}
                height={96}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setPoseOpen(false);
                  nav(`/library?select=${item.id}`);
                }}
              />
            ))}
          </div>
        </Space>
      </Modal>
    </div>
  );
}
