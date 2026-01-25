import { getDb } from "../db";
import { games, gameTurns } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { logServerEvent } from "./analyticsService";
import logger from "../logger";
import { nanoid } from "nanoid";

/**
 * Battle Service
 *
 * Handles battle creation, joining, voting, and completion.
 * All "truth events" are logged server-side AFTER successful DB writes.
 *
 * Truth events logged:
 * - battle_created: When a new battle is created
 * - battle_joined: When opponent joins a battle
 * - battle_voted: When a vote is cast (CRITICAL for WAB/AU)
 * - battle_completed: When battle reaches final state
 */

// Types for battle operations
export interface CreateBattleInput {
  creatorId: string;
  matchmaking: "open" | "direct";
  opponentId?: string;
  stance?: "regular" | "goofy";
  skill?: string;
}

export interface VoteBattleInput {
  odv: string;
  battleId: string;
  vote: "clean" | "sketch" | "redo";
}

export interface CompleteBattleInput {
  battleId: string;
  winnerId?: string;
  totalRounds: number;
}

/**
 * Create a new battle (S.K.A.T.E. game)
 *
 * @example
 * ```ts
 * const battle = await createBattle({
 *   creatorId: uid,
 *   creatorName: "skater123",
 *   matchmaking: "open",
 * });
 * ```
 */
export async function createBattle(input: CreateBattleInput & { creatorName?: string }) {
  const db = getDb();

  const battleId = `battle-${nanoid(12)}`;

  const [battle] = await db
    .insert(games)
    .values({
      id: battleId,
      player1Id: input.creatorId,
      player1Name: input.creatorName || "Player 1",
      player2Id: input.opponentId || null,
      player2Name: null,
      status: input.opponentId ? "active" : "waiting",
      currentTurn: input.creatorId,
      player1Letters: "",
      player2Letters: "",
    })
    .returning();

  // Log truth event AFTER successful creation
  await logServerEvent(input.creatorId, "battle_created", {
    battle_id: battleId,
    matchmaking: input.matchmaking,
    opponent_id: input.opponentId,
    stance: input.stance,
    skill: input.skill,
  });

  logger.info("[Battle] Created", {
    battleId,
    creatorId: input.creatorId,
  });

  return { battleId, battle };
}

/**
 * Join an existing battle
 */
