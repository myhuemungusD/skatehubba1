# CLAUDE.md - AI Assistant Guide for SkateHubba

This document provides essential context for AI assistants working with the SkateHubba codebase.

## Project Overview

**SkateHubba** is a skateboarding platform built around remote games of S.K.A.T.E. Everything else exists to support that core mechanic.

**Core Philosophy:**
- Proof, history, and reputation over hype
- Not a highlight reel app; not pay-to-verify
- Community-driven validation through voting/judging
- Location-based features (spot check-ins, streaks, city leaderboards)

**Core Product Loop:** Watch clips (feed) → Battle (remote S.K.A.T.E.) → Judge/vote → Check in at spots → Share/export clips → Repeat

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Node.js + Express + TypeScript |
| Auth | Firebase Authentication (OAuth, email/password, anonymous) |
| Real-time | Firestore + WebSocket (Socket.IO) |
| Database | PostgreSQL + Drizzle ORM |
| Storage | Firebase Storage |
| AI | Google Gemini Pro ("Hesher" AI Skate Buddy) |
| Payments | Stripe |
| CI/CD | GitHub Actions + CodeQL |
| Testing | Vitest, Cypress, Playwright |
| Hosting | Vercel (web), Firebase (functions) |

## Monorepo Structure

**Package Manager:** pnpm 10.28.1 (required - never use npm or yarn)
**Node.js:** 20.x LTS minimum
**Build Orchestration:** Turbo

```
skatehubba/
├── client/                 # Vite + React web app
│   ├── src/
│   │   ├── pages/         # Route pages (wouter router)
│   │   ├── components/    # UI components (Radix UI based)
│   │   ├── lib/           # Utilities (auth, api, firebase, validation)
│   │   ├── features/      # Feature modules
│   │   ├── store/         # Zustand stores (authStore, presenceStore, chatStore)
│   │   ├── hooks/         # Custom React hooks
│   │   └── config/        # Runtime config & feature flags
│
├── server/                 # Express API + WebSocket
│   ├── index.ts           # Server entry, middleware setup
│   ├── routes/            # API endpoints (analytics, filmer, metrics, moderation, profile)
│   ├── auth/              # Auth logic (routes, service, middleware, email, lockout, mfa)
│   ├── middleware/        # Security (CSRF, rate limits)
│   ├── socket/            # WebSocket server
│   ├── db.ts              # Drizzle database instance
│   ├── firestore.ts       # Firebase admin init
│   └── gemini.ts          # Google Generative AI integration
│
├── shared/                 # Shared schemas & types (SOURCE OF TRUTH)
│   ├── schema.ts          # Zod schemas for all data models
│   ├── schema-analytics.ts # Analytics event schemas
│   └── validation/        # Validation helpers
│
├── packages/
│   └── config/            # Universal environment configuration (@skatehubba/config)
│
├── functions/             # Firebase Cloud Functions
├── mobile/                # React Native Expo (E2E scaffold)
├── infra/                 # Infrastructure code
├── docs/                  # Documentation
└── scripts/               # Build & utility scripts
```

## Essential Commands

```bash
# Install dependencies (ALWAYS use pnpm)
pnpm install

# Development
pnpm dev                    # Start client (port 3000) + server (port 5000)

# Quality checks
pnpm typecheck              # TypeScript checking
pnpm lint                   # ESLint (fails on errors, warnings non-blocking)
pnpm test                   # Vitest (run once)
pnpm test:watch             # Vitest (watch mode)
pnpm test:coverage          # Coverage report

# Build
pnpm build                  # Build all packages

# Pre-commit verification (run before PRs)
pnpm verify                 # typecheck → lint → test → build

# Environment validation
pnpm validate:env           # Check environment variables
pnpm validate:env:prod      # Production environment check
pnpm validate:packages      # Validate package.json integrity

# E2E testing
pnpm e2e:client             # Cypress tests
```

## Coding Conventions

### TypeScript
- **Strict mode enabled** - avoid `any`, use `unknown` or generics
- **Functional components only** - no class components
- **camelCase** for variables/functions, **PascalCase** for types/components
- Prefer interfaces for object shapes, types for unions/primitives

### Shared DNA Rule
All data structures must start in `/shared`:
1. Define Zod schema in `shared/schema.ts`
2. Export types derived from that schema
3. Run `pnpm install` at root to refresh workspace links

### Styling
- **Tailwind CSS** exclusively - no custom CSS or inline styles
- Use design tokens from `tailwind.config.ts` - no hardcoded hex codes
- Dark mode: class-based (`dark:` prefix)
- Mobile-first responsive design

