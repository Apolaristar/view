export function imageIdsFromImport(data: {
  imported?: { id?: number }[];
  skipped?: { image_id?: number }[];
} | null | undefined): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of data?.imported || []) {
    const id = Number(item?.id);
    if (Number.isFinite(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  for (const item of data?.skipped || []) {
    const id = Number(item?.image_id);
    if (Number.isFinite(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

export function imageIdFromImport(data: {
  imported?: { id?: number }[];
  skipped?: { image_id?: number }[];
} | null | undefined): number | null {
  return imageIdsFromImport(data)[0] ?? null;
}
