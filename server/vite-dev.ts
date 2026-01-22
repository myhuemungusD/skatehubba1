import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";
import { fileURLToPath } from "node:url";
import { staticFileLimiter } from "./middleware/security";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const clientDir = path.join(rootDir, "client");

// Dynamic imports for Vite - only loaded in development

let viteModule: typeof import("vite") | null = null;
let viteLogger: import("vite").Logger | null = null;

const viteConfig = {
  root: clientDir,
  resolve: {
    alias: {
      "@": path.join(clientDir, "src"),
      "@shared": path.join(rootDir, "shared"),
    },
  },
  publicDir: path.join(clientDir, "public"),
};

if (process.env.NODE_ENV === "development") {
  viteModule = await import("vite");
  viteLogger = viteModule.createLogger();
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("setupVite should only be called in development mode");
  }

  if (!viteModule) {
    throw new Error("Vite module not loaded");
  }

  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await viteModule.createServer({
    ...viteConfig,
    configFile: false,
    customLogger: viteLogger
      ? {
          ...viteLogger,
          error: (msg: string, options?: { timestamp?: boolean; clear?: boolean }) => {
            viteLogger?.error(msg, options);
            // process.exit(1);
          },
        }
      : undefined,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  // Rate limit HTML template serving to prevent file system abuse
  // CodeQL: Missing rate limiting - file system access now rate-limited
  app.use("*", staticFileLimiter, async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(import.meta.dirname, "..", "client", "index.html");

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
