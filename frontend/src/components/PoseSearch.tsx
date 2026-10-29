import { useContext, useEffect, useRef, useState, createContext, type ReactNode } from "react";
import { Modal, Space, Typography, Upload, message } from "antd";
import { useNavigate } from "react-router-dom";
import { request } from "../api/client";
import MediaImg from "./MediaImg";
import {
  activePoseQuery,
  addPoseQuery,
  createPoseQuery,
  emptyPoseSearch,
  exitPoseSearch,
  patchPoseQuery,
  posePreviewUrls,
  removePoseQuery,
  selectPoseQuery,
  type PoseHit,
  type PoseQuery,
  type PoseSearchState,
} from "../poseSearch";

type PoseSearchCtx = {
  query: PoseQuery | null;
  queries: PoseQuery[];
  openSearch: () => void;
  selectQuery: (id: string) => void;
  exitToLibrary: () => void;
  removeQuery: (id: string) => void;
  clearAll: () => void;
};

const Ctx = createContext<PoseSearchCtx>({
  query: null,
  queries: [],
  openSearch: () => undefined,
  selectQuery: () => undefined,
  exitToLibrary: () => undefined,
  removeQuery: () => undefined,
  clearAll: () => undefined,
});

export function usePoseSearch() {
  return useContext(Ctx);
}

function revokeUrls(urls: string[]) {
  for (const url of urls) URL.revokeObjectURL(url);
}

function QueryThumbs({
  queries,
  activeId,
  size,
  onSelect,
}: {
  queries: PoseQuery[];
  activeId: string | null;
  size: number;
  onSelect: (id: string) => void;
}) {
  if (!queries.length) return null;
  return (
    <div className="pb-pose-thumbs">
      {queries.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`pb-pose-thumb${item.id === activeId ? " is-on" : ""}`}
          style={{ width: size, height: size }}
          title={item.name}
          onClick={() => onSelect(item.id)}
        >
          <img src={item.previewUrl} alt="" />
          {item.status === "searching" ? <span className="pb-pose-thumb-tag">…</span> : null}
          {item.status === "failed" ? <span className="pb-pose-thumb-tag is-failed">!</span> : null}
        </button>
      ))}
    </div>
  );
}

