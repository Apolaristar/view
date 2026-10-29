const MIN_W = 240;
const MIN_H = 180;

function clampBounds(bounds, workArea, minW = MIN_W, minH = MIN_H) {
  const width = Math.min(Math.max(Math.round(Number(bounds.width) || minW), minW), workArea.width);
  const height = Math.min(Math.max(Math.round(Number(bounds.height) || minH), minH), workArea.height);
  let x = Math.round(Number(bounds.x) || workArea.x);
  let y = Math.round(Number(bounds.y) || workArea.y);
  if (x < workArea.x) x = workArea.x;
  if (y < workArea.y) y = workArea.y;
  if (x + width > workArea.x + workArea.width) x = workArea.x + workArea.width - width;
  if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;
  return { x, y, width, height };
}

function defaultFloatBounds(workArea) {
  const width = Math.min(380, workArea.width);
  const height = Math.min(580, workArea.height);
  return clampBounds(
    {
      x: workArea.x + workArea.width - width - 24,
      y: workArea.y + 24,
      width,
      height,
    },
    workArea
  );
}

function topHalfBounds(workArea) {
  return {
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: Math.max(MIN_H, Math.round(workArea.height / 2)),
  };
}

function isTopHalf(bounds, workArea, slack = 32) {
  return (
    Math.abs(bounds.x - workArea.x) <= slack &&
    Math.abs(bounds.y - workArea.y) <= slack &&
    Math.abs(bounds.width - workArea.width) <= slack &&
    Math.abs(bounds.height - workArea.height / 2) <= slack
  );
}

module.exports = {
  MIN_W,
  MIN_H,
  clampBounds,
  defaultFloatBounds,
  topHalfBounds,
  isTopHalf,
};
