export function albumDateKey(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function albumDateLabel(value: string, now = new Date()): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "未知日期";
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function groupByAlbumDate<T extends { created_at: string }>(items: T[], now = new Date()) {
  const groups: { key: string; label: string; items: T[] }[] = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const key = albumDateKey(item.created_at);
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, groups.length);
      groups.push({ key, label: albumDateLabel(item.created_at, now), items: [item] });
    } else {
      groups[existing].items.push(item);
    }
  }
  return groups;
}
