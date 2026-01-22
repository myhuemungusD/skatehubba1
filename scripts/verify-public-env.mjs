#!/usr/bin/env node

const REQUIRED_BASES = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
];

const OPTIONAL_BASES = ["FIREBASE_MEASUREMENT_ID"];

const isProd = process.env.NODE_ENV === "production";
const isVercel = process.env.VERCEL === "1";
const allowMissing = process.env.ALLOW_MISSING_PUBLIC_ENV === "true";
const requireEnv = process.env.REQUIRE_PUBLIC_ENV === "true";
const strict = (isVercel || isProd || requireEnv) && !allowMissing;

const missing = [];

for (const base of REQUIRED_BASES) {
  const viteKey = `VITE_${base}`;
  const expoKey = `EXPO_PUBLIC_${base}`;
  const hasVite = Boolean(process.env[viteKey]);
  const hasExpo = Boolean(process.env[expoKey]);

  if (!hasVite && !hasExpo) {
    missing.push(`${viteKey} or ${expoKey}`);
  }
}

if (missing.length > 0) {
  console.error("\n? Missing required public env vars for web build:");
  missing.forEach((key) => console.error(`  - ${key}`));
  console.error(
    "\nSet these in Vercel (Project ? Settings ? Environment Variables) or export them in CI.\n"
  );

  if (strict) {
    process.exit(1);
  } else {
    console.warn("??  Skipping failure (non-production build).");
  }
} else {
  console.log("? Public env check passed:");
  REQUIRED_BASES.forEach((base) =>
    console.log(`  - VITE_${base} or EXPO_PUBLIC_${base}`)
  );
  OPTIONAL_BASES.forEach((base) => {
    const viteKey = `VITE_${base}`;
    const expoKey = `EXPO_PUBLIC_${base}`;
    if (process.env[viteKey] || process.env[expoKey]) {
      console.log(`  - ${viteKey} or ${expoKey} (optional)`);
    }
  });
}
