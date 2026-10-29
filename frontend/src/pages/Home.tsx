import { Button, Card, Empty, Space } from "antd";
import { useNavigate } from "react-router-dom";
import { useHome } from "../api/hooks";
import { poseStatusText } from "../i18n";
import MediaImg from "../components/MediaImg";
import { useBoardCreate } from "../components/BoardCreate";
import { useImportFlow } from "../components/ImportFlow";
import BoardPreview from "../components/BoardPreview";

export default function HomePage() {
  const { data, isLoading } = useHome();
  const nav = useNavigate();
  const { importPictures } = useImportFlow();
  const { openCreateBoard } = useBoardCreate();

  if (isLoading) return <div>加载中…</div>;
  if (!data) return <Empty description="无法加载首页" />;

  return (
    <div>
      <div className="pb-hero">
        <div>
          <div className="pb-hero-kicker">继续使用</div>
          <div className="pb-hero-title">{data.last_board ? data.last_board.name : "姿态图库"}</div>
          <div className="pb-hero-sub">
            {data.last_board ? `画板上有 ${data.last_board.item_count} 张参考图` : "导入图片，再把参考图摆到画板上对比"}
          </div>
        </div>
        <Space>
          {data.last_board ? (
            <Button type="primary" onClick={() => nav(`/boards/${data.last_board.id}`)}>
              打开画板
            </Button>
          ) : (
            <Button type="primary" onClick={openCreateBoard}>
              新建画板
            </Button>
          )}
          <Button onClick={() => void importPictures()}>导入图片</Button>
          <Button onClick={() => nav("/library")}>打开图库</Button>
        </Space>
      </div>
      <div className="pb-stats">
        <div className="pb-stat">
          <div className="pb-stat-label">图片</div>
          <div className="pb-stat-value">{data.counts.images}</div>
        </div>
        <div className="pb-stat">
          <div className="pb-stat-label">标签</div>
          <div className="pb-stat-value">{data.counts.tags}</div>
        </div>
        <div className="pb-stat">
          <div className="pb-stat-label">画板</div>
          <div className="pb-stat-value">{data.counts.boards}</div>
        </div>
        {data.counts.pending_jobs ? (
          <div className="pb-stat">
            <div className="pb-stat-label">处理中</div>
            <div className="pb-stat-value">{data.counts.pending_jobs}</div>
          </div>
        ) : null}
      </div>
      {(data.failed_count || data.backup_overdue) && (
        <div className="pb-banner" style={{ marginBottom: 16 }}>
          {data.failed_count ? (
            <Button size="small" onClick={() => nav("/library?failed=1")}>
              提取失败 {data.failed_count} 张
            </Button>
          ) : null}
          {data.backup_overdue ? (
            <Button size="small" onClick={() => nav("/settings")}>
              超过 7 天未备份
            </Button>
          ) : null}
        </div>
      )}
      <Card className="pb-home-card" title="最近导入" bordered={false} style={{ marginBottom: 12 }}>
        {data.recent_images?.length ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {data.recent_images.map((img: any) => (
              <div key={img.id} className="pb-home-thumb" onClick={() => nav(`/library?select=${img.id}`)} style={{ cursor: "pointer" }}>
                <MediaImg thumb={img.thumbnail_url} original={img.original_url} width={88} height={88} />
                <div style={{ fontSize: 12, color: "#8a9099", marginTop: 4, padding: "0 2px 4px" }}>{poseStatusText(img.pose_status)}</div>
              </div>
            ))}
          </div>
        ) : (
          <Empty description="还没有导入图片" />
        )}
      </Card>
      <Card className="pb-home-card" title="最近画板" bordered={false}>
        {data.recent_boards?.length ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {data.recent_boards.map((b: any) => (
              <Card key={b.id} size="small" hoverable onClick={() => nav(`/boards/${b.id}`)} style={{ width: 176, overflow: "hidden" }}>
                <BoardPreview url={b.preview_url} compact />
                <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>{b.name}</div>
              </Card>
            ))}
          </div>
        ) : (
          <Empty description="还没有画板">
            <Button type="primary" onClick={openCreateBoard}>
              新建画板
            </Button>
          </Empty>
        )}
      </Card>
    </div>
  );
}
