import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Space, Empty, message, Checkbox, Modal, Dropdown, Tooltip } from "antd";
import { useImage, useImages, useTags, useBoards } from "../api/hooks";
import { request, mediaUrl, ensureApiBase } from "../api/client";
import { type ImageItem, type Tag } from "../types";
import { familyText, poseStatusText } from "../i18n";
import { useQueryClient } from "@tanstack/react-query";
import { groupByAlbumDate } from "../album";
import MediaImg from "../components/MediaImg";
import PoseOverlay from "../components/PoseOverlay";
import FamilyPicker, { FamilyDropdown } from "../components/FamilyPicker";
import FramingPicker, { HeadYawPicker } from "../components/FramingPicker";
import TagChipBar from "../components/TagChipBar";
import PaletteExtractModal from "../components/PaletteExtractModal";
import ImagePreview from "../components/ImagePreview";
import TagPickPanel from "../components/TagPickPanel";
import { replaceGroup } from "../tagOrder";
import { copyImageFromFile, copyText, saveDataUrl, showInFolder } from "../desktop";
import { paletteCardDataUrl, paletteHexList } from "../paletteCard";
import { hasFaceOverlay, hasPoseOverlay } from "../poseSkeleton";
import { PoseQueryCard, usePoseSearch } from "../components/PoseSearch";
import { useUiPrefs } from "../uiPrefs";
import { importCroppedDataUrl, isEditableHotkeyTarget, isScreenshotHotkey } from "../screenshotImport";
import { idsHitByMarquee, mergeSelection, rectFromPoints, shouldStartMarquee, type Rect } from "../gallerySelect";
import {
  chipStatesFromImages,
  diffChipStates,
  splitTagGroups as splitTags,
  toggleChipState,
  type ChipState,
} from "../tagPick";

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [addBoardOpen, setAddBoardOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [detailTap, setDetailTap] = useState(false);
  const [detailOutline, setDetailOutline] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showFace, setShowFace] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [wantCrop, setWantCrop] = useState(false);
  const [pendingBoardIds, setPendingBoardIds] = useState<number[]>([]);
  const previewClick = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const captureToBoardRef = useRef<() => void>(() => undefined);
  const marqueeDrag = useRef<{ start: { x: number; y: number }; mode: "replace" | "add" | "subtract" } | null>(null);
  const marqueeBox = useRef<Rect | null>(null);
  const selectingRef = useRef(false);
  const skipClickRef = useRef(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkStates, setBulkStates] = useState<Record<number, ChipState>>({});
  const [bulkInitial, setBulkInitial] = useState<Record<number, ChipState>>({});
  const [tagModal, setTagModal] = useState<
    | { mode: "create"; kind: "category" | "facet" | "custom"; parentId?: number }
    | { mode: "rename"; tag: Tag }
    | null
  >(null);
  const [tagName, setTagName] = useState("");
  const tagIds = params.get("tag_ids") || "";
  const families = params.get("families") || "";
  const secondary = params.get("secondary") || "";
  const bodyFraming = params.get("body_framing") || "";
  const headYaw = params.get("head_yaw") || "";
  const poseStatus = params.get("pose_status") || "";
  const failed = params.get("failed") || "";
  const selectId = params.get("select");
  const pickBoardId = params.get("add_to_board") || "";

  const images = useImages({ tag_ids: tagIds, families, secondary, body_framing: bodyFraming, head_yaw: headYaw, pose_status: poseStatus, failed, limit: 1000 });
  const { query: poseQuery, exitToLibrary } = usePoseSearch();
  const { filterPinned, filterLayout } = useUiPrefs();
  const [filtersHover, setFiltersHover] = useState(false);
  const filterCloseTimer = useRef(0);
  const selectedId = selectId ? Number(selectId) : undefined;
  const selectedImage = useImage(selectedId);
  const tags = useTags();
  const boards = useBoards();
  const allItems = images.data?.items;
  const items = useMemo(() => {
    const source = allItems || [];
    if (poseQuery?.status !== "ok" || !poseQuery.items.length) return source;
    const byId = new Map(source.map((img) => [img.id, img]));
    return poseQuery.items.map((hit) => byId.get(hit.id)).filter((img): img is ImageItem => Boolean(img));
  }, [allItems, poseQuery]);
  const current = selectId
    ? selectedImage.data || items.find((i) => String(i.id) === selectId) || allItems?.find((i) => String(i.id) === selectId)
    : items[0];
  const tree = splitTags(tags.data || []);
  const selectedTagSet = useMemo(() => new Set(tagIds.split(",").filter(Boolean)), [tagIds]);
  const selectedCategory = tree.categories.find((c) => selectedTagSet.has(String(c.id)));
  const selectedFacet = tree.facets.find((f) => selectedTagSet.has(String(f.id)));
  const activeParentId = selectedFacet?.parent_id || selectedCategory?.id;
  const visibleFacets = tree.facets.filter((f) => f.parent_id === activeParentId);

  useEffect(() => {
    setDetailOutline(false);
    setDetailTap(false);
    setPaletteOpen(false);
  }, [current?.id]);

  useEffect(() => {
    if (filterPinned) setFiltersHover(false);
  }, [filterPinned]);

  function openFilters() {
    window.clearTimeout(filterCloseTimer.current);
    setFiltersHover(true);
  }

  function scheduleCloseFilters() {
    if (filterPinned) return;
    window.clearTimeout(filterCloseTimer.current);
    filterCloseTimer.current = window.setTimeout(() => setFiltersHover(false), 180);
  }

  useEffect(() => {
    if (!previewOpen || !current?.original_url) {
      setPreviewSrc("");
      return;
    }
    let cancelled = false;
    void ensureApiBase().then(() => {
      if (!cancelled) setPreviewSrc(mediaUrl(current.original_url));
    });
    return () => {
      cancelled = true;
    };
  }, [previewOpen, current?.original_url]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isEditableHotkeyTarget(e.target)) return;
      if (!isScreenshotHotkey(e)) return;
      e.preventDefault();
      void captureToBoardRef.current();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  function setTagIds(ids: string[]) {
    setFilter("tag_ids", ids.filter(Boolean).join(","));
  }

  function toggleChecked(imageId: number) {
    setSelectedIds((ids) => (ids.includes(imageId) ? ids.filter((id) => id !== imageId) : [...ids, imageId]));
  }

  function locateInGallery(imageId: number) {
    const visible = items.some((item) => item.id === imageId);
    if (!visible) {
      message.info("当前筛选列表里没有这张图");
      return;
    }
    if (params.get("select") !== String(imageId)) {
      const next = new URLSearchParams(params);
      next.set("select", String(imageId));
      setParams(next);
    }
    setFlashId(imageId);
    window.setTimeout(() => {
      const el = document.getElementById(`lib-thumb-${imageId}`);
      const scroller = el?.closest("[data-lib-gallery]");
      if (el && scroller instanceof HTMLElement) {
        const elRect = el.getBoundingClientRect();
        const box = scroller.getBoundingClientRect();
        const top = scroller.scrollTop + (elRect.top - box.top) - scroller.clientHeight / 2 + el.clientHeight / 2;
        scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else {
        el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }, 30);
    window.setTimeout(() => setFlashId((id) => (id === imageId ? null : id)), 1400);
  }

  function toggleHierarchy(tag: Tag) {
    const next = new Set(selectedTagSet);
    const related = [...tree.categories, ...tree.facets];
    for (const item of related) next.delete(String(item.id));
    if (!selectedTagSet.has(String(tag.id))) next.add(String(tag.id));
    setTagIds([...next]);
  }

  function toggleCustom(id: number) {
    const next = new Set(selectedTagSet);
    const key = String(id);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTagIds([...next]);
  }

  async function saveTags(image: ImageItem, tagIdsToSet: number[]) {
    const nextTags = (tags.data || []).filter((t) => tagIdsToSet.includes(t.id));
    qc.setQueryData(["image", image.id], (old: ImageItem | undefined) => (old ? { ...old, tags: nextTags } : old));
    qc.setQueriesData({ queryKey: ["images"] }, (old: { items: ImageItem[]; total: number } | undefined) => {
      if (!old?.items) return old;
      return { ...old, items: old.items.map((item) => (item.id === image.id ? { ...item, tags: nextTags } : item)) };
    });
    await request(`/api/v1/images/${image.id}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_ids: tagIdsToSet }),
    });
    qc.invalidateQueries({ queryKey: ["tags"] });
  }

  function toggleImageTag(image: ImageItem, tag: Tag) {
    const on = image.tags.some((x) => x.id === tag.id);
    const next = on ? image.tags.filter((x) => x.id !== tag.id).map((x) => x.id) : [...image.tags.map((x) => x.id), tag.id];
    saveTags(image, next);
  }

  function openTagModal(kind: "category" | "facet" | "custom", parentId?: number) {
    setTagName("");
    setTagModal({ mode: "create", kind, parentId });
  }

  function openRenameTag(tag: Tag) {
    setTagName(tag.name);
    setTagModal({ mode: "rename", tag });
  }

  async function submitTagModal() {
    const name = tagName.trim();
    if (!name || !tagModal) return;
    try {
      if (tagModal.mode === "rename") {
        await request(`/api/v1/tags/${tagModal.tag.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        renameTagInCache(tagModal.tag.id, name);
        message.success("已更改");
      } else {
        await request("/api/v1/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, kind: tagModal.kind, parent_id: tagModal.parentId || null }),
        });
        message.success("已添加");
      }
      qc.invalidateQueries({ queryKey: ["tags"] });
      qc.invalidateQueries({ queryKey: ["images"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["image", selectedId] });
      setTagModal(null);
      setTagName("");
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "无法保存标签");
    }
  }

  function renameTagInCache(id: number, name: string) {
    qc.setQueryData(["tags"], (old: Tag[] | undefined) => old?.map((t) => (t.id === id ? { ...t, name } : t)));
    const patchItem = (item: ImageItem) => ({
      ...item,
      tags: item.tags.map((t) => (t.id === id ? { ...t, name } : t)),
    });
    qc.setQueryData(["image", selectedId], (old: ImageItem | undefined) => (old ? patchItem(old) : old));
    qc.setQueriesData({ queryKey: ["images"] }, (old: { items: ImageItem[]; total: number } | undefined) => {
      if (!old?.items) return old;
      return { ...old, items: old.items.map(patchItem) };
    });
  }

  async function reorderTagGroup(ordered: Tag[]) {
    if (!ordered.length) return;
    qc.setQueryData(["tags"], (old: Tag[] | undefined) => (old ? replaceGroup(old, ordered) : ordered));
    try {
      const updated = await request<Tag[]>("/api/v1/tags/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ordered.map((t) => t.id) }),
      });
      qc.setQueryData(["tags"], updated);
      qc.invalidateQueries({ queryKey: ["images"] });
      if (selectedId) qc.invalidateQueries({ queryKey: ["image", selectedId] });
    } catch (err: unknown) {
      qc.invalidateQueries({ queryKey: ["tags"] });
      message.error(err instanceof Error ? err.message : "顺序未能保存");
    }
  }

  function deleteTag(tag: Tag) {
    const childIds = tree.facets.filter((f) => f.parent_id === tag.id).map((f) => f.id);
    Modal.confirm({
      title: tag.kind === "category" ? `删除「${tag.name}」？` : `删除「${tag.name}」？`,
      content: tag.kind === "category" ? "下面的细分也会一起删除。" : undefined,
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        await request(`/api/v1/tags/${tag.id}`, { method: "DELETE" });
        const remove = new Set([tag.id, ...childIds].map(String));
        setTagIds([...selectedTagSet].filter((id) => !remove.has(id)));
        qc.invalidateQueries({ queryKey: ["tags"] });
        qc.invalidateQueries({ queryKey: ["images"] });
        if (selectedId) qc.invalidateQueries({ queryKey: ["image", selectedId] });
        message.success("已删除");
      },
    });
  }

  async function addToBoard(imageId: number, boardId?: number) {
    await addManyToBoard([imageId], boardId);
  }

  async function addManyToBoard(imageIds: number[], boardId?: number, stay = false) {
    if (!imageIds.length) {
      message.info("先勾选要加入的图");
      return;
    }
    const list = boards.data || [];
    let target = boardId || (pickBoardId ? Number(pickBoardId) : list[0]?.id);
    if (!target) {
      const created = await request<{ id: number }>("/api/v1/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "未命名画板" }),
      });
      target = created.id;
    }
    await request(`/api/v1/boards/${target}/tray`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: imageIds }),
    });
    const boardName = list.find((b) => b.id === target)?.name || "画板";
    message.success(`已加入「${boardName}」底部（${imageIds.length} 张），拖到画布上摆放`);
    qc.invalidateQueries({ queryKey: ["boards"] });
    qc.invalidateQueries({ queryKey: ["board", String(target)] });
    qc.invalidateQueries({ queryKey: ["home"] });
    setAddBoardOpen(false);
    setSelectedIds([]);
    setPendingBoardIds([]);
    if (!stay && pickBoardId && Number(pickBoardId) === Number(target)) {
      nav(`/boards/${target}`);
    }
  }

  function openPreview(img: ImageItem) {
    setFilter("select", String(img.id));
    setPreviewOpen(true);
  }

  async function reprocessImages(imageIds: number[]) {
    if (!imageIds.length || reprocessing) return;
    setReprocessing(true);
    const hide = message.loading("正在重新提取姿态、景别和颜色…", 0);
    try {
      for (const id of imageIds) {
        const updated = await request<ImageItem>(`/api/v1/images/${id}/reprocess`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pose: true, color: true }),
        });
        qc.setQueryData(["image", id], updated);
        qc.setQueriesData({ queryKey: ["images"] }, (old: { items: ImageItem[]; total: number } | undefined) => {
          if (!old?.items) return old;
          return { ...old, items: old.items.map((item) => (item.id === id ? { ...item, ...updated, tags: item.tags } : item)) };
        });
      }
      hide();
      message.success(imageIds.length > 1 ? `已重新提取 ${imageIds.length} 张` : "已重新提取");
    } catch (err: unknown) {
      hide();
      message.error(err instanceof Error ? err.message : "重新提取失败");
    } finally {
      setReprocessing(false);
    }
  }

  async function patchColors(imageId: number, body: Record<string, unknown>) {
    await qc.cancelQueries({ queryKey: ["image", imageId] });
    await qc.cancelQueries({ queryKey: ["images"] });
    try {
      const updated = await request<ImageItem>(`/api/v1/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      qc.setQueryData(["image", imageId], updated);
      qc.setQueriesData({ queryKey: ["images"] }, (old: { items: ImageItem[]; total: number } | undefined) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((item) => (item.id === imageId ? { ...item, ...updated, tags: updated.tags || item.tags } : item)) };
      });
      if (params.get("select") !== String(imageId)) {
        const next = new URLSearchParams(params);
        next.set("select", String(imageId));
        setParams(next);
      }
      message.success("颜色已更新");
    } catch (err: unknown) {
      qc.invalidateQueries({ queryKey: ["image", imageId] });
      qc.invalidateQueries({ queryKey: ["images"] });
      message.error(err instanceof Error ? err.message : "颜色未能保存");
    }
  }

  async function patchFraming(imageId: number, body_framing: string) {
    const next = body_framing || "unknown";
    await qc.cancelQueries({ queryKey: ["image", imageId] });
    await qc.cancelQueries({ queryKey: ["images"] });
    qc.setQueryData(["image", imageId], (old: ImageItem | undefined) => (old ? { ...old, body_framing: next } : old));
    qc.setQueriesData({ queryKey: ["images"] }, (old: { items: ImageItem[]; total: number } | undefined) => {
      if (!old?.items) return old;
      return { ...old, items: old.items.map((item) => (item.id === imageId ? { ...item, body_framing: next } : item)) };
    });
    try {
      const updated = await request<ImageItem>(`/api/v1/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body_framing: next }),
      });
      qc.setQueryData(["image", imageId], updated);
      qc.setQueriesData({ queryKey: ["images"] }, (old: { items: ImageItem[]; total: number } | undefined) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((item) => (item.id === imageId ? { ...item, ...updated, tags: updated.tags || item.tags } : item)) };
      });
    } catch (err: unknown) {
      qc.invalidateQueries({ queryKey: ["image", imageId] });
      qc.invalidateQueries({ queryKey: ["images"] });
      message.error(err instanceof Error ? err.message : "景别未能保存");
    }
  }

  async function patchYaw(imageId: number, head_yaw: string) {
    const next = head_yaw || "unknown";
    await qc.cancelQueries({ queryKey: ["image", imageId] });
    await qc.cancelQueries({ queryKey: ["images"] });
    qc.setQueryData(["image", imageId], (old: ImageItem | undefined) => (old ? { ...old, head_yaw: next } : old));
    qc.setQueriesData({ queryKey: ["images"] }, (old: { items: ImageItem[]; total: number } | undefined) => {
      if (!old?.items) return old;
      return { ...old, items: old.items.map((item) => (item.id === imageId ? { ...item, head_yaw: next } : item)) };
    });
    try {
      const updated = await request<ImageItem>(`/api/v1/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ head_yaw: next }),
      });
      qc.setQueryData(["image", imageId], updated);
      qc.setQueriesData({ queryKey: ["images"] }, (old: { items: ImageItem[]; total: number } | undefined) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((item) => (item.id === imageId ? { ...item, ...updated, tags: updated.tags || item.tags } : item)) };
      });
    } catch (err: unknown) {
      qc.invalidateQueries({ queryKey: ["image", imageId] });
      qc.invalidateQueries({ queryKey: ["images"] });
      message.error(err instanceof Error ? err.message : "角度未能保存");
    }
  }

  async function removeImage(image: ImageItem) {
    const refs: { count: number } = await request(`/api/v1/images/${image.id}/board-refs`);
    const ok = window.confirm(refs.count ? `该图在 ${refs.count} 个画板中，删除后图卡会消失。继续？` : "确定删除这张图？");
    if (!ok) return;
    await request(`/api/v1/images/${image.id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["images"] });
    qc.invalidateQueries({ queryKey: ["home"] });
  }

  async function openBulkTags() {
    if (!selectedIds.length) return;
    const selected = items.filter((item) => selectedIds.includes(item.id));
    if (!selected.length) return;
    const initial = chipStatesFromImages(
      selected,
      (tags.data || []).map((t) => t.id)
    );
    setBulkInitial(initial);
    setBulkStates(initial);
    setBulkTagOpen(true);
  }

  async function saveBulkTags() {
    const { add, remove } = diffChipStates(
      bulkInitial,
      bulkStates,
      (tags.data || []).map((t) => t.id)
    );
    if (!add.length && !remove.length) {
      setBulkTagOpen(false);
      return;
    }
    await request("/api/v1/images/batch-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: selectedIds, add, remove }),
    });
    qc.invalidateQueries({ queryKey: ["images"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    for (const id of selectedIds) qc.invalidateQueries({ queryKey: ["image", id] });
    message.success(`已更新 ${selectedIds.length} 张图的标签`);
    setBulkTagOpen(false);
  }

  function ignoreMarqueeTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return true;
    return Boolean(target.closest("button, .ant-checkbox-wrapper, input, textarea, a, .pb-banner, .pb-lib-sticky"));
  }

  function onGalleryPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if (ignoreMarqueeTarget(e.target)) return;
    marqueeDrag.current = {
      start: { x: e.clientX, y: e.clientY },
      mode: e.ctrlKey || e.metaKey ? "subtract" : e.shiftKey ? "add" : "replace",
    };
  }

  function onGalleryPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = marqueeDrag.current;
    if (!drag) return;
    if (!selectingRef.current) {
      if (!shouldStartMarquee(e.clientX - drag.start.x, e.clientY - drag.start.y)) return;
      selectingRef.current = true;
      skipClickRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const box = rectFromPoints(drag.start, { x: e.clientX, y: e.clientY });
    marqueeBox.current = box;
    setMarquee(box);
  }

  function onGalleryPointerUp(e: PointerEvent<HTMLDivElement>) {
    const drag = marqueeDrag.current;
    marqueeDrag.current = null;
    const box = marqueeBox.current;
    marqueeBox.current = null;
    setMarquee(null);
    if (!selectingRef.current) return;
    selectingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!drag || !box) return;
    const thumbs = items
      .map((img) => {
        const el = document.getElementById(`lib-thumb-${img.id}`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { id: img.id, rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
      })
      .filter((thumb): thumb is { id: number; rect: Rect } => Boolean(thumb));
    setSelectedIds((prev) => mergeSelection(prev, idsHitByMarquee(thumbs, box), drag.mode));
  }

  const groups =
    poseQuery?.status === "ok" && poseQuery.items.length
      ? [{ key: "pose-search", label: "姿态相似", items }]
      : groupByAlbumDate(items);
  const pickBoard = (boards.data || []).find((b) => String(b.id) === pickBoardId);

  function targetIds(imageId: number) {
    return selectedIds.includes(imageId) && selectedIds.length ? selectedIds : [imageId];
  }

  function contextItems(img: ImageItem) {
    const ids = targetIds(img.id);
    return [
      { key: "preview", label: "大图预览", onClick: () => openPreview(img) },
      pickBoardId
        ? { key: "pick", label: `导入到「${pickBoard?.name || "当前画板"}」`, onClick: () => addManyToBoard(ids, Number(pickBoardId)) }
        : {
            key: "import",
            label: "导入到画板",
            children: (boards.data || []).length
              ? (boards.data || []).map((b) => ({
                  key: `b-${b.id}`,
                  label: `${b.name}（底部 ${b.tray_count || 0} 张）`,
                  onClick: () => addManyToBoard(ids, b.id),
                }))
              : [{ key: "new", label: "新建画板并导入", onClick: () => addManyToBoard(ids) }],
          },
      {
        key: "reprocess",
        label: "重新提取",
        disabled: reprocessing,
        onClick: () => void reprocessImages(ids),
      },
      {
        key: "del",
        label: "删除",
        danger: true,
        onClick: async () => {
          if (!window.confirm(ids.length > 1 ? `删除选中的 ${ids.length} 张图？` : "确定删除这张图？")) return;
          for (const id of ids) {
            const item = items.find((x) => x.id === id);
            if (item) await removeImage(item);
          }
        },
      },
    ];
  }

  function cacheImage(updated: ImageItem) {
    qc.setQueryData(["image", updated.id], updated);
    qc.setQueriesData({ queryKey: ["images"] }, (old: { items: ImageItem[]; total: number } | undefined) => {
      if (!old?.items) return old;
      return { ...old, items: old.items.map((item) => (item.id === updated.id ? { ...item, ...updated, tags: updated.tags || item.tags } : item)) };
    });
  }

  function beginPreviewCrop() {
    if (!current) {
      message.info("先选一张图再截取");
      return;
    }
    setPreviewOpen(true);
    setWantCrop(true);
  }

  async function saveCropToLibrary(dataUrl: string) {
    if (capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    const hide = message.loading("正在提取姿态和颜色…", 0);
    try {
      await importCroppedDataUrl(dataUrl, { extract: true, inLibrary: true });
      qc.invalidateQueries({ queryKey: ["images"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      hide();
      message.success("已加入图库，可继续截取");
    } catch (err: unknown) {
      hide();
      message.error(err instanceof Error ? err.message : "加入图库失败");
      throw err;
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }

  async function saveCropToBoard(dataUrl: string) {
    if (capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    const hide = message.loading("正在加入画板…", 0);
    try {
      const item = await importCroppedDataUrl(dataUrl, { extract: false, inLibrary: false });
      hide();
      if (pickBoardId) {
        await addManyToBoard([item.id], Number(pickBoardId), true);
        return;
      }
      setPendingBoardIds((ids) => [...ids, item.id]);
      setAddBoardOpen(true);
    } catch (err: unknown) {
      hide();
      message.error(err instanceof Error ? err.message : "加入画板失败");
      throw err;
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }
  captureToBoardRef.current = beginPreviewCrop;

  function detailMenu(img: ImageItem) {
    return [
      { key: "preview", label: "大图预览", onClick: () => openPreview(img) },
      { key: "extract", label: "提取色卡", onClick: () => setPaletteOpen(true) },
      {
        key: "copyHex",
        label: "复制全部色号",
        disabled: !img.palette?.length,
        onClick: () =>
          void copyText(paletteHexList(img.palette)).then(
            () => message.success("已复制全部色号"),
            () => message.error("复制失败")
          ),
      },
      {
        key: "export",
        label: "导出色卡 PNG",
        disabled: !img.palette?.length,
        onClick: () =>
          void saveDataUrl(`${img.uid}-色卡.png`, paletteCardDataUrl(img.palette, "色卡")).then((ok) => {
            if (ok) message.success("色卡已导出");
          }),
      },
      { type: "divider" as const },
      {
        key: "locate",
        label: "定位到图库",
        onClick: () => {
          setDetailOutline(true);
          locateInGallery(img.id);
        },
      },
      pickBoardId
        ? { key: "pick", label: `导入到「${pickBoard?.name || "当前画板"}」`, onClick: () => addManyToBoard([img.id], Number(pickBoardId)) }
        : {
            key: "board",
            label: "加入画板",
            onClick: () => {
              if (boards.data?.length) setAddBoardOpen(true);
              else void addToBoard(img.id);
            },
          },
      { type: "divider" as const },
      {
        key: "copyImg",
        label: "复制原图",
        onClick: () => {
          if (!img.local_path) {
            message.error("找不到原文件");
            return;
          }
          void copyImageFromFile(img.local_path).then(
            () => message.success("已复制原图"),
            (err: unknown) => message.error(err instanceof Error ? err.message : "复制失败")
          );
        },
      },
      {
        key: "folder",
        label: "在文件夹中显示",
        onClick: () => {
          if (!img.local_path) {
            message.error("找不到原文件");
            return;
          }
          void showInFolder(img.local_path).then(
            () => undefined,
            (err: unknown) => message.error(err instanceof Error ? err.message : "无法打开文件夹")
          );
        },
      },
      {
        key: "size",
        label: `复制尺寸 ${img.width}×${img.height}`,
        onClick: () =>
          void copyText(`${img.width}×${img.height}`).then(
            () => message.success("已复制尺寸"),
            () => message.error("复制失败")
          ),
      },
    ];
  }

  const filtersOpen = filterPinned || filtersHover;

  return (
    <div
      className={`library-page is-${filterLayout} ${filterPinned ? "is-pinned" : "is-unpinned"}${
        filtersOpen ? " is-filters-open" : ""
      }`}
    >
      <div className="pb-lib-filter-dock" onMouseEnter={openFilters} onMouseLeave={scheduleCloseFilters}>
        {filterPinned ? null : (
          <div className="pb-lib-filter-rail" title="移入显示筛选">
            筛选
          </div>
        )}
        <div className="pb-scroll pb-lib-col pb-lib-filters">
          <div className="pb-filter-block">
            <div className="pb-section-title">大类</div>
            <TagChipBar
              tags={tree.categories}
              selected={(t) => selectedTagSet.has(String(t.id)) || tree.facets.some((f) => f.parent_id === t.id && selectedTagSet.has(String(f.id)))}
              onSelect={toggleHierarchy}
              onReorder={reorderTagGroup}
              onRename={openRenameTag}
              onDelete={deleteTag}
              extra={
                <Button className="pb-chip" size="small" onClick={() => openTagModal("category")}>
                  +
                </Button>
              }
            />
          </div>
          <div className="pb-filter-block">
            <div className="pb-section-title">细分</div>
            {activeParentId ? (
              <TagChipBar
                tags={visibleFacets}
                selected={(t) => selectedTagSet.has(String(t.id))}
                onSelect={toggleHierarchy}
                onReorder={reorderTagGroup}
                onRename={openRenameTag}
                onDelete={deleteTag}
                extra={
                  <Button className="pb-chip" size="small" onClick={() => openTagModal("facet", activeParentId)}>
                    +
                  </Button>
                }
              />
            ) : (
              <div className="pb-hint">先选大类，再按正面 / 侧面等细分</div>
            )}
          </div>
          <div className="pb-filter-block">
            <div className="pb-section-title">景别</div>
            <FramingPicker value={bodyFraming} allowEmpty onChange={(v) => setFilter("body_framing", v)} />
          </div>
          <div className="pb-filter-block">
            <div className="pb-section-title">朝向</div>
            <HeadYawPicker value={headYaw} allowEmpty onChange={(v) => setFilter("head_yaw", v)} />
          </div>
          <div className="pb-filter-block">
            <div className="pb-section-title">自定义标签</div>
            <TagChipBar
              tags={tree.custom}
              selected={(t) => selectedTagSet.has(String(t.id))}
              onSelect={(t) => toggleCustom(t.id)}
              onReorder={reorderTagGroup}
              onRename={openRenameTag}
              onDelete={deleteTag}
              extra={
                <Button className="pb-chip" size="small" onClick={() => openTagModal("custom")}>
                  新建
                </Button>
              }
            />
          </div>
          <div className="pb-filter-block">
            <div className="pb-section-title">主色</div>
            <FamilyPicker value={families} allowEmpty onChange={(v) => setFilter("families", v)} />
          </div>
          <div className="pb-filter-block">
            <div className="pb-section-title">副色</div>
            <div className="pb-hint" style={{ marginBottom: 6 }}>
              主色之外的第二种颜色；单色图会空着
            </div>
            <FamilyPicker value={secondary} allowEmpty onChange={(v) => setFilter("secondary", v)} />
          </div>
          <div className="pb-filter-block">
            <div className="pb-section-title">姿态</div>
            <PoseQueryCard />
          </div>
        </div>
      </div>
      <div
        className={`pb-scroll pb-lib-col pb-lib-gallery${marquee ? " is-marquee" : ""}`}
        data-lib-gallery
        title="拖拽框选，Shift 追加，Ctrl 取消选中"
        onPointerDown={onGalleryPointerDown}
        onPointerMove={onGalleryPointerMove}
        onPointerUp={onGalleryPointerUp}
        onPointerCancel={onGalleryPointerUp}
      >
        {pickBoardId || selectedIds.length ? (
          <div className="pb-lib-sticky">
            {pickBoardId ? (
              <div className="pb-banner">
                <span>勾选后点加入，会出现在「{pickBoard?.name || "画板"}」底部</span>
                <Button type="primary" size="small" disabled={!selectedIds.length} onClick={() => addManyToBoard(selectedIds, Number(pickBoardId))}>
                  加入选中的 {selectedIds.length || 0} 张
                </Button>
                <Button size="small" onClick={() => nav(`/boards/${pickBoardId}`)}>
                  返回画板
                </Button>
              </div>
            ) : null}
            {selectedIds.length ? (
              <div className="pb-banner pb-banner-select">
                <span>已选 {selectedIds.length} 张 · Shift 追加 · Ctrl 取消</span>
                <Button size="small" type="primary" onClick={() => void openBulkTags()}>
                  编辑标签
                </Button>
                <Button
                  size="small"
                  disabled={items.every((img) => selectedIds.includes(img.id))}
                  onClick={() => setSelectedIds(items.map((img) => img.id))}
                >
                  全选
                </Button>
                <Button size="small" onClick={() => setSelectedIds([])}>
                  取消选择
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {items.length === 0 ? (
          <Empty description={families || secondary || tagIds || poseStatus || failed || poseQuery?.status === "ok" ? "没有符合筛选的图片" : "导入图片开始使用"} />
        ) : (
          groups.map((group) => (
            <div key={group.key} style={{ marginBottom: 20 }}>
              <h3 className="pb-album-title">
                {group.label}
                <span className="pb-album-count">{group.items.length} 张</span>
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {group.items.map((img) => (
                  <Dropdown key={img.id} trigger={["contextMenu"]} menu={{ items: contextItems(img) }}>
                    <div
                      id={`lib-thumb-${img.id}`}
                      className={`pb-lib-thumb${flashId === img.id || String(img.id) === selectId ? " is-on" : ""}${
                        selectedIds.includes(img.id) ? " is-picked" : ""
                      }`}
                      style={{ position: "relative" }}
                    >
                      <Checkbox
                        checked={selectedIds.includes(img.id)}
                        onChange={(e) => {
                          setSelectedIds((ids) => (e.target.checked ? [...ids, img.id] : ids.filter((x) => x !== img.id)));
                        }}
                        style={{ position: "absolute", zIndex: 1, margin: 4 }}
                      />
                      <MediaImg
                        thumb={img.thumbnail_url}
                        original={img.original_url}
                        width={120}
                        height={120}
                        title="单击查看，拖拽框选，双击勾选"
                        style={{
                          cursor: "pointer",
                          userSelect: "none",
                          borderRadius: 8,
                        }}
                        onClick={() => {
                          if (skipClickRef.current) {
                            skipClickRef.current = false;
                            return;
                          }
                          setFilter("select", String(img.id));
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleChecked(img.id);
                        }}
                        draggable={false}
                      />
                    </div>
                  </Dropdown>
                ))}
              </div>
            </div>
          ))
        )}
        {poseQuery?.status === "ok" ? (
          <div className="pb-pose-back">
            <Button onClick={exitToLibrary}>返回图库</Button>
          </div>
        ) : null}
        {marquee ? (
          <div className="pb-lib-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />
        ) : null}
      </div>
      <div className="pb-scroll pb-lib-col pb-lib-detail">
        {current ? (
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <div className="pb-detail-actions">
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  if (pickBoardId) addManyToBoard(selectedIds.length ? selectedIds : [current.id], Number(pickBoardId));
                  else if (boards.data?.length) setAddBoardOpen(true);
                  else addToBoard(current.id);
                }}
              >
                {pickBoardId ? "导入到当前画板" : "加入画板"}
              </Button>
              <Button size="small" loading={reprocessing} disabled={reprocessing} onClick={() => void reprocessImages([current.id])}>
                重新提取
              </Button>
              <Button size="small" danger onClick={() => removeImage(current)}>
                删除
              </Button>
            </div>
            <div className="pb-detail-hero">
            <Dropdown trigger={["contextMenu"]} menu={{ items: detailMenu(current) }}>
              <div
                className={`pb-detail-frame${detailTap ? " is-tap" : ""}${detailOutline ? " is-on" : ""}`}
                onMouseDown={() => setDetailTap(true)}
                onMouseUp={() => window.setTimeout(() => setDetailTap(false), 140)}
                onMouseLeave={() => setDetailTap(false)}
                onDoubleClick={() => {
                  if (previewClick.current) {
                    window.clearTimeout(previewClick.current);
                    previewClick.current = null;
                  }
                  setPreviewOpen(false);
                  setDetailOutline(true);
                  locateInGallery(current.id);
                }}
                onClick={() => {
                  if (previewClick.current) window.clearTimeout(previewClick.current);
                  previewClick.current = window.setTimeout(() => {
                    previewClick.current = null;
                    setPreviewOpen(true);
                  }, 220);
                }}
              >
                <div className="pb-detail-img">
                  <MediaImg
                    thumb={current.original_url}
                    original={current.original_url}
                    title="单击大图可放大预览；右键可提取色卡、导出、复制原图；双击描边并定位"
                    style={{ width: "100%", height: "auto", cursor: "pointer", userSelect: "none" }}
                  />
                  {(showSkeleton && hasPoseOverlay(current)) || (showFace && hasFaceOverlay(current)) ? (
                    <PoseOverlay
                      landmarks={current.pose_landmarks}
                      skeleton={showSkeleton && hasPoseOverlay(current)}
                      face={showFace && hasFaceOverlay(current)}
                    />
                  ) : null}
                </div>
              </div>
            </Dropdown>
            <div className="pb-palette">
              {current.palette.map((c) => (
                <button
                  key={`${c.hex}-${c.ratio}`}
                  type="button"
                  className="pb-palette-chip"
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
              ))}
            </div>
            </div>
            <div className="pb-pose-row">
              <span className="pb-hint">
                姿态：{poseStatusText(current.pose_status)}
                {(current.pose_people || 0) > 1 ? ` · ${current.pose_people} 人，景别/朝向按主体` : ""}
              </span>
              <Tooltip title={hasPoseOverlay(current) ? "" : "这张图没有可用的姿态关键点"}>
                <span>
                  <Button
                    size="small"
                    type={showSkeleton ? "primary" : "default"}
                    disabled={!hasPoseOverlay(current)}
                    onClick={() => setShowSkeleton((on) => !on)}
                  >
                    {showSkeleton ? "隐藏骨架" : "显示骨架"}
                  </Button>
                </span>
              </Tooltip>
              <Tooltip title={hasFaceOverlay(current) ? "" : "这张图没有可用的人脸关键点"}>
                <span>
                  <Button
                    size="small"
                    type={showFace ? "primary" : "default"}
                    disabled={!hasFaceOverlay(current)}
                    onClick={() => setShowFace((on) => !on)}
                  >
                    {showFace ? "隐藏人脸" : "显示人脸"}
                  </Button>
                </span>
              </Tooltip>
            </div>
            <div>
              <div className="pb-section-title">景别</div>
              <FramingPicker compact value={current.body_framing || ""} onChange={(v) => void patchFraming(current.id, v)} />
            </div>
            <div>
              <div className="pb-section-title">
                朝向
                {current.pose_status === "pending" ? <span className="pb-hint">排队中，上次结果</span> : null}
              </div>
              <HeadYawPicker compact value={current.head_yaw || ""} onChange={(v) => void patchYaw(current.id, v)} />
            </div>
            <div>
              <div className="pb-section-title">主色</div>
              <FamilyDropdown value={current.primary_family} onChange={(v) => patchColors(current.id, { primary_family: v })} />
            </div>
            <div>
              <div className="pb-section-title">副色</div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                <FamilyDropdown
                  value={current.secondary_family || ""}
                  allowEmpty
                  onChange={(v) =>
                    patchColors(current.id, {
                      secondary_family: v,
                      extra_families: (current.extra_families || []).filter((x) => x !== v),
                    })
                  }
                />
                {(current.extra_families || []).map((f) => (
                  <span key={f} style={{ display: "inline-flex", alignItems: "center" }}>
                    <FamilyDropdown
                      value={f}
                      onChange={(v) => {
                        const next = (current.extra_families || []).map((x) => (x === f ? v : x)).filter((x, i, arr) => x && arr.indexOf(x) === i && x !== current.secondary_family);
                        patchColors(current.id, { extra_families: next });
                      }}
                    />
                    <button
                      type="button"
                      aria-label={`移除${familyText(f)}`}
                      onClick={() =>
                        patchColors(current.id, { extra_families: (current.extra_families || []).filter((x) => x !== f) })
                      }
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "#999",
                        padding: "0 2px",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <FamilyDropdown
                  trigger="add"
                  exclude={[current.primary_family, current.secondary_family, ...(current.extra_families || [])].filter(
                    (x): x is string => Boolean(x)
                  )}
                  onChange={(v) => {
                    if (!v || v === current.secondary_family || (current.extra_families || []).includes(v)) return;
                    if (!current.secondary_family) {
                      patchColors(current.id, { secondary_family: v });
                      return;
                    }
                    patchColors(current.id, { extra_families: [...(current.extra_families || []), v] });
                  }}
                />
              </div>
            </div>
            <div>
              <div className="pb-section-title">大类</div>
              <Space wrap size={[4, 4]}>
                {tree.categories.map((t) => {
                  const on = current.tags.some((x) => x.id === t.id);
                  return (
                    <Button className="pb-chip" key={t.id} size="small" type={on ? "primary" : "default"} onClick={() => toggleImageTag(current, t)}>
                      {t.name}
                    </Button>
                  );
                })}
              </Space>
            </div>
            <div>
              <div className="pb-section-title">细分</div>
              <Space wrap size={[4, 4]}>
                {(current.tags.some((x) => x.kind === "category")
                  ? tree.facets.filter((f) => current.tags.some((x) => x.id === f.parent_id) || current.tags.some((x) => x.id === f.id))
                  : tree.facets.filter((f) => f.parent_id === tree.categories[0]?.id)
                ).map((t) => {
                  const on = current.tags.some((x) => x.id === t.id);
                  return (
                    <Button className="pb-chip" key={t.id} size="small" type={on ? "primary" : "default"} onClick={() => toggleImageTag(current, t)}>
                      {t.name}
                    </Button>
                  );
                })}
              </Space>
            </div>
            {tree.custom.length ? (
              <div>
                <div className="pb-section-title">自定义</div>
                <Space wrap size={[4, 4]}>
                  {tree.custom.map((t) => {
                    const on = current.tags.some((x) => x.id === t.id);
                    return (
                      <Button className="pb-chip" key={t.id} size="small" type={on ? "primary" : "default"} onClick={() => toggleImageTag(current, t)}>
                        {t.name}
                      </Button>
                    );
                  })}
                </Space>
              </div>
            ) : null}
            <div>
              <div className="pb-section-title">备注</div>
              <Input.TextArea
                defaultValue={current.notes}
                key={current.id}
                placeholder="写一点这张图的备注"
                onBlur={async (e) => {
                  const notes = e.target.value;
                  try {
                    await request(`/api/v1/images/${current.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ notes }),
                    });
                    qc.setQueryData(["image", current.id], (old: ImageItem | undefined) => (old ? { ...old, notes } : old));
                  } catch (err: unknown) {
                    message.error(err instanceof Error ? err.message : "备注未能保存");
                  }
                }}
              />
            </div>
          </Space>
        ) : (
          <Empty description="选择一张图" />
        )}
      </div>
      <ImagePreview
        open={previewOpen && Boolean(current) && Boolean(previewSrc)}
        src={previewSrc}
        width={current?.width}
        height={current?.height}
        startCrop={wantCrop}
        onStartCropConsumed={() => setWantCrop(false)}
        onClose={() => setPreviewOpen(false)}
        onAddToLibrary={saveCropToLibrary}
        onAddToBoard={saveCropToBoard}
        screenshotBusy={capturing}
      />
      <PaletteExtractModal
        open={paletteOpen}
        image={current || null}
        onClose={() => setPaletteOpen(false)}
        onApplied={cacheImage}
      />
      <Modal
        title="加入哪块画板？"
        open={addBoardOpen}
        zIndex={1400}
        footer={null}
        onCancel={() => {
          const leftover = pendingBoardIds;
          setAddBoardOpen(false);
          setPendingBoardIds([]);
          leftover.forEach((id) => {
            void request(`/api/v1/images/${id}`, { method: "DELETE" });
          });
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          {(boards.data || []).map((b) => (
            <Button
              key={b.id}
              block
              onClick={() =>
                addManyToBoard(
                  pendingBoardIds.length ? pendingBoardIds : selectedIds.length ? selectedIds : current ? [current.id] : [],
                  b.id,
                  previewOpen
                )
              }
            >
              {b.name}（底部 {b.tray_count || 0} 张）
            </Button>
          ))}
          {(boards.data || []).length === 0 ? (
            <Button
              type="primary"
              block
              onClick={() =>
                addManyToBoard(
                  pendingBoardIds.length ? pendingBoardIds : selectedIds.length ? selectedIds : current ? [current.id] : [],
                  undefined,
                  previewOpen
                )
              }
            >
              新建画板并加入
            </Button>
          ) : null}
        </Space>
      </Modal>
      <Modal
        title={
          tagModal?.mode === "rename"
            ? "更改标签"
            : tagModal && tagModal.mode === "create" && tagModal.kind === "category"
              ? "新建大类"
              : tagModal && tagModal.mode === "create" && tagModal.kind === "facet"
                ? "新建细分"
                : "新建自定义标签"
        }
        open={Boolean(tagModal)}
        onOk={() => void submitTagModal()}
        onCancel={() => {
          setTagModal(null);
          setTagName("");
        }}
        okButtonProps={{ disabled: !tagName.trim() }}
      >
        <Input
          autoFocus
          value={tagName}
          placeholder="输入名称"
          onChange={(e) => setTagName(e.target.value)}
          onPressEnter={() => void submitTagModal()}
        />
      </Modal>
      <Modal
        title={`编辑 ${selectedIds.length} 张图的标签`}
        open={bulkTagOpen}
        okText="保存"
        cancelText="取消"
        onOk={() => void saveBulkTags()}
        onCancel={() => setBulkTagOpen(false)}
        width={520}
      >
        <p className="pb-hint" style={{ marginTop: 0 }}>
          高亮表示全部已有，带点表示部分已有。点一下会加到全部，再点从全部去掉。
        </p>
        <TagPickPanel
          tags={tags.data || []}
          states={bulkStates}
          onToggle={(tag) => setBulkStates((prev) => ({ ...prev, [tag.id]: toggleChipState(prev[tag.id] || "off") }))}
        />
      </Modal>
    </div>
  );
}
