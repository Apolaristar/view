import { useEffect, useRef, useState } from "react";
import { Modal } from "antd";
import { clamp, normalizeCrop, type CropBox } from "../boardMath";

export default function CropDialog({
  open,
  src,
  value,
  onCancel,
  onOk,
}: {
  open: boolean;
  src: string;
  value: CropBox;
  onCancel: () => void;
  onOk: (box: CropBox) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<CropBox>(value);
  const drag = useRef<null | { kind: "move" | "nw" | "ne" | "sw" | "se"; sx: number; sy: number; start: CropBox }>(null);

  useEffect(() => {
    if (open) setBox(normalizeCrop(value));
  }, [open, value]);

  function frac(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function onMove(e: React.MouseEvent) {
    if (!drag.current || !imgRef.current) return;
    const p = frac(e);
    const { kind, sx, sy, start } = drag.current;
    const dx = p.x - sx;
    const dy = p.y - sy;
    if (kind === "move") {
      setBox(normalizeCrop({ ...start, x: start.x + dx, y: start.y + dy }));
      return;
    }
    let { x, y, w, h } = start;
    if (kind.includes("w")) {
      const nx = clamp(start.x + dx, 0, start.x + start.w - 0.05);
      w = start.x + start.w - nx;
      x = nx;
    }
    if (kind.includes("e")) w = clamp(start.w + dx, 0.05, 1 - start.x);
    if (kind.includes("n")) {
      const ny = clamp(start.y + dy, 0, start.y + start.h - 0.05);
      h = start.y + start.h - ny;
      y = ny;
    }
    if (kind.includes("s")) h = clamp(start.h + dy, 0.05, 1 - start.y);
    setBox(normalizeCrop({ x, y, w, h }));
  }

  return (
    <Modal title="裁剪图片" open={open} onCancel={onCancel} onOk={() => onOk(box)} okText="应用" cancelText="取消" width={740}>
      <div
        style={{ position: "relative", display: "inline-block", maxWidth: "100%", userSelect: "none" }}
        onMouseMove={onMove}
        onMouseUp={() => {
          drag.current = null;
        }}
        onMouseLeave={() => {
          drag.current = null;
        }}
      >
        <img ref={imgRef} src={src} alt="" style={{ maxWidth: 680, maxHeight: 440, display: "block" }} />
        <div
          style={{
            position: "absolute",
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
            border: "2px solid #1677ff",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
            cursor: "move",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            const p = frac(e);
            drag.current = { kind: "move", sx: p.x, sy: p.y, start: box };
          }}
        >
          {(["nw", "ne", "sw", "se"] as const).map((k) => (
            <div
              key={k}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const p = frac(e);
                drag.current = { kind: k, sx: p.x, sy: p.y, start: box };
              }}
              style={{
                position: "absolute",
                width: 10,
                height: 10,
                background: "#fff",
                border: "1px solid #1677ff",
                left: k.includes("w") ? -5 : undefined,
                right: k.includes("e") ? -5 : undefined,
                top: k.includes("n") ? -5 : undefined,
                bottom: k.includes("s") ? -5 : undefined,
                cursor: `${k}-resize`,
              }}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
