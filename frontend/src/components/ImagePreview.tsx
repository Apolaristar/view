import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  applyViewBoxDrag,
  clampPreviewZoom,
  fitImageView,
  imageViewport,
  minimapSize,
  minimapViewRect,
  pageRectFromViewBox,
  panFromMinimapDrag,
  panFromMinimapPoint,
  viewBoxFromPoints,
  viewPointFromScreen,
  type CropBox,
  type CropHandle,
} from "../imagePreview";
import { zoomToward } from "../boardMath";
import { capturePageRect } from "../desktop";

type Props = {
  open: boolean;
  src: string;
  width?: number;
  height?: number;
  startCrop?: boolean;
  onClose: () => void;
  onStartCropConsumed?: () => void;
  onAddToLibrary?: (dataUrl: string) => Promise<void>;
  onAddToBoard?: (dataUrl: string) => Promise<void>;
  screenshotBusy?: boolean;
};

const PAD = 12;
const MINI_MAX_W = 168;
const MINI_MAX_H = 120;
const HANDLES: CropHandle[] = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

type CropDrag =
  | { kind: "draw"; from: { x: number; y: number } }
  | { kind: CropHandle; from: { x: number; y: number }; start: CropBox };

export default function ImagePreview({
  open,
  src,
  width,
  height,
  startCrop,
  onClose,
  onStartCropConsumed,
  onAddToLibrary,
  onAddToBoard,
  screenshotBusy,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [hasBox, setHasBox] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, w: 0, h: 0 });
  const [confirming, setConfirming] = useState(false);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const fitRef = useRef(1);
  const natRef = useRef({ w: width || 1, h: height || 1 });
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const cropDrag = useRef<CropDrag | null>(null);
  const cropBoxRef = useRef(cropBox);
  const liveRef = useRef(true);
  const miniDrag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const miniScaleRef = useRef(1);
  const [stageBox, setStageBox] = useState({ w: 1, h: 1 });

  panRef.current = pan;
  zoomRef.current = zoom;
  cropBoxRef.current = cropBox;

  const fitToStage = useCallback((nw: number, nh: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    natRef.current = { w: Math.max(1, nw), h: Math.max(1, nh) };
    const view = fitImageView(nw, nh, stage.clientWidth, stage.clientHeight, PAD);
    fitRef.current = view.zoom;
    setZoom(view.zoom);
    setPan(view.pan);
  }, []);

  const beginCrop = useCallback(() => {
    cropDrag.current = null;
    setCropBox({ x: 0, y: 0, w: 0, h: 0 });
    setHasBox(false);
    setCropping(true);
  }, []);

  const endCrop = useCallback(() => {
    cropDrag.current = null;
    setCropping(false);
    setHasBox(false);
    setConfirming(false);
    setShooting(false);
  }, []);

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      endCrop();
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (cropping) endCrop();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cropping, onClose, endCrop]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      const img = imgRef.current;
      const nw = img?.naturalWidth || width || 0;
      const nh = img?.naturalHeight || height || 0;
      if (nw && nh) fitToStage(nw, nh);
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, src, width, height, fitToStage]);

  useEffect(() => {
    if (!open || !startCrop) return;
    beginCrop();
    onStartCropConsumed?.();
  }, [open, startCrop, beginCrop, onStartCropConsumed]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!open || !stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = stage.getBoundingClientRect();
      const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nextZoom = clampPreviewZoom(zoomRef.current * factor, fitRef.current);
      const next = zoomToward(pointer, panRef.current, zoomRef.current, nextZoom);
      setZoom(next.zoom);
      setPan(next.pan);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [open]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!open || !stage) return;
    const update = () => setStageBox({ w: stage.clientWidth, h: stage.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [open]);

  function stageSize() {
    const stage = stageRef.current;
    return { w: stage?.clientWidth || 1, h: stage?.clientHeight || 1 };
  }

  function pointFromEvent(e: PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current!.getBoundingClientRect();
    return viewPointFromScreen(e.clientX, e.clientY, stage);
  }

  function bumpZoom(factor: number) {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    const nextZoom = clampPreviewZoom(zoomRef.current * factor, fitRef.current);
    const next = zoomToward(pointer, panRef.current, zoomRef.current, nextZoom);
    setZoom(next.zoom);
    setPan(next.pan);
  }

  const nw = Math.max(1, natRef.current.w);
  const nh = Math.max(1, natRef.current.h);
  const mini = minimapSize(nw, nh, MINI_MAX_W, MINI_MAX_H);
  miniScaleRef.current = mini.scale;
  const miniView = minimapViewRect(imageViewport(pan, zoom, stageBox.w, stageBox.h), nw, nh, mini.scale);

  function imagePointFromMini(clientX: number, clientY: number, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const scale = miniScaleRef.current || 1;
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  }

  function onMiniPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || cropping) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    const local = { x: e.clientX - r.left, y: e.clientY - r.top };
    const inView =
      local.x >= miniView.x && local.x <= miniView.x + miniView.w && local.y >= miniView.y && local.y <= miniView.y + miniView.h;
    let startPan = panRef.current;
    if (!inView) {
      startPan = panFromMinimapPoint(imagePointFromMini(e.clientX, e.clientY, e.currentTarget), stageSize(), zoomRef.current);
      setPan(startPan);
    }
    miniDrag.current = { x: e.clientX, y: e.clientY, pan: startPan };
  }

  function onMiniPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = miniDrag.current;
    if (!drag) return;
    e.stopPropagation();
    setPan(panFromMinimapDrag(drag.pan, { x: e.clientX - drag.x, y: e.clientY - drag.y }, miniScaleRef.current, zoomRef.current));
  }

  function onMiniPointerUp(e: PointerEvent<HTMLDivElement>) {
    miniDrag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (cropping) {
      const handle = (e.target as HTMLElement).dataset.cropHandle as CropHandle | undefined;
      const onBox = (e.target as HTMLElement).closest(".pb-preview-crop");
      const p = pointFromEvent(e);
      if (handle && hasBox) cropDrag.current = { kind: handle, from: p, start: cropBoxRef.current };
      else if (onBox && hasBox) cropDrag.current = { kind: "move", from: p, start: cropBoxRef.current };
      else {
        const view = stageSize();
        cropDrag.current = { kind: "draw", from: p };
        setHasBox(true);
        setCropBox(viewBoxFromPoints(p, p, view.w, view.h));
      }
      return;
    }
    dragRef.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
    setDragging(true);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (cropping && cropDrag.current) {
      const p = pointFromEvent(e);
      const drag = cropDrag.current;
      const view = stageSize();
      if (drag.kind === "draw") setCropBox(viewBoxFromPoints(drag.from, p, view.w, view.h));
      else setCropBox(applyViewBoxDrag(drag.kind, drag.start, drag.from, p, view.w, view.h));
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    setPan({ x: drag.panX + (e.clientX - drag.x), y: drag.panY + (e.clientY - drag.y) });
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    cropDrag.current = null;
    dragRef.current = null;
    setDragging(false);
  }

  async function confirmCrop(dest: "library" | "board") {
    const action = dest === "library" ? onAddToLibrary : onAddToBoard;
    if (!action || !hasBox || confirming || screenshotBusy || !stageRef.current) return;
    setConfirming(true);
    setShooting(true);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      if (!liveRef.current || !stageRef.current) return;
      const dataUrl = await capturePageRect(pageRectFromViewBox(cropBoxRef.current, stageRef.current.getBoundingClientRect()));
      await action(dataUrl);
      if (liveRef.current) {
        setConfirming(false);
        setShooting(false);
        beginCrop();
      }
    } catch {
      if (liveRef.current) {
        setShooting(false);
        setConfirming(false);
      }
    }
  }

  if (!open || !src) return null;

  const busy = confirming || Boolean(screenshotBusy);
  const showBox = cropping && hasBox && !shooting;

  return createPortal(
    <div className={`pb-preview-overlay${shooting ? " is-shooting" : ""}`} role="dialog" aria-modal="true" aria-label="原图预览">
      <div
        ref={stageRef}
        className={`pb-preview-stage${dragging ? " is-drag" : ""}${cropping ? " is-crop" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => {
          if (!cropping) fitToStage(natRef.current.w, natRef.current.h);
        }}
      >
        <img
          ref={imgRef}
          className="pb-preview-img"
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => fitToStage(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        />
        {showBox ? (
          <div
            className="pb-preview-crop"
            style={{ left: cropBox.x, top: cropBox.y, width: cropBox.w, height: cropBox.h }}
          >
            {HANDLES.map((handle) => (
              <span key={handle} className={`pb-preview-handle is-${handle}`} data-crop-handle={handle} />
            ))}
          </div>
        ) : null}
      </div>
      <div
        className="pb-preview-mini"
        title="鸟瞰图，拖动可定位"
        style={{ width: mini.w, height: mini.h }}
        onPointerDown={onMiniPointerDown}
        onPointerMove={onMiniPointerMove}
        onPointerUp={onMiniPointerUp}
        onPointerCancel={onMiniPointerUp}
      >
        <img src={src} alt="" draggable={false} />
        <span
          className="pb-preview-mini-view"
          style={{ left: miniView.x, top: miniView.y, width: miniView.w, height: miniView.h }}
        />
      </div>
      <button type="button" className="pb-preview-close" aria-label="关闭预览" onClick={onClose}>
        ×
      </button>
      <div className="pb-preview-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => bumpZoom(1 / 1.2)} aria-label="缩小">
          −
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => bumpZoom(1.2)} aria-label="放大">
          +
        </button>
        <button type="button" onClick={() => fitToStage(natRef.current.w, natRef.current.h)}>
          适应
        </button>
        {(onAddToLibrary || onAddToBoard) && !cropping ? (
          <button type="button" title="截取预览界面 Ctrl+Shift+S" onClick={beginCrop}>
            截图
          </button>
        ) : null}
        {cropping ? (
          <>
            <button type="button" disabled={busy} onClick={endCrop}>
              取消
            </button>
            {onAddToLibrary ? (
              <button type="button" className="is-ok" disabled={busy || !hasBox} onClick={() => void confirmCrop("library")}>
                {busy ? "加入中" : "加入图库"}
              </button>
            ) : null}
            {onAddToBoard ? (
              <button type="button" disabled={busy || !hasBox} onClick={() => void confirmCrop("board")}>
                {busy ? "加入中" : "加入画板"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="pb-preview-hint">
        {cropping
          ? hasBox
            ? "可继续框选截取 · 拖边角缩放 · Esc 取消截取"
            : "在预览界面拖拽框选范围 · Esc 取消"
          : "滚轮缩放 · 拖拽移动 · 双击适应 · Ctrl+Shift+S 截图 · Esc 关闭"}
      </p>
    </div>,
    document.body
  );
}
