import { FAMILY_LABEL, BODY_FRAMING_LABEL, HEAD_YAW_LABEL } from "./types";

export const APP_NAME = "姿态图库";

export const POSE_STATUS_LABEL: Record<string, string> = {
  pending: "排队中",
  ok: "已识别",
  none: "无人体",
  failed: "失败",
};

export const COLOR_STATUS_LABEL: Record<string, string> = {
  pending: "排队中",
  ok: "已提取",
  failed: "失败",
};

export function poseStatusText(status?: string | null): string {
  if (!status) return "未知";
  return POSE_STATUS_LABEL[status] || status;
}

export function colorStatusText(status?: string | null): string {
  if (!status) return "未知";
  return COLOR_STATUS_LABEL[status] || status;
}

export function familyText(family?: string | null): string {
  if (!family) return "";
  return FAMILY_LABEL[family] || family;
}

export function framingText(framing?: string | null): string {
  if (!framing || framing === "unknown") return "未识别";
  return BODY_FRAMING_LABEL[framing] || framing;
}

export function headYawText(yaw?: string | null): string {
  if (!yaw || yaw === "unknown") return "未识别";
  return HEAD_YAW_LABEL[yaw] || yaw;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function formatDate(value?: Date | string | null): string {
  const d = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("zh-CN");
}
