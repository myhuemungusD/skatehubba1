# Product MVP

## MVP Promise

SkateHubba ships a focused loop: **discover a spot → land a trick → check in → share**. Everything else is secondary.

## MVP Scope

- **Spot discovery + check-ins** (map + streaks).
- **Trick library + progression** (baseline mastery tracking).
- **Battle-ready clips** (upload + share URLs).
- **Analytics ingest** (event tracking for growth signals).

## Success Metrics (Investor-Ready)

- **Activation**: % of new users who check in within 24 hours.
- **Retention (D7)**: % returning users after 7 days.
- **Content loop**: average clips per active user per week.
- **Battle engagement**: votes per battle.

## Demo in 3 Minutes

1. **Install deps**: `pnpm install`
2. **Set `DATABASE_URL`** in `.env`.
3. **Seed demo data**: `pnpm tsx scripts/seed-demo.ts`
4. **Run API**: `pnpm start`
5. **Open the app** and view seeded spots.

## MVP Boundaries (No Bloat)

- No complex social graph until check-ins are sticky.
- No AR features until clip loop shows repeatable engagement.
- No marketplace until organic creator demand is proven.
