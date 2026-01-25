import { inspect } from "node:util";

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  version?: string;
  requestId?: string;
  duration?: number;
  [key: string]: unknown;
}

// Environment configuration
const isProduction = process.env.NODE_ENV === "production";
const useJsonFormat = isProduction || process.env.LOG_FORMAT === "json";
const serviceVersion = process.env.npm_package_version || "1.0.0";

class Logger {
  private readonly levelOrder: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    fatal: 50,
  };

  private readonly minLevel: LogLevel;
  private readonly bindings: LogContext;

  constructor(bindings: LogContext = {}, level?: LogLevel) {
    const configured = (process.env.LOG_LEVEL as LogLevel | undefined)?.toLowerCase() as
      | LogLevel
      | undefined;
    this.minLevel = level ?? configured ?? (isProduction ? "info" : "debug");
    this.bindings = bindings;
  }

  child(bindings: LogContext): Logger {
    return new Logger({ ...this.bindings, ...bindings }, this.minLevel);
  }

  /**
   * Start a timer for measuring operation duration
   * @returns Function to call when operation completes, returns duration in ms
   */
  startTimer(): () => number {
    const start = process.hrtime.bigint();
    return () => Number(process.hrtime.bigint() - start) / 1_000_000;
  }

  debug(message: string, context: LogContext = {}) {
    this.log("debug", message, context);
  }

  info(message: string, context: LogContext = {}) {
    this.log("info", message, context);
  }

  warn(message: string, context: LogContext = {}) {
    this.log("warn", message, context);
  }

  error(message: string, context: LogContext = {}) {
    this.log("error", message, context);
  }

  fatal(message: string, context: LogContext = {}) {
    this.log("fatal", message, context);
  }

  private log(level: LogLevel, message: string, context: LogContext) {
    if (this.levelOrder[level] < this.levelOrder[this.minLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const payload = { ...this.bindings, ...context };
    const sanitized = this.redact(payload);

    if (useJsonFormat) {
      // Structured JSON output for log aggregation (Datadog, Splunk, ELK, etc.)
      const logEntry: LogEntry = {
        timestamp,
        level,
        message,
        service: (this.bindings.service as string) || "skatehubba-server",
        environment: (this.bindings.env as string) || process.env.NODE_ENV || "development",
        version: serviceVersion,
        ...sanitized,
      };

      const jsonLine = JSON.stringify(logEntry);

      switch (level) {
        case "error":
        case "fatal":
          console.error(jsonLine);
          break;
        case "warn":
          console.warn(jsonLine);
          break;
        default:
          console.log(jsonLine);
      }
    } else {
      // Human-readable format for development
      const serialized =
        Object.keys(sanitized).length > 0
          ? ` ${inspect(sanitized, { depth: 5, compact: true, colors: true })}`
          : "";
      const levelColors: Record<LogLevel, string> = {
        debug: "\x1b[36m", // Cyan
        info: "\x1b[32m", // Green
        warn: "\x1b[33m", // Yellow
        error: "\x1b[31m", // Red
        fatal: "\x1b[35m", // Magenta
      };
      const reset = "\x1b[0m";
      const line = `${levelColors[level]}[${timestamp}] [${level.toUpperCase()}]${reset} ${message}${serialized}`;

      switch (level) {
        case "debug":
          console.debug(line);
          break;
        case "info":
          console.info(line);
          break;
        case "warn":
          console.warn(line);
          break;
        case "error":
        case "fatal":
          console.error(line);
          break;
        default:
          console.log(line);
      }
    }
  }

  private redact(context: LogContext): LogContext {
    const result: LogContext = {};
    for (const [key, value] of Object.entries(context)) {
      if (!value) continue;

      if (typeof value === "string" && this.isSensitiveKey(key)) {
        result[key] = "***";
        continue;
      }

      if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === "string" ? this.maskIfSensitive(key, item) : item
        );
        continue;
      }

      if (typeof value === "object" && value !== null) {
        result[key] = this.redact(value as LogContext);
        continue;
      }

      result[key] = this.maskIfSensitive(key, value);
    }
    return result;
  }

  private isSensitiveKey(key: string): boolean {
    const lowered = key.toLowerCase();
    return (
      lowered.includes("password") ||
      lowered.includes("token") ||
      lowered.includes("secret") ||
      lowered.includes("email")
    );
  }

  private maskIfSensitive(key: string, value: unknown): unknown {
    if (this.isSensitiveKey(key)) {
      return "***";
    }
    return value;
  }
}

const logger = new Logger({
  service: "skatehubba-server",
  env: process.env.NODE_ENV ?? "development",
});

export const createChildLogger = (bindings: LogContext) => logger.child(bindings);

export default logger;
