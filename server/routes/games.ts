import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { desc, eq, or } from "drizzle-orm";
import { games, gameTurns } from "@shared/schema";
import { getDb, isDatabaseAvailable, type Database } from "../db";
import { validateBody } from "../middleware/validation";
import { requireFirebaseUid, type FirebaseAuthedRequest } from "../middleware/firebaseUid";

const router = Router();

const TURN_WINDOW_MS = 24 * 60 * 60 * 1000;
const SKATE = "SKATE";

type CreateGamePayload = {
  opponentId: string;
};

type RespondPayload = {
  accept: boolean;
};

type SubmitTurnPayload = {
  videoUrl: string;
  thumbnailUrl?: string;
  trickDescription?: string;
};

type JudgeTurnPayload = {
  judgment: "made" | "missed";
};

type GameUpdate = Partial<
  Pick<
    typeof games.$inferInsert,
    | "status"
    | "updatedAt"
    | "currentTurnUid"
    | "currentTurnDeadline"
    | "challengerLetters"
    | "opponentLetters"
    | "winnerId"
    | "completedAt"
    | "forfeitReason"
  >
>;

const createGameSchema = z.object({
  opponentId: z.string().min(1),
});

const respondSchema = z.object({
  accept: z.boolean(),
});

const submitTurnSchema = z.object({
  videoUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  trickDescription: z.string().max(500).optional(),
});

const judgeTurnSchema = z.object({
  judgment: z.enum(["made", "missed"]),
});

const getDatabase = (res: Response): Database | null => {
  if (!isDatabaseAvailable()) {
    res.status(503).json({
      error: "database_unavailable",
      message: "Database unavailable. Please try again shortly.",
    });
    return null;
  }
  return getDb();
};

const addLetter = (letters: string | null | undefined): string => {
  const current = letters ?? "";
  if (current.length >= SKATE.length) {
    return current;
  }
  return current + SKATE[current.length];
};

const buildDeadline = () => new Date(Date.now() + TURN_WINDOW_MS);

const forfeitGame = async (
  db: Database,
  gameId: string,
  winnerId: string,
  reason: string
): Promise<void> => {
  await db
    .update(games)
    .set({
      status: "forfeited",
      forfeitReason: reason,
      winnerId,
      completedAt: new Date(),
      currentTurnUid: null,
      currentTurnDeadline: null,
      updatedAt: new Date(),
    })
    .where(eq(games.id, gameId));
};

const maybeForfeitExpired = async (
  db: Database,
  game: typeof games.$inferSelect
): Promise<typeof games.$inferSelect> => {
  if (game.status !== "active" || !game.currentTurnDeadline || !game.currentTurnUid) {
    return game;
  }

  if (new Date() <= game.currentTurnDeadline) {
    return game;
  }

  const winnerId =
    game.currentTurnUid === game.challengerId ? game.opponentId : game.challengerId;

  await forfeitGame(db, game.id, winnerId, "timeout");

  const [updated] = await db.select().from(games).where(eq(games.id, game.id)).limit(1);
  return updated ?? game;
};

router.post(
  "/create",
  requireFirebaseUid,
  validateBody(createGameSchema),
  async (req, res) => {
    const db = getDatabase(res);
    if (!db) {
      return;
    }

    const { opponentId } = (req as Request & { validatedBody: CreateGamePayload }).validatedBody;
    const challengerId = (req as FirebaseAuthedRequest).firebaseUid;

    if (challengerId === opponentId) {
      return res.status(400).json({ error: "Cannot challenge yourself" });
    }

    try {
      const [game] = await db
        .insert(games)
        .values({
          challengerId,
          opponentId,
          status: "pending",
        })
        .returning();

      return res.json({ game });
    } catch (error) {
      console.error("Error creating game:", error);
      return res.status(500).json({ error: "Failed to create game" });
    }
  }
);

router.post(
  "/:gameId/respond",
  requireFirebaseUid,
  validateBody(respondSchema),
  async (req, res) => {
    const db = getDatabase(res);
    if (!db) {
      return;
    }

    const { gameId } = req.params;
    const { accept } = (req as Request & { validatedBody: RespondPayload }).validatedBody;
    const uid = (req as FirebaseAuthedRequest).firebaseUid;

    try {
      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);

      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      if (game.opponentId !== uid) {
        return res.status(403).json({ error: "Only the opponent can respond" });
      }

      if (game.status !== "pending") {
        return res.status(400).json({ error: "Game already responded to" });
      }

      if (!accept) {
        await forfeitGame(db, game.id, game.challengerId, "declined");
        const [updated] = await db.select().from(games).where(eq(games.id, game.id)).limit(1);
        return res.json({ game: updated });
      }

      const [updatedGame] = await db
        .update(games)
        .set({
          status: "active",
          currentTurnUid: game.challengerId,
          currentTurnDeadline: buildDeadline(),
          updatedAt: new Date(),
        })
        .where(eq(games.id, gameId))
        .returning();

      return res.json({ game: updatedGame });
    } catch (error) {
      console.error("Error responding to game:", error);
      return res.status(500).json({ error: "Failed to respond to game" });
    }
  }
);

