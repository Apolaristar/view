export function isWindowMoveGesture(evt: {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  button?: number;
}): boolean {
  if (!evt.altKey || evt.ctrlKey || evt.metaKey) return false;
  return evt.button == null || evt.button === 0;
}
