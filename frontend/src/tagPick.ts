import type { Tag } from "./types";

export type ChipState = "on" | "off" | "mixed";

export function splitTagGroups(tags: Tag[]) {
  const categories = tags.filter((t) => t.kind === "category");
  const facets = tags.filter((t) => t.kind === "facet");
  const custom = tags.filter((t) => t.kind !== "category" && t.kind !== "facet");
  return { categories, facets, custom };
}

export function chipStatesFromImages(images: { tags: { id: number }[] }[], tagIds: number[]): Record<number, ChipState> {
  const out: Record<number, ChipState> = {};
  for (const id of tagIds) {
    const count = images.filter((img) => img.tags.some((t) => t.id === id)).length;
    if (count === 0) out[id] = "off";
    else if (count === images.length) out[id] = "on";
    else out[id] = "mixed";
  }
  return out;
}

export function emptyChipStates(tagIds: number[]): Record<number, ChipState> {
  return Object.fromEntries(tagIds.map((id) => [id, "off"])) as Record<number, ChipState>;
}

export function toggleChipState(state: ChipState): ChipState {
  return state === "off" || state === "mixed" ? "on" : "off";
}

export function diffChipStates(
  initial: Record<number, ChipState>,
  draft: Record<number, ChipState>,
  tagIds: number[]
): { add: number[]; remove: number[] } {
  const add: number[] = [];
  const remove: number[] = [];
  for (const id of tagIds) {
    const from = initial[id] || "off";
    const to = draft[id] || "off";
    if (to === from || to === "mixed") continue;
    if (to === "on") add.push(id);
    else remove.push(id);
  }
  return { add, remove };
}

export function visibleFacetsForStates(facets: Tag[], states: Record<number, ChipState>): Tag[] {
  const activeParents = new Set<number>();
  for (const facet of facets) {
    const parentId = facet.parent_id;
    if (parentId == null) continue;
    const state = states[parentId];
    if (state === "on" || state === "mixed") activeParents.add(parentId);
  }
  if (!activeParents.size) return [];
  return facets.filter((f) => f.parent_id != null && activeParents.has(f.parent_id));
}
