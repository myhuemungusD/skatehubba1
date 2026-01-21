import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes.ts";
import { setupVite, log } from "./vite-dev.ts";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import logger from "./logger.ts";
import { ensureCsrfToken, requireCsrfToken } from "./middleware/csrf.ts";
import { apiLimiter, staticFileLimiter } from "./middleware/security.ts";
import { initializeSocketServer, shutdownSocketServer, getSocketStats } from "./socket/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Security middleware
if (process.env.NODE_ENV === "production") {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:", "blob:"],
          connectSrc: ["'self'", "https:"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
    })
  );
}

// CORS configuration
const corsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    const allowed = process.env.ALLOWED_ORIGINS?.split(",") || [];
    // Allow requests with no origin (like mobile apps) or matching allowed domains
    if (!origin || allowed.indexOf(origin) !== -1 || process.env.NODE_ENV !== "production") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing (before CSRF to enable JSON/form requests)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const loggedPath = req.originalUrl ? req.originalUrl.split("?")[0] : req.url.split("?")[0];
    logger.info("HTTP request", {
      method: req.method,
      path: loggedPath,
      status: res.statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
  });
  next();
});

// Cookie parsing - MUST come before CSRF token creation
// lgtm[js/missing-token-validation] - CSRF protection is implemented via ensureCsrfToken/requireCsrfToken below
// codeql[js/missing-token-validation] - False positive: custom double-submit CSRF pattern follows immediately
app.use(cookieParser());

// CSRF protection (double-submit cookie pattern) - MUST come after cookieParser
// Implements OWASP Double Submit Cookie pattern: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
// 1. ensureCsrfToken: Sets CSRF token in httpOnly=false cookie for all requests
// 2. requireCsrfToken: Validates X-CSRF-Token header matches cookie on state-changing requests
// This prevents attackers from reading the cookie cross-origin due to Same-Origin Policy
app.use(ensureCsrfToken);

// Global rate limiting for all API routes (before CSRF validation for better error handling)
app.use("/api", apiLimiter);

// Global CSRF validation for all state-changing API requests
app.use("/api", requireCsrfToken);

// Register all API routes
await registerRoutes(app);

// Initialize WebSocket server
const io = initializeSocketServer(server);
logger.info("[Server] WebSocket server initialized");

// Health check endpoint with socket stats
app.get("/api/health", (_req, res) => {
  const stats = getSocketStats();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    websocket: {
      connections: stats.connections,
      rooms: stats.rooms.totalRooms,
      onlineUsers: stats.presence.online,
    },
  });
});

// Setup Vite dev server or production static file serving
if (process.env.NODE_ENV === "development") {
  await setupVite(app, server);
} else {
  const publicDir = path.resolve(__dirname, "../public");
  app.use(express.static(publicDir));
  // Rate limit HTML serving to prevent file system abuse
  // CodeQL: Missing rate limiting - file system access now rate-limited
  app.get("*", staticFileLimiter, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error("Unhandled server error", { error: err.message });
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "internal_server_error" });
});

// Start server
const port = parseInt(process.env.PORT || "5000", 10);
server.listen(port, "0.0.0.0", () => {
  const mode = process.env.NODE_ENV || "development";
  if (mode === "development") {
    log(`Server running at http://0.0.0.0:${port}`, "server");
    log(`WebSocket server ready`, "socket");
  } else {
    logger.info(`SkateHubba production server running on port ${port}`);
    logger.info("WebSocket server ready for connections");
  }
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("[Server] SIGTERM received, shutting down gracefully...");
  await shutdownSocketServer(io);
  server.close(() => {
    logger.info("[Server] HTTP server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  logger.info("[Server] SIGINT received, shutting down gracefully...");
  await shutdownSocketServer(io);
  server.close(() => {
    logger.info("[Server] HTTP server closed");
    process.exit(0);
  });
});
