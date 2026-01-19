# 🛹 SkateHubba™

> The high-performance skateboarding platform: clips, battles, and real-world progression.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![CI](https://github.com/myhuemungusD/skatehubba1/actions/workflows/ci.yml/badge.svg)](https://github.com/myhuemungusD/skatehubba1/actions/workflows/ci.yml)

**Owner:** Jason Hamilton  
**Entity:** Design Mainline LLC  
**Trademark SN:** 99356919

---

## Investor Snapshot

SkateHubba turns skateboarding into a measurable, viral sport with **real-world proof of progression**. We own the **skate graph** (spots, tricks, battles, outcomes) and convert it into retention loops, rankings, and monetizable creator moments.

**Why now:** skate culture already lives on short video, but there’s no system of record for **who landed what, where, and when**. That’s the unlock.

**Moat:** the data flywheel (spots + check-ins + battles + judging) compounds into reputation and regional dominance.

---

## MVP (What Ships First)

- **Spot discovery + check-ins** for real-world progression.
- **Trick library + mastery** for measurable skill growth.
- **Battle-ready clips** with community validation.

See `docs/PRODUCT_MVP.md` for the precise MVP boundary and metrics.【F:docs/PRODUCT_MVP.md†L1-L28】

---

## Demo in 3 Minutes

1. `pnpm install`
2. Set `DATABASE_URL` in `.env` (see `.env.example`).
3. `pnpm tsx scripts/seed-demo.ts`
4. `pnpm start`

---

## Architecture & Data

- `docs/ARCHITECTURE.md` — system layout and data flow.【F:docs/ARCHITECTURE.md†L1-L29】
- `docs/DATA_MODEL.md` — Spot, CheckIn, Trick, User, Media schemas.【F:docs/DATA_MODEL.md†L1-L45】
- `docs/DEPLOYMENT.md` — deployment runbook.

---

## Security & Abuse Controls

- No secrets in repo; CI secret scan enforced.
- Firebase rules versioned and tested.
- Rate limits, write quotas, and ban list guards.

See `docs/SECURITY.md` for policy details.【F:docs/SECURITY.md†L1-L27】

---

## Roadmap Discipline

We run issues with three labels for speed and investor clarity:

- **MVP** (must ship)
- **v1** (post-MVP growth)
- **vNext** (long-horizon bets)

---

## Release Notes

All releases are summarized in `docs/CHANGELOG.md` (tagged on deploy).

---

## Local Development

### Prerequisites

- Node **20.11.1** (see `.nvmrc`)
- pnpm **10.0.0**

### Install & Run

```bash
pnpm install
pnpm dev
```

### CI Gate (required for merge)

```bash
pnpm -w run verify
```

---

## Repo Structure

- `client/` — web app (React/Vite)
- `server/` — API + services
- `shared/` — shared schemas and types
- `docs/` — architecture, security, MVP, deployment

---

## Contributing

See `CONTRIBUTING.md`. Contributions require tests and the verify gate.

## License

MIT (see `LICENSE`).