export async function joinBattle(odv: string, battleId: string, playerName?: string) {
  const db = getDb();

  // Check if battle exists and is waiting for opponent
  const [existingBattle] = await db.select().from(games).where(eq(games.id, battleId));

  if (!existingBattle) {
    throw new Error("Battle not found");
  }

  if (existingBattle.status !== "waiting") {
    throw new Error("Battle is not available to join");
  }

  if (existingBattle.player2Id) {
    throw new Error("Battle already has an opponent");
  }

  // Update battle with opponent
  const [updatedBattle] = await db
    .update(games)
    .set({
      player2Id: odv,
      player2Name: playerName || "Player 2",
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(games.id, battleId))
    .returning();

  // Log truth event AFTER successful join
  await logServerEvent(odv, "battle_joined", {
    battle_id: battleId,
  });

  logger.info("[Battle] Joined", { battleId, odv });

  return { success: true, battle: updatedBattle };
}

/**
 * Cast a vote on a battle response
 *
 * CRITICAL: This is the most important truth event for WAB/AU metric.
 * Only log after vote is successfully recorded in DB.
 */
export async function voteBattle(
  input: VoteBattleInput & { turnId?: number; trickDescription?: string }
) {
  const db = getDb();
  const { odv, battleId, vote, turnId, trickDescription } = input;

  // Verify battle exists and is active
  const [battle] = await db.select().from(games).where(eq(games.id, battleId));

  if (!battle) {
    throw new Error("Battle not found");
  }

  if (battle.status !== "active") {
    throw new Error("Battle is not active");
  }

  // Record the vote as a game turn with the result
  const [turn] = await db
    .insert(gameTurns)
    .values({
      gameId: battleId,
      playerId: odv,
      playerName: battle.player1Id === odv ? battle.player1Name : battle.player2Name || "Player 2",
      turnNumber: turnId || 1,
      trickDescription: trickDescription || "Vote cast",
      result: vote === "clean" ? "landed" : vote === "sketch" ? "missed" : "challenged",
    })
    .returning();

  // Log truth event AFTER successful vote (CRITICAL - never log before DB write)
  await logServerEvent(odv, "battle_voted", {
    battle_id: battleId,
    vote,
    turn_id: turn.id,
  });

  logger.info("[Battle] Voted", { battleId, odv, vote, turnId: turn.id });

  return { success: true, turn };
}

/**
 * Complete a battle (determine winner)
 */
export async function completeBattle(input: CompleteBattleInput) {
  const db = getDb();
  const { battleId, winnerId, totalRounds } = input;

  // Verify battle exists
  const [existingBattle] = await db.select().from(games).where(eq(games.id, battleId));

  if (!existingBattle) {
    throw new Error("Battle not found");
  }

  // Update battle to completed
  const [battle] = await db
    .update(games)
    .set({
      status: "completed",
      winnerId: winnerId || null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(games.id, battleId))
    .returning();

  // Log truth event AFTER successful completion
  // Log for both participants
  const participants = [existingBattle.player1Id, existingBattle.player2Id].filter(Boolean);
  for (const participant of participants) {
    if (participant) {
      await logServerEvent(participant, "battle_completed", {
        battle_id: battleId,
        winner_id: winnerId,
        total_rounds: totalRounds,
        is_winner: participant === winnerId,
      });
    }
  }

  logger.info("[Battle] Completed", { battleId, winnerId, totalRounds });

  return { success: true, battle };
}

/**
 * Upload a battle response (trick clip)
 */
export async function uploadBattleResponse(
  odv: string,
  battleId: string,
  clipUrl: string,
  trickDescription: string
) {
  const db = getDb();

  // Verify battle exists and is active
  const [battle] = await db.select().from(games).where(eq(games.id, battleId));

  if (!battle) {
    throw new Error("Battle not found");
  }

  if (battle.status !== "active") {
    throw new Error("Battle is not active");
  }

  // Verify player is in this battle
  if (battle.player1Id !== odv && battle.player2Id !== odv) {
    throw new Error("Player is not in this battle");
  }

  // Count existing turns to determine turn number
  const existingTurns = await db.select().from(gameTurns).where(eq(gameTurns.gameId, battleId));

  const turnNumber = existingTurns.length + 1;

  // Record the trick submission as a game turn
  const [turn] = await db
    .insert(gameTurns)
    .values({
      gameId: battleId,
      playerId: odv,
      playerName: battle.player1Id === odv ? battle.player1Name : battle.player2Name || "Player 2",
      turnNumber,
      trickDescription,
      result: "landed", // Initial state - waiting for opponent's response
    })
    .returning();

  // Update battle with last trick info
  await db
    .update(games)
    .set({
      lastTrickDescription: trickDescription,
      lastTrickBy: odv,
      updatedAt: new Date(),
    })
    .where(eq(games.id, battleId));

  // Log truth event AFTER successful upload
  await logServerEvent(odv, "battle_response_uploaded", {
    battle_id: battleId,
    clip_url: clipUrl,
    trick_description: trickDescription,
    turn_number: turnNumber,
  });

  logger.info("[Battle] Response uploaded", { battleId, odv, turnNumber });

  return { success: true, turn };
}

/**
 * Get battle by ID with all turns
 */
export async function getBattle(battleId: string) {
  const db = getDb();

  const [battle] = await db.select().from(games).where(eq(games.id, battleId));

  if (!battle) {
    return null;
  }

  const turns = await db.select().from(gameTurns).where(eq(gameTurns.gameId, battleId));

  return { ...battle, turns };
}

/**
 * Get all open battles waiting for opponents
 */
export async function getOpenBattles() {
  const db = getDb();

  const openBattles = await db.select().from(games).where(eq(games.status, "waiting"));

  return openBattles;
}

/**
 * Get battles for a specific player
 */
export async function getPlayerBattles(odv: string, status?: "waiting" | "active" | "completed") {
  const db = getDb();

  let query = db.select().from(games);

  if (status) {
    query = query.where(
      and(
        eq(games.status, status)
        // Player is either player1 or player2
        // Note: This is simplified - in production, use sql`OR` for proper filtering
      )
    ) as typeof query;
  }

  const battles = await query;

  // Filter to only include battles where the player is a participant
  return battles.filter((battle) => battle.player1Id === odv || battle.player2Id === odv);
}
