import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./client";
import type { Board, ImageItem, Tag } from "../types";

export function useHome() {
  return useQuery({ queryKey: ["home"], queryFn: () => request<any>("/api/v1/home/summary"), refetchInterval: 4000 });
}

export function useImages(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return useQuery({
    queryKey: ["images", params],
    queryFn: () => request<{ items: ImageItem[]; total: number }>(`/api/v1/images?${q.toString()}`),
    refetchInterval: 3000,
    refetchOnWindowFocus: false,
  });
}

export function useImage(id?: number) {
  return useQuery({
    queryKey: ["image", id],
    enabled: Number.isFinite(id),
    queryFn: () => request<ImageItem>(`/api/v1/images/${id}`),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: () => request<Tag[]>("/api/v1/tags") });
}

export function useBoards() {
  return useQuery({ queryKey: ["boards"], queryFn: () => request<Board[]>("/api/v1/boards") });
}

export function useBoard(id?: string) {
  return useQuery({
    queryKey: ["board", id],
    enabled: Boolean(id),
    queryFn: () => request<Board>(`/api/v1/boards/${id}`),
  });
}

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: () => request<{ pending: number; failed: number; queued?: number }>("/api/v1/jobs/summary"),
    refetchInterval: 2000,
  });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => request<Record<string, string>>("/api/v1/settings") });
}

export function useImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { paths: string[]; tag_ids?: number[]; in_library?: boolean }) =>
      request("/api/v1/images/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paths: body.paths,
          tag_ids: body.tag_ids || [],
          in_library: body.in_library !== false,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["images"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}
