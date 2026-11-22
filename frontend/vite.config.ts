import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    port: Number(process.env.FRONTEND_PORT ?? 5173),
    proxy: { "/api": backend, "/preview": backend, "/files": backend },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
