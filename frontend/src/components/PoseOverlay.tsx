import { useEffect, useRef, useState } from "react";
import { skeletonGeometry, type PoseLandmark } from "../poseSkeleton";

export default function PoseOverlay({ landmarks }: { landmarks: PoseLandmark[] }) {
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

  const { points, lines, head } = box.w > 0 && box.h > 0 ? skeletonGeometry(landmarks, box.w, box.h) : { points: [], lines: [], head: null };

  return (
    <div ref={ref} className="pb-pose-overlay" aria-hidden>
      {box.w > 0 && box.h > 0 ? (
        <svg width={box.w} height={box.h}>
          {lines.map((line, i) => (
            <g key={`b${i}`}>
              <line {...line} className="pb-pose-bone is-halo" />
              <line {...line} className="pb-pose-bone" />
            </g>
          ))}
          {head ? (
            <g>
              <circle cx={head.cx} cy={head.cy} r={head.r} className="pb-pose-head is-halo" />
              <circle cx={head.cx} cy={head.cy} r={head.r} className="pb-pose-head" />
            </g>
          ) : null}
          {points.map((p) => (
            <g key={p.id}>
              <circle cx={p.x} cy={p.y} r={3.4} className="pb-pose-joint is-halo" />
              <circle cx={p.x} cy={p.y} r={3.4} className="pb-pose-joint" />
            </g>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
