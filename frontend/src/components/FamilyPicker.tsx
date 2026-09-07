import { useState, type CSSProperties, type MouseEvent } from "react";
import { COLOR_FAMILIES, FAMILY_LABEL, FAMILY_SWATCH } from "../types";

function familyName(family?: string | null) {
  if (!family) return "无";
  return FAMILY_LABEL[family] || family;
}

function swatchStyle(family?: string | null, size = 18): CSSProperties {
  if (!family) {
    return {
      width: size,
      height: size,
      borderRadius: "50%",
      background: "#fff",
      border: "1.5px dashed #bbb",
      boxSizing: "border-box",
      display: "block",
    };
  }
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    background: FAMILY_SWATCH[family] || "#ccc",
    border: family === "white" ? "1px solid #bbb" : family === "black" ? "1px solid #111" : "1px solid rgba(0,0,0,0.12)",
    boxShadow: family === "white" ? "inset 0 0 0 1px #ddd" : undefined,
    boxSizing: "border-box",
    display: "block",
  };
}

export function ColorDot({
  family,
  size = 18,
  selected,
  onClick,
  title,
}: {
  family?: string | null;
  size?: number;
  selected?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}) {
  const label = title || familyName(family);
  return (
    <button
      type="button"
      aria-label={label}
      data-label={label}
      className="pb-color-dot"
      title={label}
      onClick={onClick}
      style={{
        width: size + 8,
        height: size + 8,
        padding: 0,
        border: selected ? "2px solid var(--pb-accent)" : "2px solid transparent",
        borderRadius: "50%",
        background: "transparent",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={swatchStyle(family, size)} />
    </button>
  );
}

export default function FamilyPicker({
  value,
  onChange,
  allowEmpty,
  exclude = [],
}: {
  value?: string | null;
  onChange: (family: string) => void;
  allowEmpty?: boolean;
  exclude?: string[];
}) {
  const hidden = new Set(exclude.filter(Boolean));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 2, maxWidth: 240 }}>
      {allowEmpty ? <ColorDot family="" selected={!value} onClick={() => onChange("")} /> : null}
      {COLOR_FAMILIES.filter((f) => !hidden.has(f)).map((f) => (
        <ColorDot key={f} family={f} selected={value === f} onClick={() => onChange(value === f && allowEmpty ? "" : f)} />
      ))}
    </div>
  );
}

export function FamilyDropdown({
  value,
  onChange,
  allowEmpty,
  exclude = [],
  trigger = "value",
}: {
  value?: string | null;
  onChange: (family: string) => void;
  allowEmpty?: boolean;
  exclude?: string[];
  trigger?: "value" | "add";
}) {
  const [open, setOpen] = useState(false);
  const triggerLabel = trigger === "add" ? "再添加副色" : `更改颜色 ${familyName(value)}`;

  return (
    <div style={{ display: "inline-block", verticalAlign: "top" }}>
      <button
        type="button"
        aria-label={triggerLabel}
        aria-expanded={open}
        data-label={trigger === "add" ? "再添加副色" : familyName(value)}
        className={open ? undefined : "pb-color-dot"}
        title={triggerLabel}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          minWidth: 32,
          height: 32,
          padding: trigger === "add" ? 0 : "0 8px",
          borderRadius: 16,
          border: open ? "2px solid #3b6cff" : trigger === "add" ? "1.5px dashed #c9ced6" : "1px solid #e6e8ec",
          background: "#fff",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          fontSize: 16,
          lineHeight: "22px",
          color: "#888",
        }}
      >
        {trigger === "add" ? (
          "+"
        ) : (
          <>
            <span style={swatchStyle(value, 18)} />
            <span aria-hidden="true" style={{ fontSize: 10, color: "#8c8c8c" }}>
              {open ? "▴" : "▾"}
            </span>
          </>
        )}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="选择颜色"
          style={{
            marginTop: 8,
            padding: 8,
            background: "#fff",
            border: "1px solid #d9d9d9",
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            width: 248,
          }}
        >
          <FamilyPicker
            value={value}
            allowEmpty={allowEmpty}
            exclude={exclude}
            onChange={(family) => {
              setOpen(false);
              if (family !== (value || "")) onChange(family);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
