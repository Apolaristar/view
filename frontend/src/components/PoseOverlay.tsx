import { useEffect, useRef, useState } from "react";
import { faceGeometry, skeletonGeometry, type PoseLandmark } from "../poseSkeleton";

export default function PoseOverlay({
  landmarks,
  skeleton = true,
  face = false,
}: {
  landmarks: PoseLandmark[];
  skeleton?: boolean;
  face?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ready = box.w > 0 && box.h > 0;
  const { points, lines, heads } = ready && skeleton ? skeletonGeometry(landmarks, box.w, box.h) : { points: [], lines: [], heads: [] };
  const faceDraw = ready && face ? faceGeometry(landmarks, box.w, box.h) : { points: [], lines: [] };

  return (
    <div ref={ref} className="pb-pose-overlay" aria-hidden>
      {ready ? (
        <svg width={box.w} height={box.h}>
          {lines.map((line, i) => (
            <g key={`b${i}`} className={line.primary ? undefined : "is-secondary"}>
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className="pb-pose-bone is-halo" />
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className="pb-pose-bone" />
            </g>
          ))}
          {heads.map((head) => (
            <g key={`h${head.person}`} className={head.primary ? undefined : "is-secondary"}>
              <circle cx={head.cx} cy={head.cy} r={head.r} className="pb-pose-head is-halo" />
              <circle cx={head.cx} cy={head.cy} r={head.r} className="pb-pose-head" />
            </g>
          ))}
          {points.map((p) => (
            <g key={`${p.person}-${p.id}`} className={p.primary ? undefined : "is-secondary"}>
              <circle cx={p.x} cy={p.y} r={3.4} className="pb-pose-joint is-halo" />
              <circle cx={p.x} cy={p.y} r={3.4} className="pb-pose-joint" />
            </g>
          ))}
          {faceDraw.lines.map((line, i) => (
            <g key={`f${i}`} className={line.primary ? undefined : "is-secondary"}>
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className="pb-face-bone is-halo" />
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className="pb-face-bone" />
            </g>
          ))}
          {faceDraw.points.map((p) => (
            <g key={`fp${p.person}-${p.id}`} className={p.primary ? undefined : "is-secondary"}>
              <circle cx={p.x} cy={p.y} r={p.kind === "eye" ? 4.2 : 3.2} className={`pb-face-joint is-${p.kind} is-halo`} />
              <circle cx={p.x} cy={p.y} r={p.kind === "eye" ? 4.2 : 3.2} className={`pb-face-joint is-${p.kind}`} />
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
