export const COLOR_FAMILIES = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
  "brown",
  "black",
  "white",
  "gray",
] as const;

export const FAMILY_LABEL: Record<string, string> = {
  red: "红",
  orange: "橙",
  yellow: "黄",
  green: "绿",
  cyan: "青",
  blue: "蓝",
  purple: "紫",
  pink: "粉",
  brown: "棕",
  black: "黑",
  white: "白",
  gray: "灰",
};

export const FAMILY_SWATCH: Record<string, string> = {
  red: "#e74c3c",
  orange: "#e67e22",
  yellow: "#f1c40f",
  green: "#27ae60",
  cyan: "#00C9A0",
  blue: "#0F4AE8",
  purple: "#8e44ad",
  pink: "#ff7eb6",
  brown: "#8d6e63",
  black: "#222",
  white: "#f5f5f5",
  gray: "#95a5a6",
};

export const ANGLES = [
  { value: "frontal", label: "正面" },
  { value: "side", label: "侧面" },
  { value: "back", label: "背面" },
  { value: "top", label: "俯视" },
  { value: "other", label: "其他" },
  { value: "unknown", label: "未标" },
];

export type TagKind = "category" | "facet" | "custom";

export type Tag = {
  id: number;
  name: string;
  color?: string | null;
  image_count?: number;
  parent_id?: number | null;
  kind?: TagKind | string;
  sort_order?: number;
};

export type PaletteColor = {
  hex: string;
  ratio: number;
  h: number;
  s: number;
  l: number;
  family: string;
};

export type ImageItem = {
  id: number;
  uid: string;
  width: number;
  height: number;
  camera_angle: string;
  pose_status: string;
  color_status: string;
  palette: PaletteColor[];
  primary_family?: string | null;
  secondary_family?: string | null;
  extra_families?: string[];
  notes: string;
  created_at: string;
  thumbnail_url: string;
  original_url: string;
  local_path?: string;
  in_library?: boolean;
    pose_landmarks: { id: number; x: number; y: number; visibility: number; person?: number }[];
    pose_people?: number;
  body_framing?: string | null;
  head_yaw?: string | null;
  tags: Tag[];
};

export const BODY_FRAMINGS = ["head", "bust", "half", "full"] as const;

export const BODY_FRAMING_LABEL: Record<string, string> = {
  head: "大头",
  bust: "胸像",
  half: "半身",
  full: "全身",
};

export const HEAD_YAWS = ["front", "three_quarter", "profile"] as const;

export const HEAD_YAW_LABEL: Record<string, string> = {
  front: "正脸",
  three_quarter: "半侧",
  profile: "全侧",
};

export type BoardItem = {
  id: number;
  board_id: number;
  image_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  rotation?: number;
  crop_x?: number;
  crop_y?: number;
  crop_w?: number;
  crop_h?: number;
  flipped?: boolean;
  grayscale?: boolean;
  locked?: boolean;
  group_id?: string | null;
  image: ImageItem;
};

export type Board = {
  id: number;
  name: string;
  pan_x: number;
  pan_y: number;
  zoom: number;
  grayscale?: boolean;
  updated_at: string;
  item_count: number;
  tray_count?: number;
  items?: BoardItem[];
  tray?: ImageItem[];
  preview_url?: string | null;
  previews?: { uid: string; thumbnail_url: string }[];
};
