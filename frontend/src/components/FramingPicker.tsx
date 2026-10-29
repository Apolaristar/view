import { BODY_FRAMINGS, BODY_FRAMING_LABEL, HEAD_YAWS, HEAD_YAW_LABEL } from "../types";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function FramingIcon({ kind, size = 22 }: { kind: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {kind === "head" ? <circle cx="12" cy="12" r="6.6" {...STROKE} /> : null}
      {kind === "bust" ? (
        <>
          <circle cx="12" cy="9.4" r="3.5" {...STROKE} />
          <path d="M12 12.9v2.2" {...STROKE} />
          <path d="M4.2 18L12 14.2l7.8 3.8" {...STROKE} />
        </>
      ) : null}
      {kind === "half" ? (
        <>
          <circle cx="12" cy="7.2" r="3.2" {...STROKE} />
          <path d="M12 10.4v8.2" {...STROKE} />
          <path d="M4.6 13.8L12 11l7.4 2.8" {...STROKE} />
          <path d="M7.2 18.8h9.6" {...STROKE} />
        </>
      ) : null}
      {kind === "full" ? (
        <>
          <circle cx="12" cy="3.8" r="2.7" {...STROKE} />
          <path d="M12 6.5v7.6" {...STROKE} />
          <path d="M5 11.2L12 8.6l7 2.6" {...STROKE} />
          <path d="M7.6 14.2h8.8" {...STROKE} />
          <path d="M9.6 14.2v8.2" {...STROKE} />
          <path d="M14.4 14.2v8.2" {...STROKE} />
        </>
      ) : null}
      {kind === "front" ? (
        <>
          <circle cx="12" cy="12" r="6.6" {...STROKE} />
          <circle cx="9.4" cy="11" r="1.05" fill="currentColor" stroke="none" />
          <circle cx="14.6" cy="11" r="1.05" fill="currentColor" stroke="none" />
        </>
      ) : null}
      {kind === "three_quarter" ? (
        <>
          <circle cx="13.2" cy="12" r="6.2" {...STROKE} />
          <circle cx="11.4" cy="11" r="1.05" fill="currentColor" stroke="none" />
          <circle cx="15.2" cy="11" r="0.85" fill="currentColor" stroke="none" />
          <path d="M7.4 10.2c-.8 1.2-.8 2.8 0 4" {...STROKE} />
        </>
      ) : null}
      {kind === "profile" ? (
        <>
          <path d="M10.2 5.6c3.8 0 6.6 3 6.6 6.4s-2.8 6.4-6.6 6.4" {...STROKE} />
          <circle cx="14.4" cy="10.8" r="1.05" fill="currentColor" stroke="none" />
          <path d="M10.2 12.2h2.2" {...STROKE} />
        </>
      ) : null}
    </svg>
  );
}

function PickButtons({
  kinds,
  labels,
  value,
  onChange,
  allowEmpty,
  compact,
}: {
  kinds: readonly string[];
  labels: Record<string, string>;
  value?: string | null;
  onChange: (next: string) => void;
  allowEmpty?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`pb-framing-picker${compact ? " is-compact" : ""}`}>
      {kinds.map((kind) => {
        const on = value === kind;
        const label = labels[kind];
        return (
          <button
            key={kind}
            type="button"
            className={`pb-framing-btn${on ? " is-on" : ""}`}
            title={label}
            aria-label={label}
            aria-pressed={on}
            onClick={() => onChange(allowEmpty && on ? "" : kind)}
          >
            <FramingIcon kind={kind} size={compact ? 18 : 22} />
            {compact ? null : <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default function FramingPicker({
  value,
  onChange,
  allowEmpty,
  compact,
}: {
  value?: string | null;
  onChange: (framing: string) => void;
  allowEmpty?: boolean;
  compact?: boolean;
}) {
  return (
    <PickButtons
      kinds={BODY_FRAMINGS}
      labels={BODY_FRAMING_LABEL}
      value={value}
      onChange={onChange}
      allowEmpty={allowEmpty}
      compact={compact}
    />
  );
}

export function HeadYawPicker({
  value,
  onChange,
  allowEmpty,
  compact,
}: {
  value?: string | null;
  onChange: (yaw: string) => void;
  allowEmpty?: boolean;
  compact?: boolean;
}) {
  return (
    <PickButtons
      kinds={HEAD_YAWS}
      labels={HEAD_YAW_LABEL}
      value={value}
      onChange={onChange}
      allowEmpty={allowEmpty}
      compact={compact}
    />
  );
}