router.post(
  "/:gameId/turns",
  requireFirebaseUid,
  validateBody(submitTurnSchema),
  async (req, res) => {
    const db = getDatabase(res);
    if (!db) {
      return;
    }

    const { gameId } = req.params;
    const { videoUrl, thumbnailUrl, trickDescription } = (req as Request & {
      validatedBody: SubmitTurnPayload;
    }).validatedBody;
    const uid = (req as FirebaseAuthedRequest).firebaseUid;

    try {
      const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);

      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const currentGame = await maybeForfeitExpired(db, game);
      if (currentGame.status !== "active") {
        return res.status(400).json({ error: "Game is not active" });
      }

      if (currentGame.currentTurnUid !== uid) {
        return res.status(403).json({ error: "Not your turn" });
      }

      const [lastTurn] = await db
        .select()
        .from(gameTurns)
        .where(eq(gameTurns.gameId, gameId))
        .orderBy(desc(gameTurns.turnNumber))
        .limit(1);

      const turnNumber = lastTurn ? lastTurn.turnNumber + 1 : 1;
      const turnType = !lastTurn || lastTurn.turnType === "match" ? "set" : "match";

      const [turn] = await db
        .insert(gameTurns)
        .values({
          gameId,
          uid,
          turnNumber,
          turnType,
          videoUrl,
          thumbnailUrl,
          trickDescription,
          deadline: buildDeadline(),
        })
        .returning();

      const opponentId = uid === currentGame.challengerId ? currentGame.opponentId : currentGame.challengerId;

      await db
        .update(games)
        .set({
          currentTurnUid: opponentId,
          currentTurnDeadline: buildDeadline(),
          updatedAt: new Date(),
        })
        .where(eq(games.id, gameId));

      return res.json({ turn });
    } catch (error) {
      console.error("Error submitting turn:", error);
      return res.status(500).json({ error: "Failed to submit turn" });
    }
  }
);

router.post(
  "/turns/:turnId/judge",
  requireFirebaseUid,
  validateBody(judgeTurnSchema),
  async (req, res) => {
    const db = getDatabase(res);
    if (!db) {
      return;
    }

    const { turnId } = req.params;
    const { judgment } = (req as Request & { validatedBody: JudgeTurnPayload }).validatedBody;
    const uid = (req as FirebaseAuthedRequest).firebaseUid;

    try {
      const [turn] = await db.select().from(gameTurns).where(eq(gameTurns.id, turnId)).limit(1);

      if (!turn) {
        return res.status(404).json({ error: "Turn not found" });
      }

      if (turn.judgment) {
        return res.status(400).json({ error: "Turn already judged" });
      }

      const [game] = await db.select().from(games).where(eq(games.id, turn.gameId)).limit(1);

      if (!game) {
        return res.status(404).json({ error: "Game not found" });
      }

      const currentGame = await maybeForfeitExpired(db, game);
      if (currentGame.status !== "active") {
        return res.status(400).json({ error: "Game is not active" });
      }

      if (new Date() > turn.deadline) {
        const winnerId = turn.uid;
        await forfeitGame(db, currentGame.id, winnerId, "timeout");
        return res.status(400).json({ error: "Judgment deadline expired" });
      }

      const opponentId = turn.uid === currentGame.challengerId ? currentGame.opponentId : currentGame.challengerId;
      if (uid !== opponentId) {
        return res.status(403).json({ error: "Only the opponent can judge this turn" });
      }

      await db
        .update(gameTurns)
        .set({
          judgment,
          judgedAt: new Date(),
          judgedBy: uid,
        })
        .where(eq(gameTurns.id, turnId));

      const updates: GameUpdate = {
        updatedAt: new Date(),
      };

      if (turn.turnType === "match" && judgment === "missed") {
        if (turn.uid === currentGame.challengerId) {
          updates.challengerLetters = addLetter(currentGame.challengerLetters);
        } else {
          updates.opponentLetters = addLetter(currentGame.opponentLetters);
        }
      }

      const challengerLetters = updates.challengerLetters ?? currentGame.challengerLetters;
      const opponentLetters = updates.opponentLetters ?? currentGame.opponentLetters;
      const challengerOut = challengerLetters.length >= SKATE.length;
      const opponentOut = opponentLetters.length >= SKATE.length;

      if (challengerOut || opponentOut) {
        updates.status = "completed";
        updates.winnerId = challengerOut ? currentGame.opponentId : currentGame.challengerId;
        updates.completedAt = new Date();
        updates.currentTurnUid = null;
        updates.currentTurnDeadline = null;
      } else {
        const nextTurnUid =
          turn.turnType === "match" && judgment === "made" ? turn.uid : opponentId;
        updates.currentTurnUid = nextTurnUid;
        updates.currentTurnDeadline = buildDeadline();
      }

      const [updatedGame] = await db
        .update(games)
        .set(updates)
        .where(eq(games.id, currentGame.id))
        .returning();

      return res.json({ game: updatedGame });
    } catch (error) {
      console.error("Error judging turn:", error);
      return res.status(500).json({ error: "Failed to judge turn" });
    }
  }
);

router.get("/my-games", requireFirebaseUid, async (req, res) => {
  const db = getDatabase(res);
  if (!db) {
    return;
  }

  const uid = (req as FirebaseAuthedRequest).firebaseUid;

  try {
    const myGames = await db
      .select()
      .from(games)
      .where(or(eq(games.challengerId, uid), eq(games.opponentId, uid)))
      .orderBy(desc(games.updatedAt));

    return res.json({ games: myGames });
  } catch (error) {
    console.error("Error fetching games:", error);
    return res.status(500).json({ error: "Failed to fetch games" });
  }
});

router.get("/:gameId", requireFirebaseUid, async (req, res) => {
  const db = getDatabase(res);
  if (!db) {
    return;
  }

  const { gameId } = req.params;

  try {
    const [game] = await db.select().from(games).where(eq(games.id, gameId)).limit(1);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    const currentGame = await maybeForfeitExpired(db, game);

    const turns = await db
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.gameId, gameId))
      .orderBy(gameTurns.turnNumber);

    return res.json({ game: currentGame, turns });
  } catch (error) {
    console.error("Error fetching game:", error);
    return res.status(500).json({ error: "Failed to fetch game" });
  }
});

export { router as gamesRouter };
