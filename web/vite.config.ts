import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:3080",
      "/api/ws": { target: "ws://localhost:3080", ws: true },
    },
  },
  build: { outDir: "dist" },
});