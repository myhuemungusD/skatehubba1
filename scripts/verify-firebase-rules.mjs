#!/usr/bin/env node
/* eslint-disable no-console */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Firebase Rules Verification (Enterprise)
 *
 * Modes:
 *  - validate : dry-run rules "release" validation (syntax/compile check on Firebase)
 *  - compare  : fetch deployed rules and compare with repo versions
 *  - both     : validate + compare (default; best for CI)
 *
 * Env:
 *  - FIREBASE_PROJECT_ID (required)
 *  - FIREBASE_TOKEN (required) - CI token; never printed
 *
 * Optional:
 *  - FIREBASE_TOOLS_VERSION (default: "latest")
 *  - FIREBASE_RULES_STRICT (default: "true") - fail if rules files missing
 *
 * Usage:
 *  node scripts/verify-firebase-rules.mjs
 *  node scripts/verify-firebase-rules.mjs --mode=compare
 *  node scripts/verify-firebase-rules.mjs --mode=validate
 */

const argv = process.argv.slice(2);
const modeArg = argv.find((a) => a.startsWith("--mode="))?.split("=")[1];
const mode = (modeArg ?? "both").toLowerCase();

const projectId = process.env.FIREBASE_PROJECT_ID;
const token = process.env.FIREBASE_TOKEN;
const toolsVersion = process.env.FIREBASE_TOOLS_VERSION ?? "latest";
const strict = (process.env.FIREBASE_RULES_STRICT ?? "true").toLowerCase() === "true";

if (!projectId) {
  console.error("❌ Missing FIREBASE_PROJECT_ID.");
  process.exit(1);
}
if (!token) {
  console.error("❌ Missing FIREBASE_TOKEN.");
  process.exit(1);
}

const repoRoot = process.cwd();
const firestoreRulesPath = path.join(repoRoot, "firestore.rules");
const storageRulesPath = path.join(repoRoot, "storage.rules");

const hasFirestoreRules = existsSync(firestoreRulesPath);
const hasStorageRules = existsSync(storageRulesPath);

if (strict && !hasFirestoreRules) {
  console.error("❌ firestore.rules not found at repo root.");
  process.exit(1);
}
if (strict && !hasStorageRules) {
  console.error("❌ storage.rules not found at repo root.");
  process.exit(1);
}

const normalize = (s) => s.replace(/\r\n/g, "\n").trim() + "\n";

const readLocal = (filePath) => normalize(readFileSync(filePath, "utf8"));

/**
 * Executes firebase-tools via npx without invoking a shell.
 * Any --token argument is moved into the child env to avoid exposing it in process listings.
 */
function runFirebase(args) {
  // Copy args so we can safely modify them
  const processedArgs = [...args];

  // Build child environment and ensure we do not accidentally inherit FIREBASE_TOKEN
  const childEnv = {
    ...process.env,
    FIREBASE_TOKEN: undefined,
  };

  // Extract token from CLI args, if present, and move it into the environment
  for (let i = 0; i < processedArgs.length; i += 1) {
    const arg = processedArgs[i];

    // Handle "--token <value>"
    if (arg === "--token" && i + 1 < processedArgs.length) {
      const value = processedArgs[i + 1];
      childEnv.FIREBASE_TOKEN = value;
      processedArgs.splice(i, 2);
      i -= 1;
      continue;
    }

    // Handle "--token=<value>"
    if (arg.startsWith("--token=")) {
      const value = arg.slice("--token=".length);
      childEnv.FIREBASE_TOKEN = value;
      processedArgs.splice(i, 1);
      i -= 1;
    }
  }

  try {
    return execFileSync(
      "npx",
      ["firebase-tools@" + toolsVersion, ...processedArgs],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: childEnv,
      }
    );
  } catch (err) {
    // Sanitize any accidental token echo from stderr/stdout
    const stdout = typeof err?.stdout === "string" ? err.stdout : "";
    const stderr = typeof err?.stderr === "string" ? err.stderr : "";
    const msg = typeof err?.message === "string" ? err.message : "firebase-tools failed";
    const safe = (txt) => (txt ? txt.replaceAll(token, "***MASKED***") : txt);

    console.error("❌ firebase-tools command failed.");
    console.error(safe(msg));
    if (stdout) console.error(safe(stdout));
    if (stderr) console.error(safe(stderr));

    process.exit(1);
  }
}

function validateRules() {
  console.log(`🔍 Validate rules (dry-run) for project: ${projectId}`);

  if (hasFirestoreRules) {
    console.log("  • Firestore rules: validating…");
    // NOTE: firebase-tools supports --dry-run on deploy; for rules release, behavior can vary.
    // Using "deploy --only" with --dry-run is the most consistent compile/validation check.
    runFirebase([
      "deploy",
      "--only",
      "firestore:rules",
      "--project",
      projectId,
      "--token",
      token,
      "--non-interactive",
      "--dry-run",
    ]);
    console.log("  ✅ Firestore rules validate (dry-run) OK");
  } else {
    console.log("  ⚠️  Firestore rules missing; skipped");
  }

  if (hasStorageRules) {
    console.log("  • Storage rules: validating…");
    runFirebase([
      "deploy",
      "--only",
      "storage",
      "--project",
      projectId,
      "--token",
      token,
      "--non-interactive",
      "--dry-run",
    ]);
    console.log("  ✅ Storage rules validate (dry-run) OK");
  } else {
    console.log("  ⚠️  Storage rules missing; skipped");
  }
}

function compareRules() {
  console.log(`🧾 Compare deployed rules vs repo for project: ${projectId}`);

  if (hasFirestoreRules) {
    const localFirestore = readLocal(firestoreRulesPath);
    const remoteFirestore = normalize(
      runFirebase([
        "firestore:rules",
        "--project",
        projectId,
        "--token",
        token,
        "--non-interactive",
      ])
    );

    if (remoteFirestore !== localFirestore) {
      console.error("❌ Firestore rules mismatch (repo != deployed).");
      process.exit(1);
    }
    console.log("  ✅ Firestore rules match deployed");
  } else {
    console.log("  ⚠️  Firestore rules missing; skipped");
  }

  if (hasStorageRules) {
    const localStorage = readLocal(storageRulesPath);
    const remoteStorage = normalize(
      runFirebase([
        "storage:rules",
        "--project",
        projectId,
        "--token",
        token,
        "--non-interactive",
      ])
    );

    if (remoteStorage !== localStorage) {
      console.error("❌ Storage rules mismatch (repo != deployed).");
      process.exit(1);
    }
    console.log("  ✅ Storage rules match deployed");
  } else {
    console.log("  ⚠️  Storage rules missing; skipped");
  }
}

if (!["both", "validate", "compare"].includes(mode)) {
  console.error(`❌ Invalid --mode. Use one of: both | validate | compare (got: ${mode})`);
  process.exit(1);
}

if (mode === "validate") validateRules();
if (mode === "compare") compareRules();
if (mode === "both") {
  validateRules();
  compareRules();
}

console.log("✅ Firebase rules verification complete.");
