import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Select, Space, Empty, message, Checkbox, Modal, Dropdown } from "antd";
import { useImage, useImages, useTags, useBoards } from "../api/hooks";
import { request } from "../api/client";
import { type ImageItem, type Tag } from "../types";
import { familyText, poseStatusText } from "../i18n";
import { useQueryClient } from "@tanstack/react-query";
import { groupByAlbumDate } from "../album";
import MediaImg from "../components/MediaImg";
import FamilyPicker, { FamilyDropdown } from "../components/FamilyPicker";
import TagChipBar from "../components/TagChipBar";
import { replaceGroup } from "../tagOrder";

function splitTags(tags: Tag[]) {
  const categories = tags.filter((t) => t.kind === "category");
  const facets = tags.filter((t) => t.kind === "facet");
  const custom = tags.filter((t) => t.kind !== "category" && t.kind !== "facet");
  return { categories, facets, custom };
}

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [addBoardOpen, setAddBoardOpen] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [tagModal, setTagModal] = useState<
    | { mode: "create"; kind: "category" | "facet" | "custom"; parentId?: number }
    | { mode: "rename"; tag: Tag }
    | null
  >(null);
  const [tagName, setTagName] = useState("");
  const tagIds = params.get("tag_ids") || "";
  const families = params.get("families") || "";
  const secondary = params.get("secondary") || "";
  const poseStatus = params.get("pose_status") || "";
  const failed = params.get("failed") || "";
  const selectId = params.get("select");
  const pickBoardId = params.get("add_to_board") || "";

  const images = useImages({ tag_ids: tagIds, families, secondary, pose_status: poseStatus, failed, limit: 1000 });
  const selectedId = selectId ? Number(selectId) : undefined;
  const selectedImage = useImage(selectedId);
  const tags = useTags();
  const boards = useBoards();
  const current = selectId
    ? selectedImage.data || images.data?.items.find((i) => String(i.id) === selectId)
    : images.data?.items[0];
  const tree = splitTags(tags.data || []);
  const selectedTagSet = useMemo(() => new Set(tagIds.split(",").filter(Boolean)), [tagIds]);
  const selectedCategory = tree.categories.find((c) => selectedTagSet.has(String(c.id)));
  const selectedFacet = tree.facets.find((f) => selectedTagSet.has(String(f.id)));
  const activeParentId = selectedFacet?.parent_id || selectedCategory?.id;
  const visibleFacets = tree.facets.filter((f) => f.parent_id === activeParentId);

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
    const visible = images.data?.items.some((item) => item.id === imageId);
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

  async function addManyToBoard(imageIds: number[], boardId?: number) {
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
    if (pickBoardId && Number(pickBoardId) === Number(target)) {
      nav(`/boards/${target}`);
    }
  }

  async function reprocessImages(imageIds: number[]) {
    if (!imageIds.length || reprocessing) return;
    setReprocessing(true);
    const hide = message.loading("正在重新提取姿态和颜色…", 0);
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

  async function removeImage(image: ImageItem) {
    const refs: { count: number } = await request(`/api/v1/images/${image.id}/board-refs`);
    const ok = window.confirm(refs.count ? `该图在 ${refs.count} 个画板中，删除后图卡会消失。继续？` : "确定删除这张图？");
    if (!ok) return;
    await request(`/api/v1/images/${image.id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["images"] });
    qc.invalidateQueries({ queryKey: ["home"] });
  }

  async function batchTag() {
    if (!selectedIds.length) return;
    const custom = tree.custom[0] || tree.categories[0];
    if (!custom) return message.info("请先创建标签");
    await request("/api/v1/images/batch-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: selectedIds, add: [custom.id], remove: [] }),
    });
    qc.invalidateQueries({ queryKey: ["images"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
  }

  const items = images.data?.items || [];
  const groups = groupByAlbumDate(items);
  const pickBoard = (boards.data || []).find((b) => String(b.id) === pickBoardId);

  function targetIds(imageId: number) {
    return selectedIds.includes(imageId) && selectedIds.length ? selectedIds : [imageId];
  }

  function contextItems(img: ImageItem) {
    const ids = targetIds(img.id);
    return [
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

  return (
    <div
      className="library-page"
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr 300px",
        gridTemplateRows: "minmax(0, 1fr)",
        gap: 12,
        height: "100%",
        minHeight: 0,
      }}
    >
      <div className="pb-scroll pb-lib-col pb-lib-filters">
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
        <div className="pb-section-title" style={{ marginTop: 18 }}>细分</div>
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
        <div className="pb-section-title" style={{ marginTop: 18 }}>自定义标签</div>
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
        <div className="pb-section-title" style={{ marginTop: 18 }}>主色</div>
        <FamilyPicker value={families} allowEmpty onChange={(v) => setFilter("families", v)} />
        <div className="pb-section-title" style={{ marginTop: 18 }}>副色</div>
        <div className="pb-hint" style={{ marginBottom: 6 }}>主色之外的第二种颜色；单色图会空着</div>
        <FamilyPicker value={secondary} allowEmpty onChange={(v) => setFilter("secondary", v)} />
        <div className="pb-section-title" style={{ marginTop: 18 }}>姿态</div>
        <Select
          allowClear
          style={{ width: "100%" }}
          value={poseStatus || undefined}
          options={[
            { value: "ok", label: "有姿态" },
            { value: "none", label: "无人体" },
            { value: "failed", label: "失败" },
            { value: "pending", label: "排队中" },
          ]}
          onChange={(v) => setFilter("pose_status", v || "")}
        />
      </div>
      <div className="pb-scroll pb-lib-col pb-lib-gallery" data-lib-gallery>
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
          <div className="pb-banner" style={{ background: "#f7f8fa", borderColor: "#eceef2" }}>
            <span>已选 {selectedIds.length} 张</span>
            <Button size="small" onClick={batchTag}>
              批量加第一个自定义标签
            </Button>
            <Button size="small" onClick={() => setSelectedIds([])}>
              取消选择
            </Button>
          </div>
        ) : null}
        {items.length === 0 ? (
          <Empty description={families || secondary || tagIds || poseStatus || failed ? "没有符合筛选的图片" : "导入图片开始使用"} />
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
                      className={`pb-lib-thumb${flashId === img.id || String(img.id) === selectId ? " is-on" : ""}`}
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
                        title="单击查看，双击勾选"
                        style={{
                          cursor: "pointer",
                          userSelect: "none",
                          borderRadius: 8,
                        }}
                        onClick={() => setFilter("select", String(img.id))}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleChecked(img.id);
                        }}
                      />
                    </div>
                  </Dropdown>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="pb-scroll pb-lib-col pb-lib-detail">
        {current ? (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div className="pb-detail-img">
              <MediaImg
                thumb={current.original_url}
                original={current.original_url}
                title="双击定位到图库"
                style={{ width: "100%", height: "auto", cursor: "pointer", userSelect: "none" }}
                onDoubleClick={() => locateInGallery(current.id)}
              />
            </div>
            <div className="pb-palette">
              {current.palette.slice(0, 5).map((c) => (
                <span
                  key={c.hex}
                  title={`${familyText(c.family)} ${Math.round(c.ratio * 100)}%`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
            <div className="pb-hint">姿态：{poseStatusText(current.pose_status)}</div>
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
            <Space>
              <Button
                type="primary"
                onClick={() => {
                  if (pickBoardId) addManyToBoard(selectedIds.length ? selectedIds : [current.id], Number(pickBoardId));
                  else if (boards.data?.length) setAddBoardOpen(true);
                  else addToBoard(current.id);
                }}
              >
                {pickBoardId ? "导入到当前画板" : "加入画板"}
              </Button>
              <Button loading={reprocessing} disabled={reprocessing} onClick={() => void reprocessImages([current.id])}>
                重新提取
              </Button>
              <Button danger onClick={() => removeImage(current)}>
                删除
              </Button>
            </Space>
          </Space>
        ) : (
          <Empty description="选择一张图" />
        )}
      </div>
      <Modal title="加入哪块画板？" open={addBoardOpen} footer={null} onCancel={() => setAddBoardOpen(false)}>
        <Space direction="vertical" style={{ width: "100%" }}>
          {(boards.data || []).map((b) => (
            <Button key={b.id} block onClick={() => addManyToBoard(selectedIds.length ? selectedIds : current ? [current.id] : [], b.id)}>
              {b.name}（底部 {b.tray_count || 0} 张）
            </Button>
          ))}
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
    </div>
  );
}
