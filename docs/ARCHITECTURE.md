# Architecture

## System Overview

SkateHubba is a mobile-first platform with a React/Vite client, a Node/Express API, and a split data plane:

- **PostgreSQL (Neon) + Drizzle** for structured data and analytics.
- **Firebase Auth + Firestore** for identity, realtime profiles, and lightweight activity.
- **Firebase Storage** for media uploads.

## Core Services

- **Client (React/Vite)**: map, feed, battles, and check-ins.
- **API (Express)**: spot CRUD, check-ins, beta signup, analytics ingest, admin metrics.
- **Analytics**: server-side ingest with strict schema validation and idempotent inserts.
- **Realtime**: Firebase Auth + Firestore for presence and lightweight profiles.

## Data Flow

1. **Auth**: Firebase ID token → API validates → server derives UID.
2. **Write**: client sends write payload → Zod validation → abuse controls → DB write.
3. **Read**: client fetches feed/spots → filtered DB query → JSON response.
4. **Media**: upload via Firebase Storage → URL stored in Postgres/Firestore.

## Guardrails

- **Input boundaries**: Zod validation at every API boundary.
- **Abuse controls**: rate limits + write quotas + IP/user ban list.
- **Secrets**: no secrets committed; scanning in CI.

## Source of Truth

- **Spots/Check-ins/Tricks**: PostgreSQL (`shared/schema.ts`).
- **User identity**: Firebase Auth UID plus `custom_users` in Postgres for app metadata.
- **Media**: Firebase Storage with restricted rules.
