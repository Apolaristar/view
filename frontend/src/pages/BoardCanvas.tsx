import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Dropdown, Empty, Input, InputNumber, Select, Slider, Switch, message } from "antd";
import { Layer, Rect, Stage, Image as KImage, Transformer } from "react-konva";
import Konva from "konva";
import { useBoard, useBoards } from "../api/hooks";
import { mediaUrl, request, subscribeSoloStep, subscribeTools, windowDragBegin, windowDragEnd, windowSetTools } from "../api/client";
import CropDialog from "../components/CropDialog";
import MediaImg from "../components/MediaImg";
import SoloView from "../components/SoloView";
import { useFocusMode } from "../components/FocusMode";
import { useQueryClient } from "@tanstack/react-query";
import { indicesInMarquee, marqueeRect, packInView, viewAsBoard } from "../boardAlign";
import { expandGroupIndices, newGroupId, pruneGroups, setGroupOn, setLockedOn } from "../boardGroup";
import { hitCardIndex, sampleCardColor, type ColorSample } from "../boardColor";
import { cardsCenter, centerOn, clampZoom, fitCards, moveIndex, resetCardToOriginal, rotateDelta, screenToWorld, sourceCrop, zoomToward, type CropBox } from "../boardMath";
import { renderBoardPreview, renderBoardViewport, renderSoloViewport } from "../boardPreview";
import { filesFromDataTransfer, isIngestableFile, nativeFilePath, planBoardDrop, classifyImportUrl } from "../boardIngest";
import { cancelScreenshot, clipboardIngest, copyText, downloadImageUrl, saveDataUrl, writeTempDataUrl } from "../desktop";
import { importImagesFromPaths, importScreenshotImage, isEditableHotkeyTarget, isScreenshotHotkey, ScreenshotCanceledError } from "../screenshotImport";
import { clampPopup } from "../popupPlace";
import { isWindowMoveGesture } from "../windowDrag";
import {
  clampSketchSeconds,
  formatSketchClock,
  parseStoredSketchSeconds,
  sketchAdvance,
  sketchRemainSeconds,
  sketchStartIndex,
  SKETCH_SEC_MAX,
  SKETCH_SEC_MIN,
} from "../boardSketch";
import type { Board } from "../types";

const ROTATE_HANDLE_SCALE = 2.5;

let rotateIconCanvas: HTMLCanvasElement | null = null;
let rotateCursorCss: string | null = null;

function drawRotateArrow(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  stroke: number,
  color: string
) {
  const end = Math.PI * 1.12;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = stroke;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.arc(cx, cy, radius, -Math.PI * 0.12, end);
  g.stroke();
  const ex = cx + radius * Math.cos(end);
  const ey = cy + radius * Math.sin(end);
  const ang = end + Math.PI / 2;
  const ah = Math.max(6, radius * 0.55);
  g.beginPath();
  g.moveTo(ex, ey);
  g.lineTo(ex - ah * Math.cos(ang - 0.5), ey - ah * Math.sin(ang - 0.5));
  g.lineTo(ex - ah * Math.cos(ang + 0.95), ey - ah * Math.sin(ang + 0.95));
  g.closePath();
  g.fill();
}

function getRotateIcon() {
  if (rotateIconCanvas) return rotateIconCanvas;
  const s = 80;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  if (!g) return c;
  const cx = s / 2;
  const cy = s / 2;
  const r = s / 2 - 4;
  g.fillStyle = "#fff";
  g.strokeStyle = "#3b6cff";
  g.lineWidth = 5;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  drawRotateArrow(g, cx, cy, r * 0.46, 6, "#3b6cff");
  rotateIconCanvas = c;
  return c;
}

function getRotateCursor() {
  if (rotateCursorCss) return rotateCursorCss;
  const s = 32;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  if (!g) return "crosshair";
  drawRotateArrow(g, 16, 16, 9, 5, "#fff");
  drawRotateArrow(g, 16, 16, 9, 2.4, "#1c1f26");
  rotateCursorCss = `url(${c.toDataURL("image/png")}) 16 16, crosshair`;
  return rotateCursorCss;
}

function IconClickThrough() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect
        x="1.3"
        y="1.3"
        width="11.4"
        height="11.4"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeDasharray="2.4 1.5"
      />
      <path d="M4.5 3.1l.12 7.15 1.9-1.72 1.12 2.52 1.32-.58-1.12-2.48 2.38-.12z" fill="currentColor" />
    </svg>
  );
}

function IconExit() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3.2h4.2V2H2.2v10h5V10.8H3z" fill="currentColor" />
      <path d="M6.2 7h5.2M9.2 5l2.2 2-2.2 2" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M8.7 2.1l3.2 3.2-1.7.3-2.6 2.6-.9-.9 2.6-2.6.3-1.7z" fill="currentColor" />
      <path d="M6.4 8.4L3 12.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconLock({ open }: { open?: boolean }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2.6" y="6.4" width="8.8" height="5.6" rx="1.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.6 6.4V4.7a2.4 2.4 0 0 1 4.6-.7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2.6" y="6.4" width="8.8" height="5.6" rx="1.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.6 6.4V4.6a2.4 2.4 0 0 1 4.8 0V6.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconSolo() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2.2" y="2.2" width="9.6" height="9.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconBoard() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="1.8" y="1.8" width="4.4" height="4.4" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <rect x="7.8" y="1.8" width="4.4" height="4.4" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <rect x="1.8" y="7.8" width="4.4" height="4.4" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <rect x="7.8" y="7.8" width="4.4" height="4.4" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}

function IconPack() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 3.2h10M2 7h10M2 10.8h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconCards() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2" y="3.2" width="7.2" height="7.6" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.15" />
      <path d="M10.4 4.6h1.4v7.2H5.8" fill="none" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}

function IconExport() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 2v7" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <path d="M4.4 6.6 7 9.2l2.6-2.6" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11.4h8" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconSketch() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5.1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 3.6v3.4l2.2 1.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSketchStop() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="3.6" y="3.6" width="6.8" height="6.8" rx="1.1" fill="currentColor" />
    </svg>
  );
}

