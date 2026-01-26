import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengerId: varchar("challenger_id", { length: 128 }).notNull(),
    opponentId: varchar("opponent_id", { length: 128 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    currentTurnUid: varchar("current_turn_uid", { length: 128 }),
    challengerLetters: varchar("challenger_letters", { length: 5 }).default(""),
    opponentLetters: varchar("opponent_letters", { length: 5 }).default(""),
    winnerId: varchar("winner_id", { length: 128 }),
    forfeitReason: varchar("forfeit_reason", { length: 50 }),
    currentTurnDeadline: timestamp("current_turn_deadline"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    challengerIdx: index("games_challenger_idx").on(table.challengerId),
    opponentIdx: index("games_opponent_idx").on(table.opponentId),
    statusIdx: index("games_status_idx").on(table.status),
    deadlineIdx: index("games_deadline_idx").on(table.currentTurnDeadline),
  })
);

export const gameTurns = pgTable(
  "game_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    uid: varchar("uid", { length: 128 }).notNull(),
    turnNumber: integer("turn_number").notNull(),
    turnType: varchar("turn_type", { length: 10 }).notNull(),
    videoUrl: text("video_url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    trickDescription: text("trick_description"),
    judgment: varchar("judgment", { length: 20 }),
    judgedAt: timestamp("judged_at"),
    judgedBy: varchar("judged_by", { length: 128 }),
    deadline: timestamp("deadline").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    gameIdx: index("game_turns_game_idx").on(table.gameId),
    uidIdx: index("game_turns_uid_idx").on(table.uid),
    deadlineIdx: index("game_turns_deadline_idx").on(table.deadline),
    uniqueTurn: uniqueIndex("game_turns_unique_number_idx").on(table.gameId, table.turnNumber),
  })
);

export const gamesRelations = relations(games, ({ many }) => ({
  turns: many(gameTurns),
}));

export const gameTurnsRelations = relations(gameTurns, ({ one }) => ({
  game: one(games, {
    fields: [gameTurns.gameId],
    references: [games.id],
  }),
}));
