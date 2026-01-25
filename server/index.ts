import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes.ts";
import { setupVite, log } from "./vite-dev.ts";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import logger from "./logger.ts";
import { ensureCsrfToken, requireCsrfToken } from "./middleware/csrf.ts";
import { apiLimiter, staticFileLimiter, securityMiddleware } from "./middleware/security.ts";
import { initializeSocketServer, shutdownSocketServer, getSocketStats } from "./socket/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Security middleware - enterprise-grade security headers
app.use(
  helmet({
    // Content Security Policy - prevent XSS and injection attacks
    contentSecurityPolicy:
      process.env.NODE_ENV === "production"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              imgSrc: ["'self'", "data:", "https:", "blob:"],
              connectSrc: [
                "'self'",
                "https:",
                "wss:",
                "https://*.firebaseio.com",
                "https://*.googleapis.com",
                "https://api.stripe.com",
              ],
              fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'", "blob:"],
              frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
              workerSrc: ["'self'", "blob:"],
              childSrc: ["'self'", "blob:"],
              formAction: ["'self'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
    // Strict-Transport-Security - enforce HTTPS
    strictTransportSecurity:
      process.env.NODE_ENV === "production"
        ? {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true,
          }
        : false,
    // X-Content-Type-Options - prevent MIME type sniffing (no X- prefix in helmet)
    noSniff: true,
    // X-Frame-Options - prevent clickjacking
    frameguard: { action: "deny" },
    // X-XSS-Protection - legacy XSS protection
    xssFilter: true,
    // Referrer-Policy - control referrer information
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // X-DNS-Prefetch-Control - control DNS prefetching
    dnsPrefetchControl: { allow: false },
    // X-Permitted-Cross-Domain-Policies - prevent Adobe cross-domain policies
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    // X-Download-Options - prevent IE from executing downloads
    ieNoOpen: true,
    // Origin-Agent-Cluster - request process isolation
    originAgentCluster: true,
    // Cross-Origin-Embedder-Policy - control cross-origin embedding
    crossOriginEmbedderPolicy: false, // Disabled for third-party content (maps, videos)
    // Cross-Origin-Opener-Policy - control window opener access
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    // Cross-Origin-Resource-Policy - control cross-origin resource sharing
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin for API
  })
);

// Additional security headers not covered by helmet
app.use((_req, res, next) => {
  // Permissions-Policy - control browser features
  res.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(self), usb=()"
  );
  // Cache-Control for API responses
  if (_req.path.startsWith("/api")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

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
app.use("/api", securityMiddleware);
app.use("/api", apiLimiter);

// Global CSRF validation for all state-changing API requests
app.use("/api", requireCsrfToken);

// Register all API routes
await registerRoutes(app);

// Initialize WebSocket server
const io = initializeSocketServer(server);
logger.info("[Server] WebSocket server initialized");

// Liveness probe - indicates the server is running
// Use for Kubernetes livenessProbe or load balancer health checks
app.get("/api/health", (_req, res) => {
  const stats = getSocketStats();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    uptime: process.uptime(),
    websocket: {
      connections: stats.connections,
      rooms: stats.rooms.totalRooms,
      onlineUsers: stats.presence.online,
    },
  });
});

// Readiness probe - indicates the server can accept traffic
// Use for Kubernetes readinessProbe to check if all dependencies are ready
app.get("/api/ready", async (_req, res) => {
  const checks: { name: string; status: "ok" | "error"; latencyMs?: number; error?: string }[] = [];
  const startTime = Date.now();

  // Check database connection
  try {
    const { isDatabaseAvailable, pool } = await import("./db.ts");
    if (isDatabaseAvailable() && pool) {
      const dbStart = Date.now();
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      checks.push({
        name: "database",
        status: "ok",
        latencyMs: Date.now() - dbStart,
      });
    } else {
      checks.push({
        name: "database",
        status: "error",
        error: "Database not configured",
      });
    }
  } catch (error) {
    checks.push({
      name: "database",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // Check WebSocket server
  try {
    const stats = getSocketStats();
    checks.push({
      name: "websocket",
      status: "ok",
      latencyMs: 0,
    });
  } catch (error) {
    checks.push({
      name: "websocket",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  const allOk = checks.every((check) => check.status === "ok");
  const totalLatency = Date.now() - startTime;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    totalLatencyMs: totalLatency,
    checks,
  });
});

// Setup Vite dev server or production static file serving
if (process.env.NODE_ENV === "development") {
  await setupVite(app, server);
} else {
  const clientDistCandidates = [
    path.resolve(__dirname, "../client/dist"),
    path.resolve(__dirname, "../../client/dist"),
  ];
  const publicCandidates = [
    path.resolve(__dirname, "../public"),
    path.resolve(__dirname, "../../public"),
  ];

  const staticDirs = [...clientDistCandidates, ...publicCandidates].filter((dir) =>
    fs.existsSync(dir)
  );

  // Serve built SPA assets first, fall back to shared public assets
  for (const dir of staticDirs) {
    app.use(express.static(dir));
  }

  const indexHtmlPath = (() => {
    for (const base of clientDistCandidates) {
      const candidate = path.join(base, "index.html");
      if (fs.existsSync(candidate)) return candidate;
    }

    for (const base of publicCandidates) {
      const candidate = path.join(base, "index.html");
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  })();

  // Rate limit HTML serving to prevent file system abuse
  // CodeQL: Missing rate limiting - file system access now rate-limited
  app.get("*", staticFileLimiter, (_req, res) => {
    if (indexHtmlPath) {
      return res.sendFile(indexHtmlPath);
    }

    logger.error("No SPA index.html found in client/dist or public");
    return res.status(500).send("App build missing: index.html not found");
  });
}

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

// Global Express error handler (must be last middleware)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("[Server] Unhandled Express error", {
    error: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });

  // Don't leak error details in production
  const statusCode = (err as any).statusCode || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Global error handlers for uncaught exceptions and unhandled rejections
process.on("uncaughtException", (error: Error) => {
  logger.error("[Server] Uncaught exception - server will restart", {
    error: error.message,
    stack: error.stack,
  });

  // Give time for logging, then exit
  // In production, process manager (PM2, systemd, k8s) should restart the process
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
  logger.error("[Server] Unhandled promise rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });

  // Don't exit on unhandled rejections, but log for monitoring
  // This allows the application to continue running for other requests
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
