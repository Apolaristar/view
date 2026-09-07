import { Button, Card, List, Space, Typography, message } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSettings, useTags } from "../api/hooks";
import { request } from "../api/client";
import { formatDateTime } from "../i18n";
import type { Tag } from "../types";

export default function SettingsPage() {
  const { data } = useSettings();
  const tags = useTags();
  const qc = useQueryClient();
  const categories = (tags.data || []).filter((t) => t.kind === "category");
  const facets = (tags.data || []).filter((t) => t.kind === "facet");
  const custom = (tags.data || []).filter((t) => t.kind !== "category" && t.kind !== "facet");

  async function addTag(kind: "category" | "facet" | "custom", parentId?: number) {
    const name = window.prompt(kind === "category" ? "大类名称，例如 人物 / 场景" : kind === "facet" ? "细分名称，例如 正面 / 侧面" : "自定义标签");
    if (!name) return;
    await request("/api/v1/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind, parent_id: parentId || null }),
    });
    qc.invalidateQueries({ queryKey: ["tags"] });
  }

  async function removeTag(tag: Tag) {
    if (!window.confirm(tag.kind === "category" ? `删除「${tag.name}」会同时删掉它下面的细分。确定？` : `删除「${tag.name}」？`)) return;
    await request(`/api/v1/tags/${tag.id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["images"] });
  }
  const backups = useQuery({
    queryKey: ["backups"],
    queryFn: () => request<any[]>("/api/v1/backup/list"),
  });

  async function backup() {
    const note = window.prompt("备份备注（可选）") || "";
    await request("/api/v1/backup/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    message.success("备份成功");
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["home"] });
    qc.invalidateQueries({ queryKey: ["backups"] });
  }

  async function restore(id: number) {
    if (!window.confirm("恢复前会自动再做一份当前库的安全备份。确定恢复？")) return;
    await request(`/api/v1/backup/restore/${id}`, { method: "POST" });
    message.success("已恢复");
    qc.invalidateQueries();
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      <div className="pb-page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="pb-page-title">设置</div>
          <div className="pb-page-sub">标签结构、数据目录和备份</div>
        </div>
      </div>
      <Card
        title="标签结构"
        extra={
          <Space>
            <Button onClick={() => addTag("category")}>新增大类</Button>
            <Button onClick={() => addTag("custom")}>新建自定义</Button>
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          先按大类（人物 / 场景等）分组，再按细分（正面 / 侧面等）区分，另外还可以加任意自定义标签。
        </Typography.Paragraph>
        {categories.map((cat) => (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            <Space>
              <Typography.Text strong>{cat.name}</Typography.Text>
              <Button size="small" onClick={() => addTag("facet", cat.id)}>
                添加细分
              </Button>
              <Button size="small" danger onClick={() => removeTag(cat)}>
                删除
              </Button>
            </Space>
            <div style={{ marginLeft: 16, marginTop: 6 }}>
              {facets
                .filter((f) => f.parent_id === cat.id)
                .map((f) => (
                  <Space key={f.id} style={{ marginRight: 12 }}>
                    <span>{f.name}</span>
                    <Button size="small" type="link" danger onClick={() => removeTag(f)}>
                      删
                    </Button>
                  </Space>
                ))}
            </div>
          </div>
        ))}
        <Typography.Text strong>自定义标签</Typography.Text>
        <div style={{ marginTop: 8 }}>
          {custom.length ? (
            custom.map((t) => (
              <Space key={t.id} style={{ marginRight: 12 }}>
                <span>{t.name}</span>
                <Button size="small" type="link" danger onClick={() => removeTag(t)}>
                  删
                </Button>
              </Space>
            ))
          ) : (
            <Typography.Text type="secondary">还没有自定义标签</Typography.Text>
          )}
        </div>
      </Card>
      <Card title="数据目录">
        <Typography.Paragraph copyable>{data?.data_path}</Typography.Paragraph>
        <Typography.Text type="secondary">主色提取方式：整图（第一版）</Typography.Text>
      </Card>
      <Card
        title="备份与恢复"
        extra={
          <Button type="primary" onClick={backup}>
            创建备份
          </Button>
        }
      >
        <List
          dataSource={backups.data || []}
          locale={{ emptyText: "还没有备份" }}
          renderItem={(item: any) => (
            <List.Item actions={[<a key="r" onClick={() => restore(item.id)}>恢复</a>]}>
              {formatDateTime(item.created_at)} {item.note || "手动备份"}（{Math.round((item.size_bytes || 0) / 1024)} KB）
            </List.Item>
          )}
        />
      </Card>
    </Space>
  );
}
