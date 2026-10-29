const NAV = [
  { key: "/", label: "首页" },
  { key: "/library", label: "图库" },
  { key: "/boards", label: "画板" },
  { key: "/settings", label: "设置" },
];

export function boardsReturnPath(sessionPath?: string | null): string {
  if (sessionPath === "/boards" || (sessionPath && /^\/boards\/\d+$/.test(sessionPath))) {
    return sessionPath;
  }
  return "/boards";
}

export default NAV;
