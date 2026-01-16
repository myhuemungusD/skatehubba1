/**
 * Universal Environment Variable Access
 *
 * Works in both Vite (web) and Metro (mobile) without crashing.
 * Avoids direct `import.meta` syntax which can break Metro bundler.
 *
 * @module @skatehubba/config/publicEnv
 */

type AnyEnv = Record<string, string | undefined>;

/**
 * Read from Vite's import.meta.env (web builds)
 * Safe access without crashing Metro
 */
function readFromVite(name: string): string | undefined {
  // Safe access: Metro doesn't have import.meta, so we check via globalThis

  const meta = (globalThis as any).import?.meta;
  const env: AnyEnv | undefined = meta?.env;
  return env?.[name];
}

/**
 * Read from process.env (Node.js, Expo)
 */
function readFromProcess(name: string): string | undefined {
  const env: AnyEnv | undefined = (globalThis as any).process?.env;
  return env?.[name];
}

/**
 * Get a public environment variable
 * Works in Vite (web), Metro (mobile), and Node.js (server)
 *
 * @param name - Full env var name (e.g., "EXPO_PUBLIC_API_BASE_URL")
 * @throws Error if the env var is not set
 */
export function getPublicEnv(name: string): string {
  const v = readFromVite(name) ?? readFromProcess(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Get a public environment variable with optional fallback
 * Returns undefined if not set (doesn't throw)
 */
export function getPublicEnvOptional(name: string): string | undefined {
  return readFromVite(name) ?? readFromProcess(name);
}

/**
 * Application environment type
 */
export type AppEnv = "prod" | "staging" | "local";

/**
 * Get the current application environment
 * Defaults to 'local' for development safety
 */
export function getAppEnv(): AppEnv {
  const v =
    readFromVite("EXPO_PUBLIC_APP_ENV") ?? readFromProcess("EXPO_PUBLIC_APP_ENV") ?? "local";
  if (v === "prod" || v === "staging" || v === "local") return v;
  return "local";
}

/**
 * Check if running in production
 */
export function isProd(): boolean {
  return getAppEnv() === "prod";
}

/**
 * Check if running in staging
 */
export function isStaging(): boolean {
  return getAppEnv() === "staging";
}

/**
 * Check if running in local development
 */
export function isLocal(): boolean {
  return getAppEnv() === "local";
}
