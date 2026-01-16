/**
 * S.K.A.T.E. Game Event Handlers
 *
 * Real-time WebSocket handlers for multiplayer S.K.A.T.E. games.
 */

import type { Server, Socket } from "socket.io";
import logger from "../../logger";
import { joinRoom, leaveRoom, broadcastToRoom } from "../rooms";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  GameCreatedPayload,
  GameJoinedPayload,
  GameTrickPayload,
  GameTurnPayload,
} from "../types";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

// In-memory game state (move to Redis for production scaling)
interface GameState {
  id: string;
  spotId: string;
  creatorId: string;
  players: string[];
  maxPlayers: number;
  currentTurn: number;
  currentAction: "set" | "attempt";
  letters: Map<string, string>;
  status: "waiting" | "active" | "completed";
  createdAt: Date;
}

const games = new Map<string, GameState>();

/**
 * Generate game ID
 */
function generateGameId(): string {
  return `game-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Get next letter in S.K.A.T.E.
 */
function getNextLetter(currentLetters: string): string {
  const SKATE = "SKATE";
  const nextIndex = currentLetters.length;
  return nextIndex < SKATE.length ? currentLetters + SKATE[nextIndex] : currentLetters;
}

/**
 * Check if player is eliminated
 */
function isEliminated(letters: string): boolean {
  return letters === "SKATE";
}

/**
 * Register game event handlers on a socket
 */
export function registerGameHandlers(io: TypedServer, socket: TypedSocket): void {
  const data = socket.data as SocketData;

  /**
   * Create a new S.K.A.T.E. game
   */
  socket.on("game:create", async (spotId: string, maxPlayers: number = 4) => {
    try {
      const gameId = generateGameId();

      const gameState: GameState = {
        id: gameId,
        spotId,
        creatorId: data.odv,
        players: [data.odv],
        maxPlayers: Math.min(maxPlayers, 8),
        currentTurn: 0,
        currentAction: "set",
        letters: new Map([[data.odv, ""]]),
        status: "waiting",
        createdAt: new Date(),
      };

      games.set(gameId, gameState);

      // Join game room
      await joinRoom(socket, "game", gameId);

      const payload: GameCreatedPayload = {
        gameId,
        spotId,
        creatorId: data.odv,
        maxPlayers: gameState.maxPlayers,
        createdAt: gameState.createdAt.toISOString(),
      };

      socket.emit("game:created", payload);

      logger.info("[Game] Created", { gameId, creatorId: data.odv, spotId });
    } catch (error) {
      logger.error("[Game] Create failed", { error, odv: data.odv });
      socket.emit("error", {
        code: "game_create_failed",
        message: "Failed to create game",
      });
    }
  });

  /**
   * Join an existing game
   */
  socket.on("game:join", async (gameId: string) => {
    try {
      const game = games.get(gameId);

      if (!game) {
        socket.emit("error", {
          code: "game_not_found",
          message: "Game not found",
        });
        return;
      }

      if (game.status !== "waiting") {
        socket.emit("error", {
          code: "game_already_started",
          message: "Game has already started",
        });
        return;
      }

      if (game.players.length >= game.maxPlayers) {
        socket.emit("error", {
          code: "game_full",
          message: "Game is full",
        });
        return;
      }

      if (game.players.includes(data.odv)) {
        socket.emit("error", {
          code: "already_in_game",
          message: "You are already in this game",
        });
        return;
      }

      // Add player
      game.players.push(data.odv);
      game.letters.set(data.odv, "");

      // Join room
      await joinRoom(socket, "game", gameId);

      const payload: GameJoinedPayload = {
        gameId,
        odv: data.odv,
        playerCount: game.players.length,
      };

      // Broadcast to all players
      broadcastToRoom(io, "game", gameId, "game:joined", payload);

      // If enough players, start the game
      if (game.players.length >= 2) {
        game.status = "active";

        const turnPayload: GameTurnPayload = {
          gameId,
          currentPlayer: game.players[0],
          action: "set",
        };

        broadcastToRoom(io, "game", gameId, "game:turn", turnPayload);
      }

      logger.info("[Game] Player joined", {
        gameId,
        odv: data.odv,
        playerCount: game.players.length,
      });
    } catch (error) {
      logger.error("[Game] Join failed", { error, gameId, odv: data.odv });
      socket.emit("error", {
        code: "game_join_failed",
        message: "Failed to join game",
      });
    }
  });

  /**
   * Submit a trick
   */
  socket.on(
    "game:trick",
    async (input: { gameId: string; odv: string; trickName: string; clipUrl?: string }) => {
      try {
        const game = games.get(input.gameId);

        if (!game || game.status !== "active") {
          socket.emit("error", {
            code: "invalid_game_state",
            message: "Game is not active",
          });
          return;
        }

        const currentPlayer = game.players[game.currentTurn];

        if (currentPlayer !== data.odv) {
          socket.emit("error", {
            code: "not_your_turn",
            message: "It's not your turn",
          });
          return;
        }

        const trickPayload: GameTrickPayload = {
          gameId: input.gameId,
          odv: data.odv,
          trickName: input.trickName,
          clipUrl: input.clipUrl,
          sentAt: new Date().toISOString(),
        };

        // Broadcast trick to all players
        broadcastToRoom(io, "game", input.gameId, "game:trick", trickPayload);

        // Move to next phase/player
        const originalSetter = game.players[game.currentTurn];
        if (game.currentAction === "set") {
          // Setter landed, now others attempt
          game.currentAction = "attempt";
          game.currentTurn = (game.currentTurn + 1) % game.players.length;

          // Skip the setter
          if (game.players[game.currentTurn] === originalSetter) {
            game.currentTurn = (game.currentTurn + 1) % game.players.length;
          }
        } else {
          // Attempt succeeded, move to next player
          game.currentTurn = (game.currentTurn + 1) % game.players.length;

          // Check if round complete (back to setter)
          if (game.currentAction === "attempt") {
            // After all attempts, new setter
            game.currentAction = "set";
          }
        }

        // Check for eliminated players
        const activePlayers = game.players.filter((p) => !isEliminated(game.letters.get(p) || ""));

        if (activePlayers.length === 1) {
          // Game over!
          game.status = "completed";

          broadcastToRoom(io, "game", input.gameId, "game:ended", {
            gameId: input.gameId,
            winnerId: activePlayers[0],
            finalStandings: game.players.map((p) => ({
              odv: p,
              letters: game.letters.get(p) || "",
            })),
          });
        } else {
          // Next turn
          const turnPayload: GameTurnPayload = {
            gameId: input.gameId,
            currentPlayer: game.players[game.currentTurn],
            action: game.currentAction,
          };

          broadcastToRoom(io, "game", input.gameId, "game:turn", turnPayload);
        }

        logger.info("[Game] Trick submitted", {
          gameId: input.gameId,
          odv: data.odv,
          trick: input.trickName,
        });
      } catch (error) {
        logger.error("[Game] Trick failed", { error, input, odv: data.odv });
        socket.emit("error", {
          code: "trick_failed",
          message: "Failed to submit trick",
        });
      }
    }
  );

  /**
   * Pass on a trick (gets a letter)
   */
  socket.on("game:pass", async (gameId: string) => {
    try {
      const game = games.get(gameId);

      if (!game || game.status !== "active") {
        socket.emit("error", {
          code: "invalid_game_state",
          message: "Game is not active",
        });
        return;
      }

      if (game.currentAction !== "attempt") {
        socket.emit("error", {
          code: "cannot_pass",
          message: "You can only pass during attempt phase",
        });
        return;
      }

      const currentPlayer = game.players[game.currentTurn];

      if (currentPlayer !== data.odv) {
        socket.emit("error", {
          code: "not_your_turn",
          message: "It's not your turn",
        });
        return;
      }

      // Add letter
      const currentLetters = game.letters.get(data.odv) || "";
      const newLetters = getNextLetter(currentLetters);
      game.letters.set(data.odv, newLetters);

      // Broadcast letter gained
      broadcastToRoom(io, "game", gameId, "game:letter", {
        gameId,
        odv: data.odv,
        letters: newLetters,
      });

      // Move to next player
      game.currentTurn = (game.currentTurn + 1) % game.players.length;

      // Check if eliminated
      const activePlayers = game.players.filter((p) => !isEliminated(game.letters.get(p) || ""));

      if (activePlayers.length === 1) {
        game.status = "completed";

        broadcastToRoom(io, "game", gameId, "game:ended", {
          gameId,
          winnerId: activePlayers[0],
          finalStandings: game.players.map((p) => ({
            odv: p,
            letters: game.letters.get(p) || "",
          })),
        });
      } else {
        // Next turn (new setter after all attempts)
        if (game.currentTurn === 0) {
          game.currentAction = "set";
        }

        broadcastToRoom(io, "game", gameId, "game:turn", {
          gameId,
          currentPlayer: game.players[game.currentTurn],
          action: game.currentAction,
        });
      }

      logger.info("[Game] Player passed", {
        gameId,
        odv: data.odv,
        letters: newLetters,
      });
    } catch (error) {
      logger.error("[Game] Pass failed", { error, gameId, odv: data.odv });
      socket.emit("error", {
        code: "pass_failed",
        message: "Failed to pass",
      });
    }
  });
}

/**
 * Clean up game subscriptions on disconnect
 */
export async function cleanupGameSubscriptions(socket: TypedSocket): Promise<void> {
  const data = socket.data as SocketData;

  for (const roomId of data.rooms) {
    if (roomId.startsWith("game:")) {
      const gameId = roomId.replace("game:", "");
      await leaveRoom(socket, "game", gameId);

      // TODO: Handle player disconnect in active game
      // - Pause game
      // - Set timeout for reconnection
      // - Forfeit if no reconnection
    }
  }
}
