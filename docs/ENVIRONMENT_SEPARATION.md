# Enterprise Environment Separation Guide

This document describes the **single-project, multi-environment** architecture for SkateHubba.

## Overview

We use **one Firebase project** (`sk8hub-d7806`) with environment separation at:

1. **App level** - Different Firebase Web App IDs for prod vs staging
2. **Data level** - Namespaced Firestore paths (`/env/prod/...` vs `/env/staging/...`)
3. **Config level** - Universal `EXPO_PUBLIC_*` env vars across web + mobile

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Firebase Project: sk8hub-d7806                │
├────────────────────────────┬────────────────────────────────────┤
│    Web App (Production)    │    Web App (Staging)               │
│ appId: ...731aaae...       │ appId: ...STAGING...               │
├────────────────────────────┴────────────────────────────────────┤
│                      Firestore Database                         │
│  ├── /env/prod/users/{uid}       ← Production data              │
│  ├── /env/prod/checkins/{id}                                    │
│  ├── /env/staging/users/{uid}    ← Staging data (isolated)      │
│  └── /env/staging/checkins/{id}                                 │
├─────────────────────────────────────────────────────────────────┤
│                      Storage Bucket                             │
│  ├── /env/prod/uploads/...       ← Production files             │
│  └── /env/staging/uploads/...    ← Staging files (isolated)     │
└─────────────────────────────────────────────────────────────────┘
```

## Environment Variables

All client-side config uses `EXPO_PUBLIC_*` prefix for compatibility with:

- **Vite** (web) - via `envPrefix: ["VITE_", "EXPO_PUBLIC_"]`
- **Metro/Expo** (mobile) - native support for `EXPO_PUBLIC_*`

### Required Variables

```bash
# Environment selector: 'prod' | 'staging' | 'local'
EXPO_PUBLIC_APP_ENV=staging

# API configuration
EXPO_PUBLIC_API_BASE_URL=https://staging-api.skatehubba.com
EXPO_PUBLIC_CANONICAL_ORIGIN=https://staging.skatehubba.com

# Firebase (shared across environments)
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyD6kLt4GKV4adX-oQ3m_aXIpL6GXBP0xZw
EXPO_PUBLIC_FIREBASE_PROJECT_ID=sk8hub-d7806
# ... etc

# Firebase App IDs for guardrails (single-project separation)
EXPO_PUBLIC_FIREBASE_APP_ID_PROD=1:665573979824:web:731aaae46daea5efee2d75
EXPO_PUBLIC_FIREBASE_APP_ID_STAGING=1:665573979824:web:YOUR_STAGING_APP_ID
```

## @skatehubba/config Package

The shared config package provides:

### `getAppEnv(): 'prod' | 'staging' | 'local'`

Returns current environment.

### `isProd()` / `isStaging()`

Environment check helpers.

### `getFirebaseConfig()`

Returns correct Firebase config for current environment.

### `assertEnvWiring()`

**Call at app startup!** Validates:

- API URL matches environment
- Firebase appId matches environment
- Throws `EnvMismatchError` if misconfigured

### `getEnvPath(basePath: string): string`

Prefixes Firestore paths with environment namespace:

```ts
getEnvPath("users/abc123"); // → '/env/prod/users/abc123'
```

### `getStoragePath(path: string): string`

Prefixes Storage paths with environment namespace.

### `validateWritePath(path: string): void`

Ensures writes stay in current environment's namespace.

## UI Guardrails

### Staging Banner

When `EXPO_PUBLIC_APP_ENV=staging`, a prominent yellow banner appears:

```
🧪 STAGING ENVIRONMENT (Data writes go to staging namespace)
```

This is rendered by `<StagingBanner />` in App.tsx.

### Local Banner

When `EXPO_PUBLIC_APP_ENV=local`, a blue banner shows:

```
🔧 LOCAL DEVELOPMENT
```

## Setting Up Staging

### 1. Create Staging Web App in Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/project/sk8hub-d7806)
2. Click ⚙️ → Project settings → Add app → Web
3. Name it "SkateHubba Staging"
4. Copy the new `appId`
5. Add to your staging environment:
   ```
   EXPO_PUBLIC_FIREBASE_APP_ID_STAGING=1:665573979824:web:YOUR_NEW_APP_ID
   ```

### 2. Vercel Configuration

Create two projects in Vercel:

- **skatehubba** (production) → `EXPO_PUBLIC_APP_ENV=prod`
- **skatehubba-staging** (staging) → `EXPO_PUBLIC_APP_ENV=staging`

### 3. Firestore Security Rules

Update rules to enforce namespace isolation:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Environment-namespaced data
    match /env/{environment}/{path=**} {
      // Only allow access to your own environment
      allow read, write: if request.auth != null
        && environment == request.auth.token.env;
    }
  }
}
```

## Validation Checklist

✅ `EXPO_PUBLIC_APP_ENV` set correctly  
✅ `EXPO_PUBLIC_API_BASE_URL` points to correct API  
✅ `assertEnvWiring()` runs at startup  
✅ Staging banner visible in staging  
✅ Data paths use `getEnvPath()` for Firestore  
✅ File uploads use `getStoragePath()` for Storage

## Migration Guide

### Existing Code

Replace direct path references with namespaced versions:

```ts
// Before
const userRef = doc(db, "users", uid);

// After
import { getEnvPath } from "@skatehubba/config";
const userRef = doc(db, getEnvPath(`users/${uid}`));
```

### Existing Data

Production data stays at root paths. New architecture uses `/env/prod/...` prefix.
Consider a migration script if needed.

## Troubleshooting

### "EnvMismatchError: API URL mismatch"

Your `EXPO_PUBLIC_API_BASE_URL` doesn't match the expected pattern for your environment.

### Staging banner not showing

Check `EXPO_PUBLIC_APP_ENV` is set to `staging` (not `production` or `prod`).

### Data appearing in wrong environment

Ensure all Firestore/Storage paths use `getEnvPath()` / `getStoragePath()`.
