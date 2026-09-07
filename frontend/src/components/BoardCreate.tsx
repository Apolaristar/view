import { createContext, useContext, useState, type ReactNode } from "react";
import { Input, Modal, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { request } from "../api/client";

type BoardCreateCtx = { openCreateBoard: () => void };

const Ctx = createContext<BoardCreateCtx>({ openCreateBoard: () => undefined });

export function useBoardCreate() {
  return useContext(Ctx);
}

export function BoardCreateProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("未命名画板");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();

  async function submit() {
    setLoading(true);
    try {
      const board = await request<{ id: number }>("/api/v1/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "未命名画板" }),
      });
      qc.invalidateQueries({ queryKey: ["boards"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      setOpen(false);
      setName("未命名画板");
      nav(`/boards/${board.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Ctx.Provider
      value={{
        openCreateBoard: () => {
          setName("未命名画板");
          setOpen(true);
        },
      }}
    >
      {children}
      <Modal
        title="新建画板"
        open={open}
        okText="创建并打开"
        cancelText="取消"
        confirmLoading={loading}
        onOk={submit}
        onCancel={() => setOpen(false)}
      >
        <Typography.Paragraph type="secondary">
          画板用来同时摆放多张参考图。创建后可以在图库点「加入画板」，或把底部缩略图拖进画布。
        </Typography.Paragraph>
        <Input
          value={name}
          autoFocus
          placeholder="画板名称"
          onChange={(e) => setName(e.target.value)}
          onPressEnter={() => void submit()}
        />
      </Modal>
    </Ctx.Provider>
  );
}
