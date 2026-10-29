import { Button, Input, Space } from "antd";
import { useState } from "react";
import type { Tag } from "../types";
import { splitTagGroups, visibleFacetsForStates, type ChipState } from "../tagPick";

export default function TagPickPanel({
  tags,
  states,
  onToggle,
  onCreateCustom,
}: {
  tags: Tag[];
  states: Record<number, ChipState>;
  onToggle: (tag: Tag) => void;
  onCreateCustom?: (name: string) => Promise<void> | void;
}) {
  const tree = splitTagGroups(tags);
  const facets = visibleFacetsForStates(tree.facets, states);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  function chip(tag: Tag) {
    const state = states[tag.id] || "off";
    return (
      <Button
        key={tag.id}
        className={`pb-chip${state === "mixed" ? " is-mixed" : ""}`}
        size="small"
        type={state === "on" ? "primary" : "default"}
        onClick={() => onToggle(tag)}
      >
        {tag.name}
        {state === "mixed" ? " ·" : ""}
      </Button>
    );
  }

  async function createCustom() {
    const trimmed = name.trim();
    if (!trimmed || !onCreateCustom || saving) return;
    setSaving(true);
    try {
      await onCreateCustom(trimmed);
      setName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div>
        <div className="pb-section-title">大类</div>
        <Space wrap size={[4, 4]}>
          {tree.categories.map(chip)}
        </Space>
      </div>
      {facets.length ? (
        <div>
          <div className="pb-section-title">细分</div>
          <Space wrap size={[4, 4]}>
            {facets.map(chip)}
          </Space>
        </div>
      ) : (
        <div className="pb-hint">选一个大类后可以再加细分</div>
      )}
      {tree.custom.length || onCreateCustom ? (
        <div>
          <div className="pb-section-title">自定义</div>
          <Space wrap size={[4, 4]}>
            {tree.custom.map(chip)}
          </Space>
          {onCreateCustom ? (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Input
                size="small"
                value={name}
                placeholder="新建自定义标签"
                onChange={(e) => setName(e.target.value)}
                onPressEnter={() => void createCustom()}
              />
              <Button size="small" disabled={!name.trim() || saving} onClick={() => void createCustom()}>
                添加
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Space>
  );
}
