import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tsconfigPaths({ projects: [path.resolve(__dirname, "./tsconfig.json")] })],
  envDir: path.resolve(__dirname, ".."),
  // Expose both VITE_ and EXPO_PUBLIC_ prefixed env vars for universal compatibility
  envPrefix: ["VITE_", "EXPO_PUBLIC_"],
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  publicDir: "public",
});