### React Patterns
- State: Zustand for global state, React Query for server state
- Router: wouter (lightweight, client-side)
- UI primitives: Radix UI (unstyled, accessible)
- Icons: Lucide React

### Error Handling
- Server: try-catch with structured logging (Winston)
- Client: Error Boundary for React crashes
- API responses: consistent error format with HTTP status codes

## Commit Message Format

Conventional Commits enforced via commitlint:

```
type(scope): subject

Types: feat, fix, docs, style, refactor, test, chore, perf, ci, build, revert
```

**Rules:**
- Subject: lowercase, max 72 chars, no period
- Header: max 100 chars
- Scope: optional, lowercase (e.g., `auth`, `game`, `spots`)

**Examples:**
```
feat(game): add replay functionality
fix(auth): resolve token refresh issue
docs: update API documentation
chore(deps): bump drizzle-orm to 0.44.2
```

## Branch Naming

- `feat/description` - New functionality
- `fix/description` - Bug resolutions
- `refactor/description` - Structural improvements
- `chore/description` - Maintenance tasks

## Testing

- **Unit tests:** Colocated with source files (`*.test.ts`, `*.test.tsx`)
- **E2E (Cypress):** `client/cypress/` - assumes app on `http://localhost:3000`
- **Coverage target:** 60% by Q2 2026 (currently 3%)

## Important Files

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Zod schemas - single source of truth for all data models |
| `client/src/App.tsx` | Main router and layout orchestration |
| `client/src/store/authStore.ts` | Auth state management (Zustand) |
| `server/index.ts` | Express server setup, middleware stack |
| `server/auth/routes.ts` | Auth endpoints (signup, login, MFA, etc.) |
| `packages/config/src/env.ts` | Environment loader with validation |
| `firestore.rules` | Firestore security rules |
| `storage.rules` | Firebase Storage security rules |
| `vercel.json` | Deployment config (authoritative) |

## Environment Variables

**Public (safe to expose):**
- `EXPO_PUBLIC_*` and `VITE_*` prefixes
- Firebase SDK config, Stripe publishable key, Sentry DSN

**Server-only secrets:**
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET`, `JWT_SECRET` - Auth secrets
- `FIREBASE_ADMIN_KEY` - Service account JSON
- `STRIPE_SECRET_KEY`, `GOOGLE_AI_API_KEY`, `RESEND_API_KEY`

Copy `.env.example` to `.env.local` and fill in values.

## Database Architecture

- **PostgreSQL (Drizzle ORM):** System of record for server-authoritative workflows
- **Firestore:** Real-time data (active challenges, chat, presence, notifications)
- **Firebase Storage:** Media (profile images, spot photos, videos)

Firestore uses environment namespacing: `/env/{environment}/` (prod, staging, local)

## Security Considerations

- All write endpoints require auth + validation
- Rate limits on public write paths
- CSRF protection (double-submit cookie pattern)
- Auth lockout after 5 failed attempts
- Firestore rules block client writes to protected fields (`trustLevel`, `reputationScore`, `isBanned`, `proVerificationStatus`)

## CI/CD Pipeline

**GitHub Actions on PR/push to main:**
1. Lockfile integrity check
2. Typecheck, lint, build
3. Test with coverage
4. Security scan (Gitleaks)
5. Firebase rules validation (main branch only)

**Deployment:**
- Vercel auto-deploys after CI passes
- Firebase Functions: manual via `firebase deploy --only functions`

## Common Workflows

### Adding a New Feature
1. Create branch: `feat/your-feature`
2. Define schemas in `shared/schema.ts` first
3. Implement backend in `server/`
4. Implement frontend in `client/`
5. Add tests colocated with implementation
6. Run `pnpm verify` before PR

### Fixing a Bug
1. Create branch: `fix/bug-description`
2. Write failing test first
3. Fix the bug
4. Verify test passes
5. Run `pnpm verify`

### Database Changes
```bash
pnpm drizzle-kit generate  # Generate migration
pnpm drizzle-kit migrate   # Run migration
```

## Archive Policy

`_archive/` is excluded from CI and is not part of the product. See `_archive/README.md` for contents.

## Documentation

Key docs in `/docs`:
- `DEPLOYMENT_RUNBOOK.md` - Deployment procedures
- `DATABASE_ARCHITECTURE.md` - Data layer design
- `TRUST_AND_SAFETY.md` - Moderation & safety
- `ENVIRONMENT_SEPARATION.md` - Prod/staging/local separation
- `roadmap.md` - Feature roadmap

## Trademark

SkateHubba is a trademark of Design Mainline LLC.