function IconBtn({
  title,
  on,
  disabled,
  onClick,
  children,
}: {
  title: string;
  on?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`pb-icon-btn${on ? " is-on" : ""}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function styleBoardAnchor(anchor: Konva.Rect) {
  if (!anchor.hasName("rotater")) return;
  const size = Math.max(8, anchor.width()) * ROTATE_HANDLE_SCALE;
  const icon = getRotateIcon();
  anchor.setAttrs({
    width: size,
    height: size,
    offsetX: size / 2,
    offsetY: size / 2,
    cornerRadius: size / 2,
    strokeEnabled: false,
    fillPriority: "pattern",
    fillPatternImage: icon,
    fillPatternRepeat: "no-repeat",
    fillPatternScaleX: size / icon.width,
    fillPatternScaleY: size / icon.height,
    fillPatternOffsetX: 0,
    fillPatternOffsetY: 0,
    perfectDrawEnabled: false,
    hitStrokeWidth: size,
  });
}

type Card = {
  id?: number;
  image_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  rotation: number;
  crop: CropBox;
  flipped: boolean;
  grayscale: boolean;
  locked: boolean;
  group_id: string | null;
  originalUrl: string;
  thumbUrl: string;
  naturalWidth?: number;
  naturalHeight?: number;
  htmlImage?: HTMLImageElement;
};

function loadHtmlImage(primary: string, fallback: string, onReady: () => void) {
  const html = new window.Image();
  html.onload = onReady;
  html.onerror = () => {
    if (fallback && html.src !== fallback) html.src = fallback;
  };
  html.src = primary;
  return html;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读文件失败"));
    reader.readAsDataURL(file);
  });
}

async function fileToImportPath(file: File): Promise<string> {
  const native = nativeFilePath(file);
  if (native) return native;
  const dataUrl = await readFileAsDataUrl(file);
  const saved = await writeTempDataUrl(dataUrl);
  if (!saved?.ok || !saved.path) throw new Error(saved?.error || "无法保存拖入的图片");
  return saved.path;
}

export default function BoardCanvasPage({
  onSaveStatus,
}: {
  onSaveStatus: (s: "idle" | "saving" | "saved" | "failed") => void;
}) {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data } = useBoard(id);
  const boards = useBoards();
  const { focus, pinned, fullscreen, locked, opacity, clickThrough, setFocus, setPinned, setFullscreen, setLocked, setOpacity, setClickThrough } = useFocusMode();
  const [cards, setCards] = useState<Card[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [space, setSpace] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [keepRatio, setKeepRatio] = useState(() => localStorage.getItem("pb-keep-ratio") !== "0");
  const [boardGray, setBoardGray] = useState(false);
  const [picking, setPicking] = useState(false);
  const [lastColor, setLastColor] = useState<ColorSample | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number; add: boolean } | null>(null);
  const [groupEdit, setGroupEdit] = useState<string | null>(null);
  const [soloImageId, setSoloImageId] = useState<number | null>(null);
  const lastSoloRef = useRef<number | null>(null);
  const soloImageIdRef = useRef<number | null>(null);
  const [sketchSeconds, setSketchSeconds] = useState(() => parseStoredSketchSeconds(localStorage.getItem("pb-sketch-seconds")));
  const [sketching, setSketching] = useState(false);
  const [sketchIdx, setSketchIdx] = useState(0);
  const [sketchEndsAt, setSketchEndsAt] = useState<number | null>(null);
  const [sketchDone, setSketchDone] = useState(false);
  const [, setSketchPulse] = useState(0);
  const sketchingRef = useRef(false);
  const sketchIdxRef = useRef(0);
  const sketchEndsAtRef = useRef<number | null>(null);
  const sketchSecondsRef = useRef(sketchSeconds);
  const sketchDoneRef = useRef(false);
  const edgeOpenRef = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);
  const captureToBoardRef = useRef<() => Promise<void>>(async () => undefined);
  const ingestPasteRef = useRef<(e: ClipboardEvent) => void>(() => undefined);
  const ingestingRef = useRef(false);
  const exportingRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [altHeld, setAltHeld] = useState(false);
  const [stageSize, setStageSize] = useState({ w: 800, h: 480 });
  const [tick, setTick] = useState(0);
  const trRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);
  const loadedBoard = useRef<string | null>(null);
  const skipTrayClick = useRef(false);
  const layerDrag = useRef<number | null>(null);
  const [layerDrop, setLayerDrop] = useState<number | null>(null);
  const cardsRef = useRef(cards);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const selectedRef = useRef(selected);
  const boardGrayRef = useRef(boardGray);
  const pickingRef = useRef(picking);
  const dragOrigin = useRef<{ x: number; y: number }[] | null>(null);
  const dragFrom = useRef<{ x: number; y: number; index: number } | null>(null);
  const stageSizeRef = useRef(stageSize);
  const nameDraftRef = useRef(nameDraft);
  cardsRef.current = cards;
  panRef.current = pan;
  zoomRef.current = zoom;
  selectedRef.current = selected;
  boardGrayRef.current = boardGray;
  pickingRef.current = picking;
  soloImageIdRef.current = soloImageId;
  sketchingRef.current = sketching;
  sketchIdxRef.current = sketchIdx;
  sketchEndsAtRef.current = sketchEndsAt;
  sketchSecondsRef.current = sketchSeconds;
  sketchDoneRef.current = sketchDone;
  edgeOpenRef.current = edgeOpen;
  stageSizeRef.current = stageSize;
  nameDraftRef.current = nameDraft;

  function redraw() {
    setTick((n) => n + 1);
    stageRef.current?.batchDraw();
  }

  useEffect(() => {
    loadedBoard.current = null;
    setCards([]);
    setSelected([]);
    setBoardGray(false);
    setPicking(false);
    setSoloImageId(null);
    setSketching(false);
    setSketchEndsAt(null);
    setSketchDone(false);
    if (id) sessionStorage.setItem("lastBoardId", String(id));
  }, [id]);

  const liveName = (boards.data || []).find((b) => String(b.id) === String(id))?.name || data?.name || "";
  useEffect(() => {
    setNameDraft(liveName);
  }, [id, liveName]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const timer = window.setTimeout(() => window.addEventListener("mousedown", close), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", close);
    };
  }, [ctxMenu]);

  useEffect(() => {
    if (!focus) {
      setEdgeOpen(false);
      return;
    }
    return subscribeTools(setEdgeOpen);
  }, [focus]);

  useLayoutEffect(() => {
    const el = ctxMenuRef.current;
    if (!ctxMenu || !el) return;
    const next = clampPopup(
      { x: ctxMenu.x, y: ctxMenu.y },
      { w: el.offsetWidth, h: el.offsetHeight },
      { w: window.innerWidth, h: window.innerHeight }
    );
    if (next.x !== ctxMenu.x || next.y !== ctxMenu.y) {
      el.style.left = `${next.x}px`;
      el.style.top = `${next.y}px`;
    }
  }, [ctxMenu]);

  useEffect(() => {
    const idx = selected[0];
    if (selected.length !== 1 || cards[idx]?.locked) {
      trRef.current?.nodes([]);
      trRef.current?.getLayer()?.batchDraw();
    }
  }, [selected, cards]);

  useEffect(() => {
    if (!marquee) return;
    const move = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, panRef.current, zoomRef.current);
      setMarquee((cur) => (cur ? { ...cur, x2: world.x, y2: world.y } : cur));
    };
    const up = () => {
      setMarquee((cur) => {
        if (!cur) return null;
        const box = marqueeRect({ x: cur.x1, y: cur.y1 }, { x: cur.x2, y: cur.y2 });
        const hit = indicesInMarquee(cardsRef.current, box);
        if (hit.length) {
          setSelected(cur.add ? Array.from(new Set([...selectedRef.current, ...hit])) : hit);
        } else if (!cur.add) {
          setSelected([]);
        }
        return null;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [marquee]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setStageSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [focus, data]);

  useEffect(() => {
    return () => {
      void setFocus(false);
      void setPinned(false);
    };
  }, []);

  useEffect(() => {
    if (!data || String(data.id) !== String(id)) return;
    if (loadedBoard.current === String(data.id)) return;
    loadedBoard.current = String(data.id);
    setPan({ x: data.pan_x, y: data.pan_y });
    setZoom(data.zoom || 1);
    setBoardGray(Boolean(data.grayscale));
    const loaded: Card[] = (data.items || []).map((it, idx) => {
      const originalUrl = mediaUrl(it.image.original_url);
      const thumbUrl = mediaUrl(it.image.thumbnail_url);
      return {
        id: it.id,
        image_id: it.image_id,
        x: it.x,
        y: it.y,
        width: it.width,
        height: it.height,
        z_index: it.z_index ?? idx,
        rotation: it.rotation || 0,
        crop: {
          x: it.crop_x ?? 0,
          y: it.crop_y ?? 0,
          w: it.crop_w ?? 1,
          h: it.crop_h ?? 1,
        },
        flipped: Boolean(it.flipped),
        grayscale: Boolean(it.grayscale),
        locked: Boolean(it.locked),
        group_id: it.group_id || null,
        originalUrl,
        thumbUrl,
        naturalWidth: it.image.width,
        naturalHeight: it.image.height,
        htmlImage: loadHtmlImage(originalUrl, thumbUrl, redraw),
      };
    });
    setCards(loaded);
  }, [id, data]);

  useEffect(() => {
    if (!id || loadedBoard.current !== String(id)) return;
    if (!cards.length) return;
    if (!cards.some((c) => c.htmlImage?.naturalWidth)) return;
    const timer = window.setTimeout(() => void uploadPreview(cardsRef.current), 400);
    return () => window.clearTimeout(timer);
  }, [id, tick, cards.length]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Alt") setAltHeld(true);
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSpace(true);
      }
      if (e.key === "Escape") {
        if (capturingRef.current) {
          e.preventDefault();
          void cancelScreenshot();
          return;
        }
        if (pickingRef.current) {
          e.preventDefault();
          setPicking(false);
          return;
        }
        if (edgeOpenRef.current) {
          e.preventDefault();
          void windowSetTools(false);
          setEdgeOpen(false);
          return;
        }
        if (sketchDoneRef.current) {
          e.preventDefault();
          setSketchDone(false);
          return;
        }
        if (sketchingRef.current || soloImageId != null) {
          e.preventDefault();
          leaveSolo();
          return;
        }
        if (groupEdit) {
          e.preventDefault();
          setGroupEdit(null);
          return;
        }
        if (fullscreen) void setFullscreen(false);
        else void setFocus(false);
      }
      if (e.key === "F11" && focus) {
        e.preventDefault();
        void setFullscreen(!fullscreen);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current.length && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        const drop = new Set(selectedRef.current);
        setCards((cs) => {
          const next = pruneGroups(cs.filter((_, i) => !drop.has(i)));
          scheduleSave(next, panRef.current, zoomRef.current);
          return next;
        });
        setSelected([]);
      }
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        goToCenter();
      }
      if (e.key === "1" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        showAll();
      }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && soloImageIdRef.current != null && !(e.ctrlKey || e.metaKey || e.altKey) && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        stepSolo(e.key === "ArrowRight" ? 1 : -1);
      }
      if (isScreenshotHotkey(e) && !isEditableHotkeyTarget(e.target)) {
        e.preventDefault();
        void captureToBoardRef.current();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
      if (e.key === "Alt") setAltHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const paste = (e: ClipboardEvent) => ingestPasteRef.current(e);
    window.addEventListener("paste", paste);
    const blur = () => {
      setAltHeld(false);
      setSpace(false);
    };
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("paste", paste);
      window.removeEventListener("blur", blur);
    };
  }, [focus, fullscreen, setFocus, setFullscreen, soloImageId, groupEdit]);

  function scheduleSave(nextCards = cardsRef.current, nextPan = panRef.current, nextZoom = zoomRef.current) {
    onSaveStatus("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await request(`/api/v1/boards/${id}/layout`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pan_x: nextPan.x,
            pan_y: nextPan.y,
            zoom: nextZoom,
            grayscale: boardGrayRef.current,
            items: nextCards.map((c, i) => ({
              image_id: c.image_id,
              x: c.x,
              y: c.y,
              width: c.width,
              height: c.height,
              z_index: i,
              rotation: c.rotation,
              crop_x: c.crop.x,
              crop_y: c.crop.y,
              crop_w: c.crop.w,
              crop_h: c.crop.h,
              flipped: c.flipped,
              grayscale: c.grayscale,
              locked: c.locked,
              group_id: c.group_id,
            })),
          }),
        });
        onSaveStatus("saved");
        void uploadPreview(nextCards);
        qc.invalidateQueries({ queryKey: ["boards"] });
        qc.invalidateQueries({ queryKey: ["home"] });
      } catch {
        onSaveStatus("failed");
      }
    }, 500);
  }

  async function uploadPreview(nextCards = cardsRef.current) {
    if (!id) return;
    try {
      const image = renderBoardPreview(nextCards);
      if (!image) {
        if (!nextCards.length) {
          await request(`/api/v1/boards/${id}/preview`, { method: "DELETE" });
          qc.invalidateQueries({ queryKey: ["boards"] });
          qc.invalidateQueries({ queryKey: ["home"] });
        }
        return;
      }
      await request(`/api/v1/boards/${id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      qc.invalidateQueries({ queryKey: ["boards"] });
      qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      /* preview is best-effort */
    }
  }

  async function ensureTray(imageIds: number | number[]) {
    const ids = (Array.isArray(imageIds) ? imageIds : [imageIds]).filter((n) => Number.isFinite(n));
    if (!ids.length || !id) return;
    await request(`/api/v1/boards/${id}/tray`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: ids }),
    });
    qc.invalidateQueries({ queryKey: ["board", String(id)] });
    qc.invalidateQueries({ queryKey: ["boards"] });
  }

  function addImages(
    images: { id: number; original_url: string; thumbnail_url: string; width?: number; height?: number }[],
    origin = { x: 80, y: 80 }
  ) {
    if (!images.length) return;
    const next = [...cardsRef.current];
    images.forEach((image, i) => {
      const originalUrl = mediaUrl(image.original_url);
      const thumbUrl = mediaUrl(image.thumbnail_url);
      const width = 320;
      const height = image.width && image.height ? (320 * image.height) / image.width : 320;
      next.push({
        image_id: image.id,
        x: origin.x + i * 36,
        y: origin.y + i * 36,
        width,
        height,
        z_index: next.length,
        rotation: 0,
        crop: { x: 0, y: 0, w: 1, h: 1 },
        flipped: false,
        grayscale: false,
        locked: false,
        group_id: null,
        originalUrl,
        thumbUrl,
        naturalWidth: image.width,
        naturalHeight: image.height,
        htmlImage: loadHtmlImage(originalUrl, thumbUrl, redraw),
      });
    });
    cardsRef.current = next;
    setCards(next);
    scheduleSave(next, panRef.current, zoomRef.current);
    void ensureTray(images.map((img) => img.id));
    setSelected([next.length - 1]);
    const last = images[images.length - 1];
    if (soloImageIdRef.current != null && last && !sketchingRef.current) {
      lastSoloRef.current = last.id;
      setSoloImageId(last.id);
    }
  }

  function addImage(
    image: { id: number; original_url: string; thumbnail_url: string; width?: number; height?: number },
    x = 80,
    y = 80
  ) {
    addImages([image], { x, y });
  }

  function dropOrigin(clientX?: number, clientY?: number) {
    const size = stageSizeRef.current;
    const wrap = wrapRef.current;
    if (typeof clientX === "number" && typeof clientY === "number" && wrap) {
      const rect = wrap.getBoundingClientRect();
      return screenToWorld(clientX - rect.left, clientY - rect.top, panRef.current, zoomRef.current);
    }
    return screenToWorld(size.w / 2, size.h / 2, panRef.current, zoomRef.current);
  }

  function handleBoardDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (ingestingRef.current) return;
    const files = filesFromDataTransfer(e.dataTransfer);
    const json = e.dataTransfer.getData("application/json");
    const text = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (String(json || text).startsWith("layer:")) return;
    const plan = planBoardDrop({ hasImageFiles: files.length > 0, json, text });
    const world = dropOrigin(e.clientX, e.clientY);
    if (plan.kind === "tray") {
      addImage(plan.image, world.x - 160, world.y - 160);
      return;
    }
    if (plan.kind === "page") {
      message.warning("请拖图片本身，不要拖网页链接");
      return;
    }
    if (plan.kind === "none") {
      message.info("把图片拖进来");
      return;
    }
    ingestingRef.current = true;
    const run = plan.kind === "files" ? ingestFiles(files, world) : ingestUrls(plan.urls, world);
    void run.finally(() => {
      ingestingRef.current = false;
    });
  }

  async function ingestPaths(paths: string[], world?: { x: number; y: number }) {
    if (!paths.length) return;
    const hide = message.loading("正在导入到画板…", 0);
    try {
      const { items, failed } = await importImagesFromPaths(paths);
      if (!items.length) {
        message.error("没有导入到图片");
        return;
      }
      const origin = world || dropOrigin();
      addImages(items, { x: origin.x - 160, y: origin.y - 160 });
      qc.invalidateQueries({ queryKey: ["images"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      message.success(items.length > 1 ? `已放入 ${items.length} 张` : "已放到画板");
      if (failed) message.warning(`${failed} 张导入失败`);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      hide();
    }
  }

  async function ingestFiles(files: File[], world?: { x: number; y: number }) {
    const paths: string[] = [];
    for (const file of files) {
      if (!isIngestableFile(file)) continue;
      paths.push(await fileToImportPath(file));
    }
    if (!paths.length) {
      message.info("把图片拖进来");
      return;
    }
    await ingestPaths(paths, world);
  }

  async function ingestUrls(urls: string[], world?: { x: number; y: number }) {
    const paths: string[] = [];
    for (const url of urls) {
      const kind = classifyImportUrl(url);
      if (kind !== "image") continue;
      if (/^data:image\//i.test(url)) {
        const saved = await writeTempDataUrl(url);
        if (!saved?.ok || !saved.path) throw new Error(saved?.error || "无法保存图片");
        paths.push(saved.path);
      } else {
        paths.push(await downloadImageUrl(url));
      }
    }
    if (!paths.length) {
      message.warning("请拖图片本身，不要拖网页链接");
      return;
    }
    await ingestPaths(paths, world);
  }

  async function ingestClipboardEvent(e: ClipboardEvent) {
    if (isEditableHotkeyTarget(e.target) || ingestingRef.current) return;
    e.preventDefault();
    ingestingRef.current = true;
    try {
      const files = filesFromDataTransfer(e.clipboardData);
      if (files.length) {
        await ingestFiles(files);
        return;
      }
      const text = (e.clipboardData?.getData("text/uri-list") || e.clipboardData?.getData("text/plain") || "").trim();
      if (text) {
        const plan = planBoardDrop({ text });
        if (plan.kind === "page") {
          message.warning("请拖图片本身，不要拖网页链接");
          return;
        }
        if (plan.kind === "urls") {
          await ingestUrls(plan.urls);
          return;
        }
      }
      const clip = await clipboardIngest();
      if (clip?.kind === "image" && clip.path) {
        await ingestPaths([clip.path]);
        return;
      }
      if (clip?.kind === "text" && clip.text) {
        const plan = planBoardDrop({ text: clip.text });
        if (plan.kind === "page") message.warning("请拖图片本身，不要拖网页链接");
        else if (plan.kind === "urls") await ingestUrls(plan.urls);
        else message.info("剪贴板里没有图片");
        return;
      }
      message.info(clip?.error || "剪贴板里没有图片");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      ingestingRef.current = false;
    }
  }
  ingestPasteRef.current = ingestClipboardEvent;

  async function exportViewport() {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      const size = stageSizeRef.current;
      const solo =
        soloImageIdRef.current != null
          ? cardsRef.current.find((c) => c.image_id === soloImageIdRef.current) || null
          : null;
      const png = solo
        ? renderSoloViewport(solo, size, boardGrayRef.current)
        : renderBoardViewport(cardsRef.current, {
            w: size.w,
            h: size.h,
            pan: panRef.current,
            zoom: zoomRef.current,
            boardGray: boardGrayRef.current,
          });
      if (!png) {
        message.error(cardsRef.current.length ? "图还没加载完，稍后再导出" : "画板上没有图");
        return;
      }
      const name = `${(nameDraftRef.current || "画板").replace(/[\\/:*?"<>|]/g, "_")}.png`;
      const ok = await saveDataUrl(name, png, "导出画板");
      if (ok) message.success("已导出 PNG");
    } catch {
      message.error("导出失败");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  async function captureToBoard() {
    if (capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    const hide = message.loading("框选要截的区域，完成后会放到画板中央", 0);
    try {
      const item = await importScreenshotImage();
      const world = screenToWorld(stageSize.w / 2, stageSize.h / 2, panRef.current, zoomRef.current);
      addImage(item, world.x - 160, world.y - 160);
      qc.invalidateQueries({ queryKey: ["images"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      message.success("已放到画板");
    } catch (err: unknown) {
      if (err instanceof ScreenshotCanceledError) message.info(err.message);
      else message.error(err instanceof Error ? err.message : "截图失败");
    } finally {
      hide();
      capturingRef.current = false;
      setCapturing(false);
    }
  }
  captureToBoardRef.current = captureToBoard;

  function showAll() {
    const view = fitCards(cardsRef.current, stageSize);
    setPan(view.pan);
    setZoom(view.zoom);
    scheduleSave(cardsRef.current, view.pan, view.zoom);
  }

  function goToCenter() {
    const next = centerOn(cardsCenter(cardsRef.current), stageSize, zoomRef.current);
    setPan(next);
    scheduleSave(cardsRef.current, next, zoomRef.current);
  }

  function applyZoomPercent(percent: number) {
    const nextZoom = clampZoom(percent / 100);
    const next = zoomToward(
      { x: stageSize.w / 2, y: stageSize.h / 2 },
      panRef.current,
      zoomRef.current,
      nextZoom
    );
    setZoom(next.zoom);
    setPan(next.pan);
    scheduleSave(cardsRef.current, next.pan, next.zoom);
  }

  function removeFromCanvas(index: number) {
    const next = pruneGroups(cardsRef.current.filter((_, i) => i !== index));
    setCards(next);
    setSelected([]);
    setCtxMenu(null);
    scheduleSave(next, panRef.current, zoomRef.current);
  }

  function moveLayer(index: number, where: "front" | "back") {
    reorderCards(index, where === "front" ? cardsRef.current.length - 1 : 0);
    setCtxMenu(null);
  }

  function reorderCards(from: number, to: number) {
    const currentCards = cardsRef.current;
    const next = moveIndex(currentCards, from, to);
    if (next === currentCards) return;
    const selectedCards = selected.map((i) => currentCards[i]).filter(Boolean);
    setCards(next);
    if (selectedCards.length) {
      setSelected(selectedCards.map((card) => next.indexOf(card)).filter((i) => i >= 0));
    }
    scheduleSave(next, panRef.current, zoomRef.current);
  }

  function locateCard(index: number) {
    const card = cardsRef.current[index];
    if (!card) return;
    const nextPan = {
      x: stageSize.w / 2 - (card.x + card.width / 2) * zoomRef.current,
      y: stageSize.h / 2 - (card.y + card.height / 2) * zoomRef.current,
    };
    setPan(nextPan);
    setSelected([index]);
    scheduleSave(cardsRef.current, nextPan, zoomRef.current);
  }

  function locateOrPlace(img: { id: number; original_url: string; thumbnail_url: string; width?: number; height?: number }) {
    const idx = cardsRef.current.findIndex((c) => c.image_id === img.id);
    if (idx >= 0) {
      locateCard(idx);
      return;
    }
    const world = screenToWorld(stageSize.w / 2, stageSize.h / 2, panRef.current, zoomRef.current);
    addImage(img, world.x - 160, world.y - 160);
  }

  function updateSelected(patch: Partial<Card> | ((card: Card) => Card)) {
    const targets = selectedRef.current;
    if (!targets.length) return;
    const pick = new Set(targets);
    const next = cardsRef.current.map((item, idx) => {
      if (!pick.has(idx)) return item;
      return typeof patch === "function" ? patch(item) : { ...item, ...patch };
    });
    setCards(next);
    scheduleSave(next, panRef.current, zoomRef.current);
  }

  function boardBox() {
    return viewAsBoard(stageSize, panRef.current, zoomRef.current);
  }

  function groupSelection() {
    const indices = selectedRef.current;
    if (indices.length < 2) return;
    const next = pruneGroups(setGroupOn(cardsRef.current, indices, newGroupId()));
    setCards(next);
    setGroupEdit(null);
    scheduleSave(next, panRef.current, zoomRef.current);
  }

  function ungroupSelection() {
    const indices = selectedRef.current;
    if (!indices.length) return;
    const ids = new Set(indices.map((i) => cardsRef.current[i]?.group_id).filter(Boolean) as string[]);
    let next = cardsRef.current;
    for (const gid of ids) next = setGroupOn(next, next.map((c, i) => (c.group_id === gid ? i : -1)).filter((i) => i >= 0), null);
    next = pruneGroups(next);
    setCards(next);
    setGroupEdit(null);
    scheduleSave(next, panRef.current, zoomRef.current);
  }

  function toggleLock() {
    const indices = selectedRef.current;
    if (!indices.length) return;
    const allLocked = indices.every((i) => cardsRef.current[i]?.locked);
    const next = setLockedOn(cardsRef.current, indices, !allLocked);
    setCards(next);
    scheduleSave(next, panRef.current, zoomRef.current);
  }

  function enterSolo(index?: number) {
    const cardsNow = cardsRef.current;
    let idx = index;
    if (idx == null && selectedRef.current.length) idx = selectedRef.current[0];
    if (idx == null || idx < 0) idx = cardsNow.findIndex((c) => c.image_id === lastSoloRef.current);
    if (idx == null || idx < 0) idx = cardsNow.length - 1;
    const card = cardsNow[idx];
    if (!card) return;
    lastSoloRef.current = card.image_id;
    setSoloImageId(card.image_id);
  }

  function leaveSolo() {
    stopSketch();
    setSketchDone(false);
    setSoloImageId(null);
  }

  function rememberSketchSeconds(value: unknown) {
    const sec = clampSketchSeconds(value);
    setSketchSeconds(sec);
    sketchSecondsRef.current = sec;
    localStorage.setItem("pb-sketch-seconds", String(sec));
    return sec;
  }

  function stopSketch(completed = false) {
    sketchingRef.current = false;
    sketchEndsAtRef.current = null;
    setSketching(false);
    setSketchEndsAt(null);
    if (completed) setSketchDone(true);
  }

  function startSketch() {
    const list = cardsRef.current;
    if (!list.length) {
      message.info("画板上没有图");
      return;
    }
    const sec = rememberSketchSeconds(sketchSecondsRef.current);
    let startIdx = -1;
    if (soloImageIdRef.current != null) {
      startIdx = list.findIndex((c) => c.image_id === soloImageIdRef.current);
    }
    if (startIdx < 0) startIdx = sketchStartIndex(selectedRef.current[0], list.length);
    const card = list[startIdx];
    if (!card) return;
    lastSoloRef.current = card.image_id;
    const endsAt = Date.now() + sec * 1000;
    sketchingRef.current = true;
    sketchIdxRef.current = startIdx;
    sketchEndsAtRef.current = endsAt;
    setSoloImageId(card.image_id);
    setSketchIdx(startIdx);
    setSketchDone(false);
    setSketching(true);
    setSketchEndsAt(endsAt);
  }

  function advanceSketch() {
    if (!sketchingRef.current) return;
    const list = cardsRef.current;
    const found = list.findIndex((c) => c.image_id === soloImageIdRef.current);
    const current = found >= 0 ? found : sketchIdxRef.current;
    const { nextIndex, done } = sketchAdvance(current, list.length);
    if (done || !list[nextIndex]) {
      stopSketch(true);
      return;
    }
    const next = list[nextIndex];
    const endsAt = Date.now() + sketchSecondsRef.current * 1000;
    lastSoloRef.current = next.image_id;
    sketchIdxRef.current = nextIndex;
    sketchEndsAtRef.current = endsAt;
    setSketchIdx(nextIndex);
    setSoloImageId(next.image_id);
    setSketchEndsAt(endsAt);
  }

  function stepSolo(delta: number) {
    const list = cardsRef.current;
    if (!list.length || soloImageIdRef.current == null) return;
    const idx = Math.max(0, list.findIndex((c) => c.image_id === soloImageIdRef.current));
    const nextIdx = (idx + Number(delta || 1) + list.length * 8) % list.length;
    const next = list[nextIdx];
    lastSoloRef.current = next.image_id;
    setSoloImageId(next.image_id);
    if (sketchingRef.current) {
      const endsAt = Date.now() + sketchSecondsRef.current * 1000;
      sketchIdxRef.current = nextIdx;
      sketchEndsAtRef.current = endsAt;
      setSketchIdx(nextIdx);
      setSketchEndsAt(endsAt);
    }
  }

  useEffect(() => subscribeSoloStep(stepSolo), []);

  useEffect(() => {
    if (!sketching || sketchEndsAt == null) return;
    const timer = window.setInterval(() => {
      setSketchPulse((n) => n + 1);
      if (sketchRemainSeconds(sketchEndsAtRef.current || 0) <= 0) advanceSketch();
    }, 200);
    return () => window.clearInterval(timer);
  }, [sketching, sketchEndsAt]);

  useEffect(() => {
    if (!sketching) return;
    if (!cards.length) {
      stopSketch();
      return;
    }
    const idx = cards.findIndex((c) => c.image_id === soloImageId);
    if (idx < 0) {
      stopSketch();
      return;
    }
    if (idx !== sketchIdxRef.current) {
      sketchIdxRef.current = idx;
      setSketchIdx(idx);
    }
  }, [cards, sketching, soloImageId]);

  function packAllInView() {
    if (!cardsRef.current.length) return;
    const next = packInView(cardsRef.current, boardBox());
    setCards(next);
    scheduleSave(next, panRef.current, zoomRef.current);
  }

  function startWindowMove(evt: { button: number; altKey: boolean; ctrlKey: boolean; metaKey: boolean; preventDefault: () => void }) {
    if (!focus || locked || !isWindowMoveGesture(evt)) return false;
    evt.preventDefault();
    void windowDragBegin();
    const stop = () => {
      void windowDragEnd();
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("mouseup", stop);
    return true;
  }

  function toggleBoardGray(value: boolean) {
    setBoardGray(value);
    boardGrayRef.current = value;
    scheduleSave(cardsRef.current, panRef.current, zoomRef.current);
  }

  function pickColorAt(sx: number, sy: number) {
    const world = screenToWorld(sx, sy, panRef.current, zoomRef.current);
    const idx = hitCardIndex(cardsRef.current, world);
    if (idx < 0) return;
    const color = sampleCardColor(cardsRef.current[idx], world);
    if (!color) return;
    setLastColor(color);
    setPicking(false);
    void copyText(color.hex).then(
      () => message.success(`已复制 ${color.hex}`),
      () => message.info(color.hex)
    );
  }

  function selectCard(index: number, evt?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) {
    const add = Boolean(evt?.ctrlKey || evt?.metaKey || evt?.shiftKey);
    const card = cardsRef.current[index];
    if (!add && card?.group_id && groupEdit !== card.group_id) {
      setSelected(expandGroupIndices(cardsRef.current, [index]));
      return;
    }
    setSelected((cur) => {
      if (!add) return [index];
      if (cur.includes(index)) return cur.filter((i) => i !== index);
      return [...cur, index];
    });
  }

  async function rename(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === liveName) return;
    await request(`/api/v1/boards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setNameDraft(trimmed);
    qc.setQueryData(["board", String(id)], (old: Board | undefined) => (old ? { ...old, name: trimmed } : old));
    qc.setQueriesData({ queryKey: ["boards"] }, (old: Board[] | undefined) =>
      old?.map((b) => (String(b.id) === String(id) ? { ...b, name: trimmed } : b))
    );
    qc.invalidateQueries({ queryKey: ["boards"] });
    qc.invalidateQueries({ queryKey: ["board", String(id)] });
    qc.invalidateQueries({ queryKey: ["home"] });
  }

  async function removeFromTray(imageId: number) {
    await request(`/api/v1/boards/${id}/tray/${imageId}`, { method: "DELETE" });
    const next = cardsRef.current.filter((c) => c.image_id !== imageId);
    setCards(next);
    setSelected([]);
    scheduleSave(next, panRef.current, zoomRef.current);
    qc.invalidateQueries({ queryKey: ["board", String(id)] });
    qc.invalidateQueries({ queryKey: ["boards"] });
  }

  const current = selected.length === 1 ? cards[selected[0]] : null;
  const multi = selected.length >= 2;
  const hasSel = selected.length > 0;
  const groupedSel = selected.some((i) => cards[i]?.group_id);
  const allLocked = hasSel && selected.every((i) => cards[i]?.locked);
  const soloCard = soloImageId != null ? cards.find((c) => c.image_id === soloImageId) || null : null;
  const sketchRemain = sketchEndsAt != null ? sketchRemainSeconds(sketchEndsAt) : 0;
  const onCanvas = new Set(cards.map((c) => c.image_id));
  const unusedTray = (data?.tray || []).filter((img) => !onCanvas.has(img.id));

  function beginLayerDrag(e: DragEvent, index: number) {
    skipTrayClick.current = true;
    layerDrag.current = index;
    e.dataTransfer.setData("text/plain", `layer:${index}`);
    e.dataTransfer.effectAllowed = "move";
  }

  function dropLayerOn(index: number) {
    const from = layerDrag.current;
    layerDrag.current = null;
    setLayerDrop(null);
    if (from == null || from === index) return;
    reorderCards(from, index);
  }

  if (!data) return <div>加载画板…</div>;

  const viewButtons = (
    <>
      <InputNumber
        size="small"
        min={10}
        max={800}
        step={5}
        value={Math.round(zoom * 100)}
        formatter={(v) => `${v}%`}
        parser={(v) => Number(String(v ?? "").replace("%", "")) || 100}
        onChange={(v) => {
          if (v == null) return;
          applyZoomPercent(Number(v));
        }}
        variant="borderless"
        style={{ width: 76 }}
      />
      <Button size="small" onClick={showAll}>
        看全部
      </Button>
      <Button size="small" onClick={goToCenter}>
        居中
      </Button>
      <Button size="small" loading={capturing} disabled={capturing} title="截图至画板 Ctrl+Shift+S" onClick={() => void captureToBoard()}>
        截图
      </Button>
      <Button size="small" loading={exporting} disabled={exporting || !cards.length} title="导出当前视野 PNG" onClick={() => void exportViewport()}>
        导出
      </Button>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flex: "none" }}>
        <Switch
          size="small"
          checked={keepRatio}
          onChange={(v) => {
            setKeepRatio(v);
            localStorage.setItem("pb-keep-ratio", v ? "1" : "0");
          }}
        />
        <span style={{ fontSize: 12, color: "#8a9099", whiteSpace: "nowrap" }}>{keepRatio ? "比例" : "自由"}</span>
      </span>
    </>
  );

  const cardTools = (
    <>
      <Button size="small" disabled={!cards.length} onClick={packAllInView} title="摆正并紧密排列当前窗口里的图">
        排列
      </Button>
      <Dropdown
        getPopupContainer={() => document.body}
        menu={{
          items: [
            { key: "group", label: "编组", disabled: !multi, onClick: groupSelection },
            { key: "ungroup", label: "解组", disabled: !groupedSel, onClick: ungroupSelection },
            { key: "lock", label: allLocked ? "解锁" : "锁定", disabled: !hasSel, onClick: toggleLock },
            { type: "divider" },
            { key: "flip", label: "翻转", disabled: !hasSel, onClick: () => updateSelected((c) => ({ ...c, flipped: !c.flipped })) },
            { key: "gray", label: "单张灰度", disabled: !hasSel, onClick: () => {
              const on = !selected.every((i) => cards[i]?.grayscale);
              updateSelected((c) => ({ ...c, grayscale: on }));
            } },
            { key: "board-gray", label: boardGray ? "取消整板灰" : "整板灰度", onClick: () => toggleBoardGray(!boardGray) },
            { key: "pick", label: picking ? "取消取色" : "取色", onClick: () => setPicking((v) => !v) },
            { type: "divider" },
            { key: "left-rot", label: "左转", disabled: !current, onClick: () => updateSelected((c) => ({ ...c, rotation: rotateDelta(c.rotation, -90) })) },
            { key: "right-rot", label: "右转", disabled: !current, onClick: () => updateSelected((c) => ({ ...c, rotation: rotateDelta(c.rotation, 90) })) },
            { key: "crop", label: "裁剪", disabled: !current, onClick: () => setCropOpen(true) },
            { key: "reset", label: "复位", disabled: !current, onClick: () => updateSelected((c) => ({
              ...c,
              ...resetCardToOriginal({
                width: c.width,
                height: c.height,
                naturalWidth: c.naturalWidth || c.htmlImage?.naturalWidth,
                naturalHeight: c.naturalHeight || c.htmlImage?.naturalHeight,
              }),
            })) },
          ],
        }}
      >
        <Button size="small" type={picking || boardGray || allLocked ? "primary" : "default"}>
          图卡
        </Button>
      </Dropdown>
      {lastColor ? (
        <button
          type="button"
          className="pb-color-chip"
          title={`${lastColor.hex}  RGB ${lastColor.r},${lastColor.g},${lastColor.b}`}
          style={{ background: lastColor.hex }}
          onClick={() => void copyText(lastColor.hex).then(() => message.success(`已复制 ${lastColor.hex}`))}
        />
      ) : null}
    </>
  );

  const sketchControls = (
    <span className="pb-sketch-controls">
      {sketching ? (
        <>
          <span className="pb-sketch-clock" title="剩余时间">
            {formatSketchClock(sketchRemain)}
          </span>
          <span className="pb-sketch-prog">
            {sketchIdx + 1}/{cards.length}
          </span>
          <Button size="small" danger onClick={() => stopSketch()}>
            停止
          </Button>
        </>
      ) : (
        <>
          <InputNumber
            size="small"
            min={SKETCH_SEC_MIN}
            max={SKETCH_SEC_MAX}
            value={sketchSeconds}
            onChange={(v) => rememberSketchSeconds(v)}
            className="pb-sketch-sec"
            title="每张图的秒数"
          />
          <span className="pb-sketch-unit">秒</span>
          <Button size="small" type="primary" disabled={!cards.length} onClick={startSketch} title="按顺序单张倒计时切图">
            速写
          </Button>
        </>
      )}
    </span>
  );

  const toolbar = (
    <div className="pb-toolbar" title="空格拖动画布，滚轮缩放，拖空白处框选">
      {focus ? (
        <Button size="small" type="primary" onClick={() => void setFocus(false)}>
          退出专注
        </Button>
      ) : (
        <>
          <Button size="small" type="text" onClick={() => nav("/boards")}>
            ← 画板
          </Button>
          <Select
            size="small"
            variant="borderless"
            style={{ width: 176 }}
            value={Number(id)}
            options={(boards.data || []).map((b) => ({
              value: b.id,
              label: (
                <span className="pb-board-opt">
                  {b.preview_url ? <img src={mediaUrl(b.preview_url)} alt="" /> : <span className="pb-board-opt-ph" />}
                  {b.name}
                </span>
              ),
            }))}
            onChange={(boardId) => nav(`/boards/${boardId}`)}
          />
          <Input
            size="small"
            variant="borderless"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={(e) => void rename(e.target.value)}
            onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
            style={{ width: 120 }}
          />
        </>
      )}
      <span className="pb-vsep" />
      {viewButtons}
      <span className="pb-vsep" />
      {!focus ? (
        <Button size="small" onClick={() => void setFocus(true)}>
          专注
        </Button>
      ) : null}
      <Button size="small" type={pinned ? "primary" : "default"} onClick={() => void setPinned(!pinned)}>
        {pinned ? "已置顶" : "置顶"}
      </Button>
      <Button size="small" disabled={!cards.length} type={soloCard ? "primary" : "default"} onClick={() => (soloCard ? leaveSolo() : enterSolo())} title={soloCard ? "← → 切图" : "只看选中的图"}>
        {soloCard ? "画板" : "只看这张"}
      </Button>
      {sketchControls}
      <span className="pb-vsep" />
      {cardTools}
    </div>
  );

  const tray = (
    <div
      className="pb-scroll pb-tray"
      onDragOver={(e) => {
        if (layerDrag.current != null) e.preventDefault();
      }}
    >
      <button type="button" className="pb-add-tile" onClick={() => nav(`/library?add_to_board=${id}`)} title="从图库加入参考图">
        +
      </button>
      {cards.length ? (
        <>
          <span className="pb-tray-cap">底层</span>
          {cards.map((card, index) => (
            <div
              key={`${card.image_id}-${index}`}
              className={`pb-tray-thumb${selected.includes(index) ? " is-sel" : ""}${layerDrop === index ? " is-drop" : ""}`}
              draggable
              title="拖动调整层次，单击定位。左底层，右顶层"
              onDragStart={(e) => beginLayerDrag(e, index)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (layerDrop !== index) setLayerDrop(index);
              }}
              onDragLeave={() => {
                if (layerDrop === index) setLayerDrop(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dropLayerOn(index);
              }}
              onDragEnd={() => {
                layerDrag.current = null;
                setLayerDrop(null);
              }}
              onClick={() => {
                if (skipTrayClick.current) {
                  skipTrayClick.current = false;
                  return;
                }
                locateCard(index);
              }}
            >
              <MediaImg
                thumb={card.thumbUrl}
                original={card.originalUrl}
                width={68}
                height={68}
                draggable={false}
                style={{ width: 68, height: 68, pointerEvents: "none" }}
              />
              <button
                type="button"
                className="pb-tray-x"
                title="从画布移除"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromCanvas(index);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <span className="pb-tray-cap">顶层</span>
        </>
      ) : null}
      {cards.length && unusedTray.length ? <span className="pb-tray-sep" /> : null}
      {unusedTray.map((img) => (
        <div
          key={img.id}
          className="pb-tray-thumb"
          draggable
          title="拖到画布或单击放到画面中央"
          onDragStart={(e) => {
            skipTrayClick.current = true;
            const payload = JSON.stringify({
              id: img.id,
              original_url: img.original_url,
              thumbnail_url: img.thumbnail_url,
              width: img.width,
              height: img.height,
            });
            e.dataTransfer.setData("application/json", payload);
            e.dataTransfer.setData("text/plain", payload);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => {
            if (skipTrayClick.current) {
              skipTrayClick.current = false;
              return;
            }
            locateOrPlace(img);
          }}
        >
          <MediaImg
            thumb={img.thumbnail_url}
            original={img.original_url}
            width={68}
            height={68}
            draggable={false}
            style={{ width: 68, height: 68, pointerEvents: "none" }}
          />
          <button
            type="button"
            className="pb-tray-x"
            title="从画板移除"
            onClick={(e) => {
              e.stopPropagation();
              void removeFromTray(img.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        position: "relative",
      }}
      onPointerDownCapture={(e) => {
        if (startWindowMove(e.nativeEvent)) e.stopPropagation();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleBoardDrop}
    >
      {focus ? null : toolbar}
      {focus && edgeOpen ? (
        <div className="pb-float-tools" onPointerDown={(e) => e.stopPropagation()}>
          <IconBtn title="退出专注 Esc" onClick={() => void setFocus(false)}>
            <IconExit />
          </IconBtn>
          <IconBtn title={locked ? "取消固定" : "固定位置"} on={locked} onClick={() => void setLocked(!locked)}>
            <IconLock open={!locked} />
          </IconBtn>
          <IconBtn title={pinned ? "取消置顶" : "置顶"} on={pinned} onClick={() => void setPinned(!pinned)}>
            <IconPin />
          </IconBtn>
          <IconBtn title="点穿 Ctrl+Shift+X" on={clickThrough} onClick={() => void setClickThrough(!clickThrough)}>
            <IconClickThrough />
          </IconBtn>
          <span className="pb-focus-opacity" title="透明度">
            <Slider
              min={30}
              max={100}
              value={Math.round(opacity * 100)}
              onChange={(v) => void setOpacity(Number(v) / 100)}
              style={{ width: 72, margin: 0 }}
              tooltip={{ formatter: (v) => `${v}%` }}
            />
          </span>
          <span className="pb-vsep" />
          <IconBtn title={soloCard ? "回到画板  ← → 切图" : "只看这张"} on={Boolean(soloCard)} disabled={!cards.length} onClick={() => (soloCard ? leaveSolo() : enterSolo())}>
            {soloCard ? <IconBoard /> : <IconSolo />}
          </IconBtn>
          {sketching ? (
            <>
              <span className="pb-sketch-clock" title="剩余时间">
                {formatSketchClock(sketchRemain)}
              </span>
              <span className="pb-sketch-prog">
                {sketchIdx + 1}/{cards.length}
              </span>
              <IconBtn title="停止速写" on onClick={() => stopSketch()}>
                <IconSketchStop />
              </IconBtn>
            </>
          ) : (
            <>
              <InputNumber
                size="small"
                min={SKETCH_SEC_MIN}
                max={SKETCH_SEC_MAX}
                value={sketchSeconds}
                onChange={(v) => rememberSketchSeconds(v)}
                className="pb-sketch-sec"
                title="每张图的秒数"
              />
              <IconBtn title="开始速写" disabled={!cards.length} onClick={startSketch}>
                <IconSketch />
              </IconBtn>
            </>
          )}
          <IconBtn title="摆正并紧密排列" disabled={!cards.length} onClick={packAllInView}>
            <IconPack />
          </IconBtn>
          <IconBtn title="导出当前视野 PNG" disabled={exporting || !cards.length} onClick={() => void exportViewport()}>
            <IconExport />
          </IconBtn>
          <Dropdown
            getPopupContainer={() => document.body}
            menu={{
              items: [
                { key: "group", label: "编组", disabled: !multi, onClick: groupSelection },
                { key: "ungroup", label: "解组", disabled: !groupedSel, onClick: ungroupSelection },
                { key: "lock", label: allLocked ? "解锁" : "锁定", disabled: !hasSel, onClick: toggleLock },
                { type: "divider" },
                { key: "flip", label: "翻转", disabled: !hasSel, onClick: () => updateSelected((c) => ({ ...c, flipped: !c.flipped })) },
                { key: "gray", label: "单张灰度", disabled: !hasSel, onClick: () => {
                  const on = !selected.every((i) => cards[i]?.grayscale);
                  updateSelected((c) => ({ ...c, grayscale: on }));
                } },
                { key: "board-gray", label: boardGray ? "取消整板灰" : "整板灰度", onClick: () => toggleBoardGray(!boardGray) },
                { key: "pick", label: picking ? "取消取色" : "取色", onClick: () => setPicking((v) => !v) },
                { type: "divider" },
                { key: "left-rot", label: "左转", disabled: !current, onClick: () => updateSelected((c) => ({ ...c, rotation: rotateDelta(c.rotation, -90) })) },
                { key: "right-rot", label: "右转", disabled: !current, onClick: () => updateSelected((c) => ({ ...c, rotation: rotateDelta(c.rotation, 90) })) },
                { key: "crop", label: "裁剪", disabled: !current, onClick: () => setCropOpen(true) },
                { key: "reset", label: "复位", disabled: !current, onClick: () => updateSelected((c) => ({
                  ...c,
                  ...resetCardToOriginal({
                    width: c.width,
                    height: c.height,
                    naturalWidth: c.naturalWidth || c.htmlImage?.naturalWidth,
                    naturalHeight: c.naturalHeight || c.htmlImage?.naturalHeight,
                  }),
                })) },
              ],
            }}
          >
            <span>
              <IconBtn title="图卡" on={picking || boardGray || allLocked}>
                <IconCards />
              </IconBtn>
            </span>
          </Dropdown>
          {lastColor ? (
            <button
              type="button"
              className="pb-color-chip"
              title={`${lastColor.hex}  RGB ${lastColor.r},${lastColor.g},${lastColor.b}`}
              style={{ background: lastColor.hex }}
              onClick={() => void copyText(lastColor.hex).then(() => message.success(`已复制 ${lastColor.hex}`))}
            />
          ) : null}
          <span className="pb-float-tools-tip">Alt+拖 搬窗</span>
        </div>
      ) : null}
      <div
        className={`pb-canvas${marquee ? " is-marquee" : ""}`}
        ref={wrapRef}
        style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0, cursor: picking || marquee ? "crosshair" : focus && altHeld && !locked ? "grab" : undefined }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div style={{ width: "100%", height: "100%", position: "relative", filter: boardGray ? "grayscale(1)" : undefined }}>
        <Stage
          ref={stageRef}
          width={stageSize.w}
          height={stageSize.h}
          scaleX={zoom}
          scaleY={zoom}
          x={pan.x}
          y={pan.y}
          draggable={space}
          style={{ cursor: space ? "grab" : "default" }}
          onMouseDown={(e) => {
            const stage = e.target.getStage();
            if (!stage) return;
            if (isWindowMoveGesture(e.evt)) {
              e.evt.preventDefault();
              return;
            }
            if (e.evt.button === 2) {
              stage.draggable(false);
              return;
            }
            const isBg = e.target === stage || e.target.name() === "board-bg";
            if (pickingRef.current) {
              e.evt.preventDefault();
              const pointer = stage.getPointerPosition();
              if (pointer) pickColorAt(pointer.x, pointer.y);
              return;
            }
            if (isBg && e.evt.button === 0 && !space) {
              const pointer = stage.getPointerPosition();
              if (!pointer) return;
              const world = screenToWorld(pointer.x, pointer.y, panRef.current, zoomRef.current);
              setMarquee({
                x1: world.x,
                y1: world.y,
                x2: world.x,
                y2: world.y,
                add: Boolean(e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey),
              });
              setCtxMenu(null);
              stage.draggable(false);
              return;
            }
            stage.draggable(space);
          }}
          onDragEnd={(e) => {
            const stage = e.target.getStage();
            if (e.target === stage) {
              const next = { x: e.target.x(), y: e.target.y() };
              setPan(next);
              scheduleSave(cardsRef.current, next, zoomRef.current);
            }
            stage?.draggable(space);
          }}
          onWheel={(e) => {
            e.evt.preventDefault();
            const stage = e.target.getStage();
            const pointer = stage?.getPointerPosition() || { x: stageSize.w / 2, y: stageSize.h / 2 };
            const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
            const nextZoom = clampZoom(zoomRef.current * factor);
            const next = zoomToward(pointer, panRef.current, zoomRef.current, nextZoom);
            setZoom(next.zoom);
            setPan(next.pan);
            scheduleSave(cardsRef.current, next.pan, next.zoom);
          }}
        >
          <Layer>
            <Rect name="board-bg" x={-8000} y={-8000} width={16000} height={16000} fill="#f4f6f8" />
            {cards.map((c, i) => {
              const img = c.htmlImage;
              const crop =
                img && img.naturalWidth
                  ? sourceCrop(img.naturalWidth, img.naturalHeight, c.crop)
                  : undefined;
              return (
                <KImage
                  key={`${c.image_id}-${i}`}
                  image={img}
                  x={c.x + c.width / 2}
                  y={c.y + c.height / 2}
                  offsetX={c.width / 2}
                  offsetY={c.height / 2}
                  width={c.width}
                  height={c.height}
                  rotation={c.rotation}
                  scaleX={c.flipped ? -1 : 1}
                  crop={crop}
                  filters={c.grayscale && !boardGray ? [Konva.Filters.Grayscale] : undefined}
                  draggable={!space && !picking && !c.locked}
                  onClick={(e) => selectCard(i, e.evt)}
                  onTap={() => selectCard(i)}
                  onDblClick={() => {
                    if (c.group_id && groupEdit !== c.group_id) {
                      setGroupEdit(c.group_id);
                      setSelected([i]);
                      return;
                    }
                    enterSolo(i);
                  }}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    selectCard(i);
                    setCtxMenu({
                      ...clampPopup(
                        { x: e.evt.clientX, y: e.evt.clientY },
                        { w: 168, h: 268 },
                        { w: window.innerWidth, h: window.innerHeight }
                      ),
                      index: i,
                    });
                  }}
                  onDragStart={(e) => {
                    if (e.evt.altKey || pickingRef.current || c.locked) {
                      e.target.stopDrag();
                      return;
                    }
                    const moving = expandGroupIndices(cardsRef.current, selectedRef.current.includes(i) ? selectedRef.current : [i], groupEdit);
                    setSelected(moving);
                    dragOrigin.current = cardsRef.current.map((item) => ({ x: item.x, y: item.y }));
                    dragFrom.current = { x: e.target.x(), y: e.target.y(), index: i };
                  }}
                  onDragEnd={(e) => {
                    const origin = dragOrigin.current;
                    const from = dragFrom.current;
                    dragOrigin.current = null;
                    dragFrom.current = null;
                    const moving = new Set(
                      expandGroupIndices(cardsRef.current, selectedRef.current.includes(i) ? selectedRef.current : [i], groupEdit)
                    );
                    const dx = origin && from ? e.target.x() - from.x : e.target.x() - (c.width / 2 + c.x);
                    const dy = origin && from ? e.target.y() - from.y : e.target.y() - (c.height / 2 + c.y);
                    const next = cardsRef.current.map((item, idx) => {
                      if (!moving.has(idx) || !origin) {
                        return idx === i ? { ...item, x: e.target.x() - item.width / 2, y: e.target.y() - item.height / 2 } : item;
                      }
                      return { ...item, x: origin[idx].x + dx, y: origin[idx].y + dy };
                    });
                    setCards(next);
                    scheduleSave(next, panRef.current, zoomRef.current);
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const flipped = (cardsRef.current[i]?.flipped || node.scaleX() < 0);
                    const width = Math.max(40, node.width() * Math.abs(node.scaleX()));
                    const height = Math.max(40, node.height() * Math.abs(node.scaleY()));
                    node.scaleX(flipped ? -1 : 1);
                    node.scaleY(1);
                    const next = cardsRef.current.map((item, idx) =>
                      idx === i
                        ? {
                            ...item,
                            x: node.x() - width / 2,
                            y: node.y() - height / 2,
                            width,
                            height,
                            rotation: node.rotation(),
                            flipped,
                          }
                        : item
                    );
                    setCards(next);
                    scheduleSave(next, panRef.current, zoomRef.current);
                  }}
                  ref={(node) => {
                    if (!node) return;
                    try {
                      if (c.grayscale && !boardGray) node.cache();
                      else node.clearCache();
                    } catch {
                      /* cache needs a drawn image */
                    }
                    if (selected.length === 1 && selected[0] === i && !c.locked && trRef.current) {
                      trRef.current.nodes([node]);
                      trRef.current.getLayer()?.batchDraw();
                    }
                  }}
                />
              );
            })}
            {(marquee && !marquee.add ? [] : selected).map((idx) => {
              const c = cards[idx];
              if (!c) return null;
              return (
                <Rect
                  key={`sel-${c.image_id}-${idx}`}
                  x={c.x + c.width / 2}
                  y={c.y + c.height / 2}
                  offsetX={c.width / 2}
                  offsetY={c.height / 2}
                  width={c.width}
                  height={c.height}
                  rotation={c.rotation}
                  fillEnabled={false}
                  stroke="#3b6cff"
                  strokeWidth={2 / Math.max(0.05, zoom)}
                  listening={false}
                />
              );
            })}
            {marquee
              ? indicesInMarquee(cards, marqueeRect({ x: marquee.x1, y: marquee.y1 }, { x: marquee.x2, y: marquee.y2 }))
                  .filter((idx) => !selected.includes(idx) || marquee.add)
                  .map((idx) => {
                    const c = cards[idx];
                    if (!c) return null;
                    return (
                      <Rect
                        key={`hit-${c.image_id}-${idx}`}
                        x={c.x + c.width / 2}
                        y={c.y + c.height / 2}
                        offsetX={c.width / 2}
                        offsetY={c.height / 2}
                        width={c.width}
                        height={c.height}
                        rotation={c.rotation}
                        fill="rgba(59,108,255,0.12)"
                        stroke="#3b6cff"
                        strokeWidth={2 / Math.max(0.05, zoom)}
                        listening={false}
                      />
                    );
                  })
              : null}
            <Transformer
              ref={trRef}
              rotateEnabled
              rotateAnchorCursor={getRotateCursor()}
              keepRatio={keepRatio}
              borderStroke="#3b6cff"
              anchorStroke="#3b6cff"
              anchorFill="#fff"
              anchorSize={8}
              anchorCornerRadius={2}
              enabledAnchors={
                keepRatio
                  ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                  : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]
              }
              anchorStyleFunc={styleBoardAnchor}
            />
          </Layer>
        </Stage>
        {marquee ? (
          <div
            className="pb-board-marquee"
            style={{
              left: Math.min(marquee.x1, marquee.x2) * zoom + pan.x,
              top: Math.min(marquee.y1, marquee.y2) * zoom + pan.y,
              width: Math.abs(marquee.x2 - marquee.x1) * zoom,
              height: Math.abs(marquee.y2 - marquee.y1) * zoom,
            }}
          />
        ) : null}
        </div>
        {soloCard ? (
          <SoloView card={soloCard} boardGray={boardGray} size={stageSize} />
        ) : null}
        {sketching ? (
          <div className="pb-sketch-hud">
            <span className="pb-sketch-clock">{formatSketchClock(sketchRemain)}</span>
            <span className="pb-sketch-prog">
              {sketchIdx + 1} / {cards.length}
            </span>
            <button type="button" className="pb-sketch-stop" onClick={() => stopSketch()}>
              停止
            </button>
          </div>
        ) : null}
        {sketchDone ? (
          <div className="pb-sketch-done" onPointerDown={(e) => e.stopPropagation()}>
            <div className="pb-sketch-done-card">
              <div className="pb-sketch-done-title">已完成速写</div>
              <div className="pb-sketch-done-sub">共 {cards.length} 张</div>
              <Button type="primary" onClick={() => setSketchDone(false)}>
                确定
              </Button>
            </div>
          </div>
        ) : null}
        {groupEdit ? <div className="pb-group-edit">组内编辑中 · Esc 退出</div> : null}
        {cards.length === 0 && !focus ? (
          <div className="pb-empty-canvas">
            <Empty description={(data.tray || []).length ? "把底部的图拖进画布，或点缩略图放到中央" : "点底部 + 去图库选参考图"} />
          </div>
        ) : null}
        {ctxMenu
          ? createPortal(
              <div
                ref={ctxMenuRef}
                className="pb-ctx"
                style={{ left: ctxMenu.x, top: ctxMenu.y }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {[
                  { key: "remove", label: "从画布移除", run: () => removeFromCanvas(ctxMenu.index) },
                  { key: "flip", label: "左右翻转", run: () => {
                    const idx = ctxMenu.index;
                    const next = cardsRef.current.map((item, i) => (i === idx ? { ...item, flipped: !item.flipped } : item));
                    setCards(next);
                    scheduleSave(next, panRef.current, zoomRef.current);
                    setCtxMenu(null);
                  } },
                  { key: "gray", label: cards[ctxMenu.index]?.grayscale ? "取消灰度" : "单张灰度", run: () => {
                    const idx = ctxMenu.index;
                    const next = cardsRef.current.map((item, i) => (i === idx ? { ...item, grayscale: !item.grayscale } : item));
                    setCards(next);
                    scheduleSave(next, panRef.current, zoomRef.current);
                    setCtxMenu(null);
                  } },
                  { key: "solo", label: "只看这张", run: () => { enterSolo(ctxMenu.index); setCtxMenu(null); } },
                  { key: "lock", label: cards[ctxMenu.index]?.locked ? "解锁" : "锁定", run: () => {
                    setSelected([ctxMenu.index]);
                    selectedRef.current = [ctxMenu.index];
                    toggleLock();
                    setCtxMenu(null);
                  } },
                  { key: "front", label: "置于顶层", run: () => moveLayer(ctxMenu.index, "front") },
                  { key: "back", label: "置于底层", run: () => moveLayer(ctxMenu.index, "back") },
                ].map((item) => (
                  <button key={item.key} type="button" onClick={item.run}>
                    {item.label}
                  </button>
                ))}
              </div>,
              document.body
            )
          : null}
      </div>
      {!focus ? tray : null}
      <CropDialog
        open={cropOpen && Boolean(current)}
        src={current?.originalUrl || ""}
        value={current?.crop || { x: 0, y: 0, w: 1, h: 1 }}
        onCancel={() => setCropOpen(false)}
        onOk={(crop) => {
          const img = current?.htmlImage;
          updateSelected((c) => {
            const src = img && img.naturalWidth ? sourceCrop(img.naturalWidth, img.naturalHeight, crop) : null;
            const nextHeight = src ? Math.max(40, (c.width * src.height) / src.width) : c.height;
            return { ...c, crop, height: nextHeight };
          });
          setCropOpen(false);
        }}
      />
    </div>
  );
}
