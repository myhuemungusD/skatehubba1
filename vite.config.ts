import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path";
import { fileURLToPath } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
    hmr: {
        port: 443 // Fixes potential Replit/Vercel WebSocket errors
    }
  },
  root: "client",
  build: {
    outDir: "dist", // <--- FIXED: Puts files right where Vercel wants them
    emptyOutDir: true,
    sourcemap: false
  },
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./client/src"),
      "@shared": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./shared")
    }
  },
  publicDir: "public"
});
