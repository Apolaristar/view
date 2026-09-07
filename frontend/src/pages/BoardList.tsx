import { Button, Card, Empty, message } from "antd";
import { useNavigate } from "react-router-dom";
import { useBoards } from "../api/hooks";
import { request } from "../api/client";
import { useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "../i18n";
import { useBoardCreate } from "../components/BoardCreate";
import BoardPreview from "../components/BoardPreview";

export default function BoardListPage() {
  const { data } = useBoards();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { openCreateBoard } = useBoardCreate();

  async function rename(id: number, old: string) {
    const name = window.prompt("重命名", old);
    if (!name) return;
    await request(`/api/v1/boards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    qc.invalidateQueries({ queryKey: ["boards"] });
    qc.invalidateQueries({ queryKey: ["board", String(id)] });
    qc.invalidateQueries({ queryKey: ["home"] });
  }

  async function remove(id: number) {
    if (!window.confirm("删除画板不会删除图库里的图，确定？")) return;
    await request(`/api/v1/boards/${id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["boards"] });
    qc.invalidateQueries({ queryKey: ["home"] });
    message.success("已删除画板");
  }

  if (!data?.length) {
    return (
      <Empty description="还没有画板。创建后可以把图库里的参考图摆到同一块画布上对比。">
        <Button type="primary" onClick={openCreateBoard}>
          新建画板
        </Button>
      </Empty>
    );
  }

  return (
    <div>
      <div className="pb-page-head">
        <div>
          <div className="pb-page-title">画板</div>
          <div className="pb-page-sub">把参考图摆到同一块画布上对比</div>
        </div>
        <Button type="primary" onClick={openCreateBoard}>
          新建画板
        </Button>
      </div>
      <div className="pb-board-grid">
        {data.map((b) => (
          <Card
            key={b.id}
            className="pb-board-card"
            hoverable
            cover={<BoardPreview url={b.preview_url} />}
            style={{ width: 236 }}
            onClick={() => nav(`/boards/${b.id}`)}
            actions={[
              <a
                key="open"
                onClick={(e) => {
                  e.stopPropagation();
                  nav(`/boards/${b.id}`);
                }}
              >
                打开
              </a>,
              <a
                key="ren"
                onClick={(e) => {
                  e.stopPropagation();
                  rename(b.id, b.name);
                }}
              >
                重命名
              </a>,
              <a
                key="del"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(b.id);
                }}
              >
                删除
              </a>,
            ]}
          >
            <div className="pb-board-name">{b.name}</div>
            <div className="pb-board-meta">
              {b.tray_count || b.item_count} 张 · {formatDateTime(b.updated_at)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
