/// <reference types="vite/client" />

interface PoseBoardBridge {
  selectFiles: () => Promise<string[]>;
  selectFolder: () => Promise<string[]>;
  getApiBase: () => Promise<string>;
  captureScreenshot?: () => Promise<{ ok?: boolean; path?: string; canceled?: boolean; error?: string }>;
  cancelScreenshot?: () => Promise<boolean>;
  writeTempDataUrl?: (dataUrl: string) => Promise<{ ok?: boolean; path?: string; error?: string }>;
  capturePageRect?: (rect: { x: number; y: number; width: number; height: number }) => Promise<{ ok?: boolean; dataUrl?: string; error?: string }>;
  saveDataUrl?: (fileName: string, dataUrl: string, title?: string) => Promise<boolean>;
  clipboardIngest?: () => Promise<{ ok?: boolean; kind?: string; path?: string; text?: string; error?: string }>;
  downloadImageUrl?: (url: string) => Promise<{ ok?: boolean; path?: string; error?: string }>;
}

interface Window {
  poseBoard?: PoseBoardBridge;
}
