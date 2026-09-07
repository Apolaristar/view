import { useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Empty, Input, InputNumber, Select, Space, Switch, message } from "antd";
import { Layer, Rect, Stage, Image as KImage, Transformer } from "react-konva";
import type Konva from "konva";
import { useBoard, useBoards } from "../api/hooks";
import { mediaUrl, request } from "../api/client";
import CropDialog from "../components/CropDialog";
import MediaImg from "../components/MediaImg";
import { useFocusMode } from "../components/FocusMode";
import { useQueryClient } from "@tanstack/react-query";
import { cardsCenter, centerOn, clampZoom, fitCards, moveIndex, resetCardToOriginal, rotateDelta, screenToWorld, sourceCrop, zoomToward, type CropBox } from "../boardMath";
import { renderBoardPreview } from "../boardPreview";
import type { Board } from "../types";

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
  const { focus, pinned, fullscreen, setFocus, setPinned, setFullscreen } = useFocusMode();
  const [cards, setCards] = useState<Card[]>([]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [space, setSpace] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [keepRatio, setKeepRatio] = useState(() => localStorage.getItem("pb-keep-ratio") !== "0");
  const [nameDraft, setNameDraft] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 480 });
  const [tick, setTick] = useState(0);
  const trRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | null>(null);
  const loadedBoard = useRef<string | null>(null);
  const skipTrayClick = useRef(false);
  const layerDrag = useRef<number | null>(null);
  const [layerDrop, setLayerDrop] = useState<number | null>(null);
  const cardsRef = useRef(cards);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  cardsRef.current = cards;
  panRef.current = pan;
  zoomRef.current = zoom;

  function redraw() {
    setTick((n) => n + 1);
    stageRef.current?.batchDraw();
  }

  useEffect(() => {
    loadedBoard.current = null;
    setCards([]);
    setSelected(null);
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
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setSpace(true);
      }
      if (e.key === "Escape") {
        if (fullscreen) void setFullscreen(false);
        else void setFocus(false);
      }
      if (e.key === "F11" && focus) {
        e.preventDefault();
        void setFullscreen(!fullscreen);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected != null && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setCards((cs) => {
          const next = cs.filter((_, i) => i !== selected);
          scheduleSave(next, panRef.current, zoomRef.current);
          return next;
        });
        setSelected(null);
      }
      if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        goToCenter();
      }
      if (e.key === "1" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        showAll();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [selected, focus, fullscreen, setFocus, setFullscreen]);

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

  async function ensureTray(imageId: number) {
    await request(`/api/v1/boards/${id}/tray`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: [imageId] }),
    });
    qc.invalidateQueries({ queryKey: ["board", String(id)] });
    qc.invalidateQueries({ queryKey: ["boards"] });
  }

  function addImage(
    image: { id: number; original_url: string; thumbnail_url: string; width?: number; height?: number },
    x = 80,
    y = 80
  ) {
    const originalUrl = mediaUrl(image.original_url);
    const thumbUrl = mediaUrl(image.thumbnail_url);
    const width = 320;
    const height = image.width && image.height ? (320 * image.height) / image.width : 320;
    const next = [
      ...cardsRef.current,
      {
        image_id: image.id,
        x,
        y,
        width,
        height,
        z_index: cardsRef.current.length,
        rotation: 0,
        crop: { x: 0, y: 0, w: 1, h: 1 },
        originalUrl,
        thumbUrl,
        naturalWidth: image.width,
        naturalHeight: image.height,
        htmlImage: loadHtmlImage(originalUrl, thumbUrl, redraw),
      },
    ];
    setCards(next);
    scheduleSave(next, panRef.current, zoomRef.current);
    void ensureTray(image.id);
  }

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
    const next = cardsRef.current.filter((_, i) => i !== index);
    setCards(next);
    setSelected(null);
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
    const selectedCard = selected != null ? currentCards[selected] : null;
    setCards(next);
    if (selectedCard) {
      const idx = next.indexOf(selectedCard);
      setSelected(idx >= 0 ? idx : null);
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
    setSelected(index);
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
    if (selected == null) return;
    const next = cardsRef.current.map((item, idx) => {
      if (idx !== selected) return item;
      return typeof patch === "function" ? patch(item) : { ...item, ...patch };
    });
    setCards(next);
    scheduleSave(next, panRef.current, zoomRef.current);
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
    setSelected(null);
    scheduleSave(next, panRef.current, zoomRef.current);
    qc.invalidateQueries({ queryKey: ["board", String(id)] });
    qc.invalidateQueries({ queryKey: ["boards"] });
  }

  const current = selected != null ? cards[selected] : null;
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

  const toolbar = (
    <div className="pb-toolbar" title="空格+拖动平移画布，滚轮缩放">
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
      {current ? (
        <>
          <span className="pb-vsep" />
          <Space.Compact size="small">
            <Button size="small" onClick={() => updateSelected((c) => ({ ...c, rotation: rotateDelta(c.rotation, -90) }))}>
              左转
            </Button>
            <Button size="small" onClick={() => updateSelected((c) => ({ ...c, rotation: rotateDelta(c.rotation, 90) }))}>
              右转
            </Button>
            <Button size="small" onClick={() => setCropOpen(true)}>
              裁剪
            </Button>
            <Button
              size="small"
              onClick={() =>
                updateSelected((c) => ({
                  ...c,
                  ...resetCardToOriginal({
                    width: c.width,
                    height: c.height,
                    naturalWidth: c.naturalWidth || c.htmlImage?.naturalWidth,
                    naturalHeight: c.naturalHeight || c.htmlImage?.naturalHeight,
                  }),
                }))
              }
            >
              复位
            </Button>
          </Space.Compact>
        </>
      ) : null}
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
              className={`pb-tray-thumb${selected === index ? " is-sel" : ""}${layerDrop === index ? " is-drop" : ""}`}
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
        height: focus ? "100vh" : "100%",
        minHeight: 0,
        position: "relative",
      }}
    >
      {focus ? (
        <div className="pb-focus-edge" title="移到顶部可退出，Esc 退出专注，F11 全屏">
          <div className="pb-focus-bar">
            <Button size="small" type="primary" onClick={() => void setFocus(false)}>
              退出专注
            </Button>
            <Button size="small" type={pinned ? "primary" : "default"} onClick={() => void setPinned(!pinned)}>
              {pinned ? "已置顶" : "置顶"}
            </Button>
            <Button size="small" type={fullscreen ? "primary" : "default"} onClick={() => void setFullscreen(!fullscreen)}>
              {fullscreen ? "退出全屏" : "全屏"}
            </Button>
            <span className="pb-focus-hint">Esc 退出 · F11 全屏</span>
          </div>
        </div>
      ) : (
        toolbar
      )}
      <div
        className="pb-canvas"
        ref={wrapRef}
        style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const raw = e.dataTransfer.getData("application/json") || e.dataTransfer.getData("text/plain");
          if (!raw || raw.startsWith("layer:")) return;
          try {
            const image = JSON.parse(raw);
            if (!image?.id) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, panRef.current, zoomRef.current);
            addImage(image, world.x - 160, world.y - 160);
          } catch {
            message.info("把底部的图拖进来");
          }
        }}
      >
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
            if (e.evt.button === 2) {
              stage.draggable(false);
              return;
            }
            const isBg = e.target === stage || e.target.name() === "board-bg";
            if (isBg) {
              setSelected(null);
              setCtxMenu(null);
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
                  crop={crop}
                  draggable={!space}
                  onClick={() => setSelected(i)}
                  onTap={() => setSelected(i)}
                  onContextMenu={(e) => {
                    e.evt.preventDefault();
                    setSelected(i);
                    setCtxMenu({ x: e.evt.clientX, y: e.evt.clientY, index: i });
                  }}
                  onDragEnd={(e) => {
                    const next = cardsRef.current.map((item, idx) =>
                      idx === i ? { ...item, x: e.target.x() - item.width / 2, y: e.target.y() - item.height / 2 } : item
                    );
                    setCards(next);
                    scheduleSave(next, panRef.current, zoomRef.current);
                  }}
                  onTransformEnd={(e) => {
                    const node = e.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    const width = Math.max(40, node.width() * scaleX);
                    const height = Math.max(40, node.height() * scaleY);
                    const next = cardsRef.current.map((item, idx) =>
                      idx === i
                        ? {
                            ...item,
                            x: node.x() - width / 2,
                            y: node.y() - height / 2,
                            width,
                            height,
                            rotation: node.rotation(),
                          }
                        : item
                    );
                    setCards(next);
                    scheduleSave(next, panRef.current, zoomRef.current);
                  }}
                  ref={(node) => {
                    if (selected === i && node && trRef.current) {
                      trRef.current.nodes([node]);
                      trRef.current.getLayer()?.batchDraw();
                    }
                  }}
                />
              );
            })}
            <Transformer
              ref={trRef}
              rotateEnabled
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
            />
          </Layer>
        </Stage>
        {cards.length === 0 && !focus ? (
          <div className="pb-empty-canvas">
            <Empty description={(data.tray || []).length ? "把底部的图拖进画布，或点缩略图放到中央" : "点底部 + 去图库选参考图"} />
          </div>
        ) : null}
        {ctxMenu ? (
          <div className="pb-ctx" style={{ left: ctxMenu.x, top: ctxMenu.y }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            {[
              { key: "remove", label: "从画布移除", run: () => removeFromCanvas(ctxMenu.index) },
              { key: "front", label: "置于顶层", run: () => moveLayer(ctxMenu.index, "front") },
              { key: "back", label: "置于底层", run: () => moveLayer(ctxMenu.index, "back") },
            ].map((item) => (
              <button key={item.key} type="button" onClick={item.run}>
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
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
