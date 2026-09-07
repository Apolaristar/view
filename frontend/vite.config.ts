import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5178",
      "/media": "http://127.0.0.1:5178",
      "/health": "http://127.0.0.1:5178",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
