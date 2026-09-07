import { useRef, type ReactNode } from "react";
import { Button, Dropdown } from "antd";
import type { Tag } from "../types";
import { moveById } from "../tagOrder";

export default function TagChipBar({
  tags,
  selected,
  onSelect,
  onReorder,
  onRename,
  onDelete,
  extra,
}: {
  tags: Tag[];
  selected: (tag: Tag) => boolean;
  onSelect: (tag: Tag) => void;
  onReorder: (ordered: Tag[]) => void;
  onRename: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
  extra?: ReactNode;
}) {
  const dragging = useRef(false);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      {tags.map((tag) => (
        <span
          key={tag.id}
          draggable
          title="拖动可改顺序，右键可更改或删除"
          onDragStart={(e) => {
            dragging.current = true;
            e.dataTransfer.setData("text/plain", String(tag.id));
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const fromId = Number(e.dataTransfer.getData("text/plain"));
            onReorder(moveById(tags, fromId, tag.id));
          }}
          onDragEnd={() => {
            window.setTimeout(() => {
              dragging.current = false;
            }, 0);
          }}
          style={{ cursor: "grab" }}
        >
          <Dropdown
            trigger={["contextMenu"]}
            menu={{
              items: [
                { key: "rename", label: "更改", onClick: () => onRename(tag) },
                { key: "delete", label: "删除", danger: true, onClick: () => onDelete(tag) },
              ],
            }}
          >
            <Button
              className="pb-chip"
              size="small"
              type={selected(tag) ? "primary" : "default"}
              onClick={() => {
                if (dragging.current) return;
                onSelect(tag);
              }}
            >
              {tag.name}
            </Button>
          </Dropdown>
        </span>
      ))}
      {extra}
    </div>
  );
}
