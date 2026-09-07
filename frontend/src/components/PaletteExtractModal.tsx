import { useEffect, useState } from "react";
import { Button, InputNumber, Modal, Space, message } from "antd";
import { request } from "../api/client";
import { copyText, saveDataUrl } from "../desktop";
import { familyText } from "../i18n";
import { paletteCardDataUrl, paletteCssVars, paletteHexList } from "../paletteCard";
import type { ImageItem, PaletteColor } from "../types";

type ExtractResult = {
  palette: PaletteColor[];
  k: number;
  applied: boolean;
  image: ImageItem | null;
};

export default function PaletteExtractModal({
  image,
  open,
  onClose,
  onApplied,
}: {
  image: ImageItem | null;
  open: boolean;
  onClose: () => void;
  onApplied: (updated: ImageItem) => void;
}) {
  const [k, setK] = useState(8);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [colors, setColors] = useState<PaletteColor[]>([]);

  useEffect(() => {
    if (!open || !image) return;
    setK(8);
    setColors(image.palette || []);
    void runExtract(image.id, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, image?.id]);

  async function runExtract(imageId: number, count: number) {
    setLoading(true);
    try {
      const data = await request<ExtractResult>(`/api/v1/images/${imageId}/palette`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: count, apply: false }),
      });
      setColors(data.palette || []);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "提取失败");
    } finally {
      setLoading(false);
    }
  }

  async function applyToImage() {
    if (!image || !colors.length) return;
    setApplying(true);
    try {
      const data = await request<ExtractResult>(`/api/v1/images/${image.id}/palette`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k, apply: true }),
      });
      const next = data.image;
      if (next) {
        setColors(next.palette || data.palette || []);
        onApplied(next);
        message.success(`已应用到这张图（${(next.palette || []).length} 色）`);
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "未能保存色卡");
    } finally {
      setApplying(false);
    }
  }

  async function copyHexes() {
    if (!colors.length) return;
    try {
      await copyText(paletteHexList(colors));
      message.success("已复制全部色号");
    } catch {
      message.error("复制失败");
    }
  }

  async function copyCss() {
    if (!colors.length) return;
    try {
      await copyText(paletteCssVars(colors));
      message.success("已复制 CSS 变量");
    } catch {
      message.error("复制失败");
    }
  }

  async function exportPng() {
    if (!colors.length) return;
    const ok = await saveDataUrl(`${image?.uid || "palette"}-色卡.png`, paletteCardDataUrl(colors, "色卡"));
    if (ok) message.success("色卡已导出");
  }

  return (
    <Modal
      title="提取色卡"
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>提取最主要的</span>
          <InputNumber min={2} max={16} value={k} onChange={(v) => setK(Number(v || 8))} />
          <span>个颜色</span>
          <Button type="primary" loading={loading} disabled={!image} onClick={() => image && void runExtract(image.id, k)}>
            提取
          </Button>
        </div>
        <div className="pb-palette-board">
          {colors.length ? (
            colors.map((c) => (
              <button
                key={`${c.hex}-${c.ratio}`}
                type="button"
                className="pb-palette-chip pb-palette-chip-lg"
                data-label={c.hex}
                aria-label={`${c.hex}，右键复制`}
                style={{ background: c.hex }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  void copyText(c.hex).then(
                    () => message.success(`已复制 ${c.hex}`),
                    () => message.error("复制失败")
                  );
                }}
              />
            ))
          ) : (
            <span className="pb-hint">还没有颜色</span>
          )}
        </div>
        <div className="pb-palette-rows">
          {colors.map((c) => (
            <div key={`${c.hex}-row`} className="pb-palette-row">
              <span className="pb-palette-dot" style={{ background: c.hex }} />
              <code>{c.hex}</code>
              <span>{Math.round(c.ratio * 1000) / 10}%</span>
              <span>{familyText(c.family)}</span>
            </div>
          ))}
        </div>
        <Space wrap>
          <Button onClick={() => void copyHexes()} disabled={!colors.length}>
            复制全部色号
          </Button>
          <Button onClick={() => void copyCss()} disabled={!colors.length}>
            复制为 CSS
          </Button>
          <Button onClick={() => void exportPng()} disabled={!colors.length}>
            导出色卡 PNG
          </Button>
          <Button type="primary" loading={applying} disabled={!colors.length} onClick={() => void applyToImage()}>
            应用到这张图
          </Button>
        </Space>
        <div className="pb-hint">悬停色块看色号，右键复制单个色号。应用后会替换图库里这张图下面的色卡，不会改你手动设过的主色/副色。</div>
      </Space>
    </Modal>
  );
}
