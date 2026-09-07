import MediaImg from "./MediaImg";

export default function BoardPreview({ url, compact }: { url?: string | null; compact?: boolean }) {
  return (
    <div className={`pb-board-preview${compact ? " is-sm" : ""}`}>
      {url ? (
        <MediaImg thumb={url} style={{ width: "100%", height: "100%", objectFit: "contain", background: "transparent" }} />
      ) : (
        <div className="pb-board-preview-empty">还没有图</div>
      )}
    </div>
  );
}
