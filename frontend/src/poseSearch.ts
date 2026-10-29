export type PoseHit = {
  id: number;
  uid?: string;
  thumbnail_url?: string;
  original_url?: string;
  thumbnail_path?: string;
  distance?: number;
};

export type PoseQuery = {
  id: string;
  previewUrl: string;
  name: string;
  status: "searching" | "ok" | "failed";
  message: string;
  items: PoseHit[];
};

export type PoseSearchState = {
  queries: PoseQuery[];
  activeId: string | null;
};

export const emptyPoseSearch: PoseSearchState = { queries: [], activeId: null };

export function createPoseQuery(input: {
  previewUrl: string;
  name: string;
  status?: PoseQuery["status"];
  message?: string;
  items?: PoseHit[];
  id?: string;
}): PoseQuery {
  return {
    id: input.id || `pose-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    previewUrl: input.previewUrl,
    name: input.name,
    status: input.status || "searching",
    message: input.message || "",
    items: input.items || [],
  };
}

export function activePoseQuery(state: PoseSearchState): PoseQuery | null {
  return state.queries.find((query) => query.id === state.activeId) || null;
}

export function addPoseQuery(state: PoseSearchState, query: PoseQuery): PoseSearchState {
  return { queries: [...state.queries, query], activeId: query.id };
}

export function patchPoseQuery(state: PoseSearchState, id: string, patch: Partial<PoseQuery>): PoseSearchState {
  return {
    ...state,
    queries: state.queries.map((query) => (query.id === id ? { ...query, ...patch } : query)),
  };
}

export function selectPoseQuery(state: PoseSearchState, id: string): PoseSearchState {
  if (!state.queries.some((query) => query.id === id)) return state;
  return { ...state, activeId: id };
}

export function exitPoseSearch(state: PoseSearchState): PoseSearchState {
  return { ...state, activeId: null };
}

export function removePoseQuery(state: PoseSearchState, id: string): PoseSearchState {
  const queries = state.queries.filter((query) => query.id !== id);
  if (state.activeId !== id) return { queries, activeId: state.activeId };
  return { queries, activeId: queries[queries.length - 1]?.id ?? null };
}

export function posePreviewUrls(state: PoseSearchState): string[] {
  return state.queries.map((query) => query.previewUrl).filter(Boolean);
}
