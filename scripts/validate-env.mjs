#!/usr/bin/env node
/**
 * Environment Variable Validator
 * 
 * Validates that all required environment variables are set before starting the app.
 * Run: node scripts/validate-env.mjs [--production]
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const isProduction = process.argv.includes('--production');

// Required environment variables
const REQUIRED_VARS = {
  // Always required
  common: [
    'DATABASE_URL',
  ],
  // Required in production only
  production: [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'SESSION_SECRET',
  ],
  // Optional but recommended
  recommended: [
    'SENTRY_DSN',
    'RESEND_API_KEY',
  ],
};

// Sensitive patterns that should NEVER be in code
const FORBIDDEN_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/, // Google API Key
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, // Private keys
  /ghp_[0-9a-zA-Z]{36}/, // GitHub Personal Access Token
  /sk_live_[0-9a-zA-Z]{24,}/, // Stripe Live Key
  /sk-[a-zA-Z0-9]{48}/, // OpenAI API Key
];

const errors = [];
const warnings = [];

console.log('🔍 Validating environment...\n');

// Check required variables
const varsToCheck = [...REQUIRED_VARS.common];
if (isProduction) {
  varsToCheck.push(...REQUIRED_VARS.production);
}

for (const varName of varsToCheck) {
  if (!process.env[varName]) {
    errors.push(`Missing required variable: ${varName}`);
  }
}

// Check recommended variables
for (const varName of REQUIRED_VARS.recommended) {
  if (!process.env[varName]) {
    warnings.push(`Missing recommended variable: ${varName}`);
  }
}

// Scan source files for hardcoded secrets
console.log('  Scanning for hardcoded secrets...');

const filesToScan = [
  'server/index.ts',
  'server/auth/routes.ts',
  'server/config/env.ts',
  'client/src/config/env.ts',
];

for (const relativePath of filesToScan) {
  const fullPath = join(rootDir, relativePath);
  
  if (!existsSync(fullPath)) continue;
  
  const content = readFileSync(fullPath, 'utf-8');
  
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`SECURITY: Potential hardcoded secret found in ${relativePath}`);
    }
  }
}

// Check .env.example exists and matches
const envExamplePath = join(rootDir, '.env.example');
if (existsSync(envExamplePath)) {
  console.log('  Checking .env.example...');
  const exampleContent = readFileSync(envExamplePath, 'utf-8');
  const exampleVars = exampleContent
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=')[0].trim())
    .filter(Boolean);
  
  // Check all required vars are documented
  for (const varName of [...REQUIRED_VARS.common, ...REQUIRED_VARS.production]) {
    if (!exampleVars.includes(varName)) {
      warnings.push(`Variable ${varName} is required but not documented in .env.example`);
    }
  }
}

// Report results
console.log('\n');

if (errors.length > 0) {
  console.log('🚫 ERRORS:\n');
  for (const error of errors) {
    console.log(`  ❌ ${error}`);
  }
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  WARNINGS:\n');
  for (const warning of warnings) {
    console.log(`  ⚠️  ${warning}`);
  }
  console.log('');
}

if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ Environment validation passed!\n');
  process.exit(0);
} else if (errors.length > 0) {
  console.log(`\n🚫 ${errors.length} error(s) found. Fix before deploying.\n`);
  process.exit(1);
} else {
  console.log(`\n⚠️  ${warnings.length} warning(s). Consider reviewing.\n`);
  process.exit(0);
}
