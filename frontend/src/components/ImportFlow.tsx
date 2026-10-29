import { createContext, useContext, useState, type ReactNode } from "react";
import { Button, Modal, Typography, message } from "antd";
import { selectLocalFolder, selectLocalPaths } from "../api/client";
import { useImport, useTags } from "../api/hooks";
import { emptyChipStates, toggleChipState, type ChipState } from "../tagPick";
import TagPickPanel from "./TagPickPanel";

type ImportFlowCtx = {
  importFiles: () => Promise<void>;
  importFolder: () => Promise<void>;
  importPictures: () => Promise<void>;
  importWithTags: () => void;
};

const Ctx = createContext<ImportFlowCtx>({
  importFiles: async () => undefined,
  importFolder: async () => undefined,
  importPictures: async () => undefined,
  importWithTags: () => undefined,
});

export function useImportFlow() {
  return useContext(Ctx);
}

type ImportResult = { imported_count?: number; skipped_count?: number };

export function ImportFlowProvider({ children }: { children: ReactNode }) {
  const importer = useImport();
  const tags = useTags();
  const [tagFirst, setTagFirst] = useState(false);
  const [states, setStates] = useState<Record<number, ChipState>>({});
  const [loading, setLoading] = useState(false);

  function selectedTagIds() {
    return Object.entries(states)
      .filter(([, state]) => state === "on")
      .map(([id]) => Number(id));
  }

  async function runImport(paths: string[], tagIds: number[]) {
    if (!paths.length) {
      message.info("请在桌面应用中选择文件，或确认已通过 Electron 启动");
      return false;
    }
    setLoading(true);
    try {
      const result = (await importer.mutateAsync({
        paths,
        tag_ids: tagIds,
      })) as ImportResult;
      const tagged = tagIds.length ? "，并已加上标签" : "";
      message.success(`导入 ${result.imported_count || 0}，跳过 ${result.skipped_count || 0}${tagged}`);
      setTagFirst(false);
      return true;
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "导入失败");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function importFiles() {
    await runImport(await selectLocalPaths(), []);
  }

  async function importFolder() {
    await runImport(await selectLocalFolder(), []);
  }

  async function importPictures() {
    const files = await selectLocalPaths();
    await runImport(files.length ? files : await selectLocalFolder(), []);
  }

  function importWithTags() {
    setStates(emptyChipStates((tags.data || []).map((t) => t.id)));
    setTagFirst(true);
  }

  async function pickAfterTags(kind: "files" | "folder") {
    const tagIds = selectedTagIds();
    if (!tagIds.length) {
      message.info("先选至少一个标签");
      return;
    }
    const paths = kind === "files" ? await selectLocalPaths() : await selectLocalFolder();
    if (!paths.length) return;
    await runImport(paths, tagIds);
  }

  return (
    <Ctx.Provider value={{ importFiles, importFolder, importPictures, importWithTags }}>
      {children}
      <Modal
        title="先选标签再导入"
        open={tagFirst}
        cancelText="取消"
        confirmLoading={loading}
        onCancel={() => {
          if (!loading) setTagFirst(false);
        }}
        width={520}
        footer={[
          <Button key="cancel" disabled={loading} onClick={() => setTagFirst(false)}>
            取消
          </Button>,
          <Button key="folder" disabled={loading || !selectedTagIds().length} onClick={() => void pickAfterTags("folder")}>
            选择文件夹
          </Button>,
          <Button key="files" type="primary" disabled={loading || !selectedTagIds().length} onClick={() => void pickAfterTags("files")}>
            选择文件
          </Button>,
        ]}
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          先勾选标签，再选文件或文件夹。这些标签会加到这次导入的所有图上。
        </Typography.Paragraph>
        <TagPickPanel
          tags={tags.data || []}
          states={states}
          onToggle={(tag) => setStates((prev) => ({ ...prev, [tag.id]: toggleChipState(prev[tag.id] || "off") }))}
        />
      </Modal>
    </Ctx.Provider>
  );
}
