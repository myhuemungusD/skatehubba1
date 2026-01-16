/**
 * Socket Health Monitor
 *
 * Enterprise-grade health monitoring for WebSocket connections.
 * Tracks connection quality, latency, and dead sockets.
 */

import type { Server, Socket } from "socket.io";
import logger from "../logger";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./types";

type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;

// Health metrics per socket
interface SocketHealth {
  lastPing: number;
  latency: number;
  missedPings: number;
  messageCount: number;
}

const socketHealth = new Map<string, SocketHealth>();

// Configuration
const HEALTH_CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
const MAX_MISSED_PINGS = 3;
const LATENCY_WARN_THRESHOLD_MS = 500;

/**
 * Initialize health monitoring for a socket
 */
export function initSocketHealth(socket: TypedSocket): void {
  socketHealth.set(socket.id, {
    lastPing: Date.now(),
    latency: 0,
    missedPings: 0,
    messageCount: 0,
  });
}

/**
 * Record message received from socket
 */
export function recordMessage(socketId: string): void {
  const health = socketHealth.get(socketId);
  if (health) {
    health.messageCount++;
    health.lastPing = Date.now();
    health.missedPings = 0;
  }
}

/**
 * Update latency measurement
 */
export function updateLatency(socketId: string, latencyMs: number): void {
  const health = socketHealth.get(socketId);
  if (health) {
    health.latency = latencyMs;
    health.lastPing = Date.now();
    health.missedPings = 0;

    if (latencyMs > LATENCY_WARN_THRESHOLD_MS) {
      logger.warn("[Socket] High latency detected", { socketId, latencyMs });
    }
  }
}

/**
 * Clean up health tracking for disconnected socket
 */
export function cleanupSocketHealth(socketId: string): void {
  socketHealth.delete(socketId);
}

/**
 * Get health stats for monitoring dashboard
 */
export function getHealthStats(): {
  totalSockets: number;
  avgLatency: number;
  highLatencyCount: number;
  staleConnections: number;
} {
  const now = Date.now();
  let totalLatency = 0;
  let highLatencyCount = 0;
  let staleConnections = 0;

  for (const health of socketHealth.values()) {
    totalLatency += health.latency;
    if (health.latency > LATENCY_WARN_THRESHOLD_MS) highLatencyCount++;
    if (now - health.lastPing > HEALTH_CHECK_INTERVAL_MS * 2) staleConnections++;
  }

  return {
    totalSockets: socketHealth.size,
    avgLatency: socketHealth.size > 0 ? Math.round(totalLatency / socketHealth.size) : 0,
    highLatencyCount,
    staleConnections,
  };
}

/**
 * Start health check loop
 * Disconnects sockets that fail health checks
 */
export function startHealthMonitor(io: TypedServer): NodeJS.Timeout {
  return setInterval(async () => {
    const now = Date.now();
    const sockets = await io.fetchSockets();

    for (const socket of sockets) {
      const health = socketHealth.get(socket.id);
      if (!health) continue;

      // Check for stale connection
      if (now - health.lastPing > HEALTH_CHECK_INTERVAL_MS) {
        health.missedPings++;

        if (health.missedPings >= MAX_MISSED_PINGS) {
          const data = socket.data as SocketData;
          logger.warn("[Socket] Disconnecting stale socket", {
            socketId: socket.id,
            odv: data?.odv,
            missedPings: health.missedPings,
            lastPing: new Date(health.lastPing).toISOString(),
          });
          socket.disconnect(true);
        }
      }
    }

    // Log health summary periodically
    const stats = getHealthStats();
    if (stats.totalSockets > 0) {
      logger.debug("[Socket] Health check complete", stats);
    }
  }, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stop health monitor
 */
export function stopHealthMonitor(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
}
