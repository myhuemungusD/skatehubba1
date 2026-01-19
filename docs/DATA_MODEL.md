# Data Model

## Spot (Postgres: `spots`)

- `id`: serial primary key
- `name`: string
- `description`: text (optional)
- `spotType`: enum (`rail`, `ledge`, `stairs`, `gap`, `bank`, `manual-pad`, `flat`, `bowl`, `mini-ramp`, `vert`, `diy`, `park`, `street`, `other`)
- `tier`: enum (`bronze`, `silver`, `gold`, `legendary`)
- `lat`, `lng`: location coordinates
- `city`, `state`, `country`: location metadata
- `photoUrl`, `thumbnailUrl`: media links
- `createdBy`: user id (string)
- `verified`, `isActive`: moderation flags
- `checkInCount`, `rating`, `ratingCount`: engagement
- `createdAt`, `updatedAt`: timestamps

## CheckIn (Postgres: `check_ins`)

- `id`: serial primary key
- `userId`: string (Firebase UID or custom user ID)
- `spotId`: foreign key to `spots.id`
- `timestamp`: check-in time
- `isAr`: boolean (AR-enabled check-in)

## Trick (Postgres: `tricks`)

- `id`: serial primary key
- `name`: string
- `description`: text (optional)
- `createdBy`: user id (string)
- `likesCount`: integer
- `createdAt`, `updatedAt`: timestamps

## User (Postgres: `custom_users`)

- `id`: UUID
- `email`: unique
- `firstName`, `lastName`: optional
- `firebaseUid`: optional (linked Firebase identity)
- `isActive`, `isEmailVerified`: flags
- `createdAt`, `updatedAt`: timestamps

## Media (Firebase Storage)

- Path: `/users/{uid}/{mediaId}` or `/public/{mediaId}`
- Metadata:
  - `contentType`: image/video type
  - `sizeBytes`: file size
  - `spotId`: optional link to `spots.id`
  - `trickId`: optional link to `tricks.id`
  - `createdAt`: timestamp
