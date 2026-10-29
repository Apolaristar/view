import { useEffect, useRef, useState } from "react";
import { sourceCrop, type CropBox, zoomToward, clampZoom } from "../boardMath";

type SoloCard = {
  width: number;
  height: number;
  rotation: number;
  flipped: boolean;
  grayscale: boolean;
  crop: CropBox;
  htmlImage?: HTMLImageElement;
};

export default function SoloView({
  card,
  boardGray,
  size,
}: {
  card: SoloCard;
  boardGray?: boolean;
  size: { w: number; h: number };
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  const img = card.htmlImage;
  const dispW = Math.max(1, card.width);
  const dispH = Math.max(1, card.height);

  useEffect(() => {
    const pad = 24;
    const fit = Math.min((size.w - pad * 2) / dispW, (size.h - pad * 2) / dispH, 8);
    const z = Math.max(0.05, fit);
    setZoom(z);
    setPan({ x: (size.w - dispW * z) / 2, y: (size.h - dispH * z) / 2 });
  }, [card, dispW, dispH, size.w, size.h]);

  const crop =
    img && img.naturalWidth ? sourceCrop(img.naturalWidth, img.naturalHeight, card.crop) : undefined;

  return (
    <div
      ref={wrapRef}
      className="pb-solo"
      onWheel={(e) => {
        e.preventDefault();
        const rect = wrapRef.current?.getBoundingClientRect();
        const pointer = {
          x: e.clientX - (rect?.left || 0),
          y: e.clientY - (rect?.top || 0),
        };
        const nextZoom = clampZoom(zoomRef.current * (e.deltaY > 0 ? 0.9 : 1.1), 0.05, 16);
        const next = zoomToward(pointer, panRef.current, zoomRef.current, nextZoom);
        setZoom(next.zoom);
        setPan(next.pan);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (!start) return;
        setPan({ x: start.panX + e.clientX - start.x, y: start.panY + e.clientY - start.y });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      <div
        className="pb-solo-card"
        style={{
          width: dispW,
          height: dispH,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${card.rotation}deg) scaleX(${card.flipped ? -1 : 1})`,
          filter: card.grayscale || boardGray ? "grayscale(1)" : undefined,
        }}
      >
        {img ? (
          <canvas
            width={Math.max(1, Math.round(dispW))}
            height={Math.max(1, Math.round(dispH))}
            ref={(node) => {
              if (!node || !img?.naturalWidth) return;
              const ctx = node.getContext("2d");
              if (!ctx) return;
              ctx.clearRect(0, 0, node.width, node.height);
              if (crop) ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, node.width, node.height);
              else ctx.drawImage(img, 0, 0, node.width, node.height);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
