/// <reference types="vite/client" />

interface PoseBoardBridge {
  selectFiles: () => Promise<string[]>;
  selectFolder: () => Promise<string[]>;
  getApiBase: () => Promise<string>;
}

interface Window {
  poseBoard?: PoseBoardBridge;
}
