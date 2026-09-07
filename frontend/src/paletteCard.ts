import type { PaletteColor } from "./types";

export function paletteHexList(colors: PaletteColor[]) {
  return colors.map((c) => c.hex).join("\n");
}

export function paletteCssVars(colors: PaletteColor[]) {
  const body = colors.map((c, i) => `  --c${i + 1}: ${c.hex};`).join("\n");
  return `:root {\n${body}\n}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function renderPaletteCard(colors: PaletteColor[], title = "色卡"): HTMLCanvasElement {
  const n = Math.max(colors.length, 1);
  const sw = 92;
  const gap = 10;
  const pad = 20;
  const barH = 118;
  const canvas = document.createElement("canvas");
  canvas.width = pad * 2 + n * sw + (n - 1) * gap;
  canvas.height = pad + 28 + barH + 36;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.font = "600 16px Microsoft YaHei, Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(title, pad, pad + 14);
  colors.forEach((c, i) => {
    const x = pad + i * (sw + gap);
    const y = pad + 28;
    roundRect(ctx, x, y, sw, barH - 32, 10);
    ctx.fillStyle = c.hex;
    ctx.fill();
    ctx.fillStyle = "#222";
    ctx.font = "12px Consolas, ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(c.hex, x + sw / 2, y + barH - 10);
  });
  return canvas;
}

export function paletteCardDataUrl(colors: PaletteColor[], title = "色卡") {
  return renderPaletteCard(colors, title).toDataURL("image/png");
}
