# Security

## Security Baseline

- **No secrets in repo**: secrets are kept in environment variables only.
- **CI secret scan**: Gitleaks runs on every PR/commit to block leaks.
- **Rules in repo**: `firestore.rules` and `storage.rules` are versioned and tested.
- **Input validation**: Zod validation on every API route boundary.

## Abuse Controls

- **Rate limits**: global API limits + public write throttling.
- **Write quotas**: per-identity write caps to prevent spam.
- **Bans**: env-controlled ban list for IPs and user IDs.

## Auth & Identity

- **Firebase Auth** for identity.
- **Server derives UID** from verified Firebase tokens—never trust client UID.

## Data Handling

- **PII minimization**: only required fields are stored.
- **Log redaction**: sensitive fields are masked in logs.

## Secrets Policy

- `.env.example` documents required configuration.
- **Never** commit `.env` or any secret material.
