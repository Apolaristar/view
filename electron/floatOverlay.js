const MIN_OPACITY = 0.3;
const CLICK_THROUGH_ACCEL = "CommandOrControl+Shift+X";
const TOOLS_ACCEL = "CommandOrControl+Shift+T";
const SOLO_NEXT_ACCEL = "CommandOrControl+Right";
const SOLO_PREV_ACCEL = "CommandOrControl+Left";

function clampOpacity(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.min(1, Math.max(MIN_OPACITY, Math.round(x * 100) / 100));
}

module.exports = { MIN_OPACITY, CLICK_THROUGH_ACCEL, TOOLS_ACCEL, SOLO_NEXT_ACCEL, SOLO_PREV_ACCEL, clampOpacity };
