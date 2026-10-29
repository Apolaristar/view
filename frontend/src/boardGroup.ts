export function newGroupId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function expandGroupIndices<T extends { group_id?: string | null }>(
  cards: T[],
  indices: number[],
  editingGroup?: string | null
): number[] {
  const set = new Set(indices);
  if (editingGroup) return [...set];
  for (const i of indices) {
    const gid = cards[i]?.group_id;
    if (!gid) continue;
    cards.forEach((c, idx) => {
      if (c.group_id === gid) set.add(idx);
    });
  }
  return [...set];
}

export function setGroupOn<T extends { group_id?: string | null }>(cards: T[], indices: number[], groupId: string | null): T[] {
  const set = new Set(indices);
  return cards.map((c, i) => (set.has(i) ? { ...c, group_id: groupId } : c));
}

export function pruneGroups<T extends { group_id?: string | null }>(cards: T[]): T[] {
  const counts = new Map<string, number>();
  for (const c of cards) {
    if (c.group_id) counts.set(c.group_id, (counts.get(c.group_id) || 0) + 1);
  }
  return cards.map((c) => {
    if (!c.group_id) return c;
    if ((counts.get(c.group_id) || 0) < 2) return { ...c, group_id: null };
    return c;
  });
}

export function setLockedOn<T extends { locked?: boolean; group_id?: string | null }>(
  cards: T[],
  indices: number[],
  locked: boolean
): T[] {
  const targets = new Set(expandGroupIndices(cards, indices));
  return cards.map((c, i) => (targets.has(i) ? { ...c, locked } : c));
}
