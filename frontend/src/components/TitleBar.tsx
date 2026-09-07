import { useEffect, useState } from "react";
import { APP_NAME } from "../i18n";
import {
  hasWindowControls,
  subscribeMaximized,
  windowClose,
  windowIsMaximized,
  windowMinimize,
  windowToggleMax,
} from "../api/client";

function IconMin() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path d="M1.5 5.5h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconMax() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <rect x="1.7" y="1.7" width="7.6" height="7.6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconRestore() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path d="M3.2 3.4h5.2v5.2H3.2z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.4 3.4V2.6h5.2v5.2H8.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <path d="M2.2 2.2l6.6 6.6M8.8 2.2L2.2 8.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export default function TitleBar({ compact }: { compact?: boolean }) {
  const [maximized, setMaximized] = useState(false);
  const native = hasWindowControls();

  useEffect(() => {
    if (!native) return;
    void windowIsMaximized().then(setMaximized);
    return subscribeMaximized(setMaximized);
  }, [native]);

  return (
    <div
      className={`pb-titlebar${compact ? " is-compact" : ""}`}
      onDoubleClick={() => {
        if (native) void windowToggleMax().then(setMaximized);
      }}
    >
      <div className="pb-title-brand">
        <span className="pb-title-mark" />
        <span className="pb-title-name">{APP_NAME}</span>
      </div>
      <div className="pb-title-spacer" />
      {native ? (
        <div className="pb-win" onDoubleClick={(e) => e.stopPropagation()}>
          <button type="button" className="pb-win-btn" aria-label="最小化" onClick={() => void windowMinimize()}>
            <IconMin />
          </button>
          <button
            type="button"
            className="pb-win-btn"
            aria-label={maximized ? "还原" : "最大化"}
            onClick={() => void windowToggleMax().then(setMaximized)}
          >
            {maximized ? <IconRestore /> : <IconMax />}
          </button>
          <button type="button" className="pb-win-btn is-close" aria-label="关闭" onClick={() => void windowClose()}>
            <IconClose />
          </button>
        </div>
      ) : null}
    </div>
  );
}
