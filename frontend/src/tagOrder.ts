export function moveById<T extends { id: number }>(items: T[], fromId: number, toId: number): T[] {
  const from = items.findIndex((item) => item.id === fromId);
  const to = items.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function replaceGroup<T extends { id: number }>(all: T[], group: T[]): T[] {
  const ids = new Set(group.map((item) => item.id));
  const start = all.findIndex((item) => ids.has(item.id));
  const without = all.filter((item) => !ids.has(item.id));
  if (start < 0) return [...without, ...group];
  without.splice(start, 0, ...group);
  return without;
}
