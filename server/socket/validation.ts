/**
 * Socket Event Validation
 *
 * Zod schemas for validating incoming socket events.
 * Prevents malformed data from reaching handlers.
 */

import { z } from "zod";

// ============================================================================
// Battle Event Schemas
// ============================================================================

export const battleCreateSchema = z.object({
  creatorId: z.string().min(1).max(100),
  matchmaking: z.enum(["open", "direct"]),
  opponentId: z.string().min(1).max(100).optional(),
});

export const battleVoteSchema = z.object({
  battleId: z.string().min(1).max(100),
  odv: z.string().min(1).max(100),
  vote: z.enum(["clean", "sketch", "redo"]),
});

// ============================================================================
// Game Event Schemas
// ============================================================================

export const gameCreateSchema = z.object({
  spotId: z.string().min(1).max(100),
  maxPlayers: z.number().int().min(2).max(8).optional(),
});

export const gameTrickSchema = z.object({
  gameId: z.string().min(1).max(100),
  odv: z.string().min(1).max(100),
  trickName: z.string().min(1).max(200),
  clipUrl: z.string().url().optional(),
});

// ============================================================================
// Room Event Schemas
// ============================================================================

export const roomJoinSchema = z.object({
  roomType: z.enum(["battle", "game", "spot", "global"]),
  roomId: z.string().min(1).max(100),
});

// ============================================================================
// Presence Event Schemas
// ============================================================================

export const presenceUpdateSchema = z.object({
  status: z.enum(["online", "away"]),
});

// ============================================================================
// Validation Helper
// ============================================================================

/**
 * Validate event data and return typed result
 */
export function validateEvent<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
  };
}

/**
 * Sanitize string input (prevent XSS in stored data)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .trim();
}
