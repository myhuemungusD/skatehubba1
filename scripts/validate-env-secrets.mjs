#!/usr/bin/env node
/**
 * Validate that no secrets use public prefixes (VITE_, EXPO_PUBLIC_)
 * 
 * These prefixes expose variables to the client bundle, which must
 * NEVER contain secrets like API keys, passwords, or tokens.
 * 
 * Run: node scripts/validate-env.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Known safe patterns for public prefixes
const SAFE_PUBLIC_PATTERNS = [
  // Firebase config (public by design)
  /^(VITE_|EXPO_PUBLIC_)FIREBASE_(API_KEY|AUTH_DOMAIN|PROJECT_ID|STORAGE_BUCKET|MESSAGING_SENDER_ID|APP_ID|MEASUREMENT_ID)/,
  // Environment selector
  /^EXPO_PUBLIC_APP_ENV$/,
  // API URLs (public endpoints)
  /^(VITE_|EXPO_PUBLIC_)(API_BASE_URL|CANONICAL_ORIGIN)$/,
  // Stripe publishable key (public by design)
  /^(VITE_|EXPO_PUBLIC_)STRIPE_PUBLISHABLE_KEY$/,
  // Sentry DSN (safe to expose)
  /^(VITE_|EXPO_PUBLIC_)SENTRY_DSN$/,
  // Public-facing URLs
  /^(VITE_|EXPO_PUBLIC_)DONATE_(STRIPE|PAYPAL)_URL$/,
  // reCAPTCHA site key (public by design)
  /^VITE_RECAPTCHA_SITE_KEY$/,
];

// Dangerous patterns that should NEVER have public prefixes
const DANGEROUS_PATTERNS = [
  /SECRET/i,
  /PASSWORD/i,
  /PRIVATE/i,
  /ADMIN.*KEY/i,
  /SERVICE_ACCOUNT/i,
  /CREDENTIALS/i,
  /TOKEN(?!_ID)/i, // TOKEN but not TOKEN_ID
];

function checkEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return { errors: [], warnings: [] };
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const errors = [];
  const warnings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (!match) continue;

    const varName = match[1];
    const isPublic = varName.startsWith('VITE_') || varName.startsWith('EXPO_PUBLIC_');

    if (!isPublic) continue;

    // Check if it's a known safe pattern
    const isSafe = SAFE_PUBLIC_PATTERNS.some(pattern => pattern.test(varName));
    if (isSafe) continue;

    // Check if it matches dangerous patterns
    const isDangerous = DANGEROUS_PATTERNS.some(pattern => pattern.test(varName));
    if (isDangerous) {
      errors.push({
        line: i + 1,
        varName,
        message: `🚨 POTENTIAL SECRET LEAK: ${varName} has a public prefix but looks like a secret!`,
      });
    } else {
      warnings.push({
        line: i + 1,
        varName,
        message: `⚠️  Unknown public variable: ${varName} - verify this is safe to expose to clients`,
      });
    }
  }

  return { errors, warnings };
}

// Main
console.log('🔍 Validating environment variables for secret leaks...\n');

const filesToCheck = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.staging',
  '.env.example',
];

let totalErrors = 0;
let totalWarnings = 0;

for (const file of filesToCheck) {
  const fullPath = join(rootDir, file);
  if (!existsSync(fullPath)) continue;

  const { errors, warnings } = checkEnvFile(fullPath);
  
  if (errors.length > 0 || warnings.length > 0) {
    console.log(`📄 ${file}:`);
    
    for (const error of errors) {
      console.log(`   Line ${error.line}: ${error.message}`);
      totalErrors++;
    }
    
    for (const warning of warnings) {
      console.log(`   Line ${warning.line}: ${warning.message}`);
      totalWarnings++;
    }
    
    console.log('');
  }
}

if (totalErrors === 0 && totalWarnings === 0) {
  console.log('✅ No potential secret leaks detected in public environment variables.\n');
  process.exit(0);
} else if (totalErrors > 0) {
  console.log(`\n🚫 Found ${totalErrors} potential secret leak(s)!`);
  console.log('   Remove VITE_ or EXPO_PUBLIC_ prefix from secrets, or move to server-only variables.\n');
  process.exit(1);
} else {
  console.log(`\n⚠️  Found ${totalWarnings} unrecognized public variable(s).`);
  console.log('   Verify these are safe to expose, then add to SAFE_PUBLIC_PATTERNS if needed.\n');
  process.exit(0);
}