export function PoseSearchProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PoseSearchState>(emptyPoseSearch);
  const stateRef = useRef(state);
  stateRef.current = state;
  const query = activePoseQuery(state);
  const searching = state.queries.some((item) => item.status === "searching");

  useEffect(() => {
    return () => revokeUrls(posePreviewUrls(stateRef.current));
  }, []);

  function selectQuery(id: string) {
    setState((prev) => selectPoseQuery(prev, id));
    nav("/library");
  }

  function exitToLibrary() {
    setState((prev) => exitPoseSearch(prev));
    setOpen(false);
    nav("/library");
  }

  function removeQuery(id: string) {
    setState((prev) => {
      const doomed = prev.queries.find((item) => item.id === id);
      if (doomed?.previewUrl) URL.revokeObjectURL(doomed.previewUrl);
      return removePoseQuery(prev, id);
    });
  }

  function clearAll() {
    setState((prev) => {
      revokeUrls(posePreviewUrls(prev));
      return emptyPoseSearch;
    });
    setOpen(false);
  }

  function openSearch() {
    setOpen(true);
  }

  async function searchFile(file: File) {
    const created = createPoseQuery({
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      status: "searching",
      message: "图片已选择，正在识别姿态…",
    });
    setState((prev) => addPoseQuery(prev, created));
    const form = new FormData();
    form.append("file", file);
    try {
      const data = await request<{ items?: PoseHit[]; total?: number; empty?: boolean }>("/api/v1/search/by-pose", {
        method: "POST",
        body: form,
      });
      const items = data.items || [];
      if (!items.length) {
        const msg = data.empty ? "图库为空" : "没有相似姿态";
        setState((prev) => patchPoseQuery(prev, created.id, { status: "failed", message: msg, items: [] }));
        message.warning(msg);
        nav("/library");
        return;
      }
      setState((prev) =>
        patchPoseQuery(prev, created.id, {
          status: "ok",
          message: `搜索成功，找到 ${items.length} 张相似姿态`,
          items,
        })
      );
      message.success(`搜索成功，找到 ${items.length} 张`);
      nav("/library");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "检测不到人体";
      setState((prev) => patchPoseQuery(prev, created.id, { status: "failed", message: msg, items: [] }));
      message.error(msg);
    }
  }

  return (
    <Ctx.Provider
      value={{
        query,
        queries: state.queries,
        openSearch,
        selectQuery,
        exitToLibrary,
        removeQuery,
        clearAll,
      }}
    >
      {children}
      <Modal title="姿态搜图" open={open} onCancel={() => setOpen(false)} footer={null} width={760}>
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Upload.Dragger
            accept="image/*"
            showUploadList={false}
            disabled={searching}
            beforeUpload={(file) => {
              void searchFile(file as File);
              return false;
            }}
          >
            <p className="ant-upload-text">{state.queries.length ? "再传一张，会另外存成一组" : "点击或拖拽图片到这里"}</p>
            <p className="ant-upload-hint">每张上传图对应一组搜图结果，点参考图可切换。支持 jpg / png / webp</p>
          </Upload.Dragger>
          {state.queries.length ? (
            <div>
              <div className="pb-section-title">上传过的参考图</div>
              <QueryThumbs queries={state.queries} activeId={state.activeId} size={56} onSelect={selectQuery} />
            </div>
          ) : null}
          {query ? (
            <div className="pb-pose-upload">
              <img src={query.previewUrl} alt="" />
              <div>
                <div className="pb-pose-upload-name" title={query.name}>
                  {query.name}
                </div>
                <Typography.Text type={query.status === "failed" ? "danger" : query.status === "ok" ? "success" : "secondary"}>
                  {query.status === "searching" ? "正在识别…" : query.status === "ok" ? "上传成功" : "未能完成搜索"}
                </Typography.Text>
                <div className="pb-hint">{query.message}</div>
              </div>
            </div>
          ) : null}
          {query?.items.length ? (
            <div>
              <div className="pb-section-title">这一组搜到的图</div>
              <div className="pb-pose-hits">
                {query.items.map((item) => (
                  <MediaImg
                    key={item.id}
                    thumb={item.thumbnail_url || `/media/thumbnails/${item.uid || ""}`}
                    original={item.original_url}
                    width={96}
                    height={96}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setOpen(false);
                      nav(`/library?select=${item.id}`);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </Space>
      </Modal>
    </Ctx.Provider>
  );
}

export function PoseQueryCard() {
  const { query, queries, selectQuery, removeQuery } = usePoseSearch();
  if (!queries.length) {
    return <div className="pb-hint">点顶部「姿态搜图」上传参考图</div>;
  }
  return (
    <div className="pb-pose-query">
      <div className="pb-pose-query-list">
        {queries.map((item) => (
          <div key={item.id} className={`pb-pose-query-row${item.id === query?.id ? " is-on" : ""}`}>
            <button type="button" className="pb-pose-query-pick" onClick={() => selectQuery(item.id)} title={item.name}>
              <span className="pb-pose-thumb" style={{ width: 44, height: 44 }}>
                <img src={item.previewUrl} alt="" />
                {item.status === "searching" ? <span className="pb-pose-thumb-tag">…</span> : null}
                {item.status === "failed" ? <span className="pb-pose-thumb-tag is-failed">!</span> : null}
              </span>
              <span className="pb-pose-query-meta">
                <span className="pb-pose-query-name">{item.name}</span>
                <span className={`pb-pose-query-status is-${item.status}`}>
                  {item.status === "searching"
                    ? "识别中"
                    : item.status === "ok"
                      ? `找到 ${item.items.length} 张`
                      : item.message}
                </span>
              </span>
            </button>
            <button type="button" className="pb-pose-act is-danger" title="去掉这一组" onClick={() => removeQuery(item.id)}>
              清除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
