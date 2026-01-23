# Backend Boundaries

This repo uses a hybrid backend. The rule is explicit:

Express (server) = authoritative writes
Functions = event-driven projections and automation

Table
Feature | Write Path | Read Path | Canonical Store | Notes
Profiles | REST /api/profile | Firestore | Postgres | Firestore is a projection
Check-ins | REST /api/checkins | REST/Firestore | Postgres | Nonce enforced, Firestore mirrors
Leaderboard | REST admin job | Firestore | Postgres/derived | Client read-only
Auth sessions | REST /api/auth | REST | Postgres | Firebase verifies identity

Rules of engagement

- Postgres is the only source of truth for uniqueness and identity.
- Firestore is read-optimized and treated as a projection.
- Cloud Functions may write to Firestore as a mirror, not as an authority.
