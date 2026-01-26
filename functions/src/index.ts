/**
 * Firebase Cloud Functions
 *
 * Secure serverless functions for SkateHubba.
 * Handles role management, profile creation and other privileged operations.
 *
 * Security Features:
 * - App Check enforcement for abuse prevention
 * - Rate limiting via in-memory tracking
 * - RBAC with custom claims
 * - Comprehensive audit logging
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { createBounty } from "./bounties/createBounty";
import { submitClaim } from "./bounties/submitClaim";
import { castVote } from "./bounties/castVote";
import { payOutClaim } from "./bounties/payOutClaim";
import { expireBounties } from "./bounties/expireBounties";

// Initialize Firebase Admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Valid roles that can be assigned
const VALID_ROLES = ["admin", "moderator", "verified_pro"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

// ============================================================================
// Profile Creation Schema
// ============================================================================

const VALID_STANCES = ["regular", "goofy"] as const;
const VALID_EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced", "pro"] as const;

interface ProfileCreatePayload {
  username?: string;
  stance?: (typeof VALID_STANCES)[number] | null;
  experienceLevel?: (typeof VALID_EXPERIENCE_LEVELS)[number] | null;
  favoriteTricks?: string[];
  bio?: string | null;
  crewName?: string | null;
  avatarBase64?: string;
  skip?: boolean;
}

// ============================================================================
// Rate Limiting (In-Memory for single instance, use Redis for multi-instance)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT = {
  maxRequests: 10, // Max requests per window
  windowMs: 60 * 1000, // 1 minute window
};

/**
 * Check if a user has exceeded rate limit
 */
function checkRateLimit(uid: string): void {
  const now = Date.now();
  const entry = rateLimitStore.get(uid);

  if (!entry || now > entry.resetAt) {
    // First request or window expired - reset
    rateLimitStore.set(uid, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return;
  }

  if (entry.count >= RATE_LIMIT.maxRequests) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Too many requests. Please try again later."
    );
  }

  entry.count++;
}

/**
 * Verify App Check token if available (soft enforcement)
 * Set to hard enforcement in production by uncommenting the throw
 */
function verifyAppCheck(context: functions.https.CallableContext): void {
  if (!context.app) {
    console.warn("[Security] Request without App Check token from:", context.auth?.uid);
    // Uncomment for hard enforcement:
    // throw new functions.https.HttpsError('failed-precondition', 'App Check verification failed.');
  }
}

/**
 * Mask email for privacy (show first char + domain)
 * john.doe@gmail.com -> j***@gmail.com
 */
function maskEmail(email: string | undefined): string {
  if (!email) return "***";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0]}***@${domain}`;
}

interface ManageRolePayload {
  targetUid: string;
  role: ValidRole;
  action: "grant" | "revoke";
}

/**
 * manageUserRole
 *
 * Protected Callable Function for role management.
 * Only Admins can call this function to promote/demote users.
 *
 * Payload: {
 *   targetUid: string,
 *   role: 'admin' | 'moderator' | 'verified_pro',
 *   action: 'grant' | 'revoke'
 * }
 */
export const manageUserRole = functions.https.onCall(
  async (data: ManageRolePayload, context: functions.https.CallableContext) => {
    // 1. SECURITY: Authentication Gate
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to call this function."
      );
    }

    // 2. SECURITY: App Check verification
    verifyAppCheck(context);

    // 3. SECURITY: Rate limiting
    checkRateLimit(context.auth.uid);

    // 4. SECURITY: Authorization Gate (RBAC)
    // Check the caller's token for the 'admin' role
    const callerRoles = (context.auth.token.roles as string[]) || [];
    if (!callerRoles.includes("admin")) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Only Admins can manage user roles."
      );
    }

    // 5. VALIDATION: Input Sanitization
    const { targetUid, role, action } = data;

    if (!VALID_ROLES.includes(role as ValidRole)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Role must be one of: ${VALID_ROLES.join(", ")}`
      );
    }

    if (!targetUid || typeof targetUid !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Invalid Target User ID.");
    }

    if (action !== "grant" && action !== "revoke") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        'Action must be "grant" or "revoke".'
      );
    }

    // 6. SAFETY: Prevent self-demotion from admin
    if (targetUid === context.auth.uid && role === "admin" && action === "revoke") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "You cannot remove your own admin privileges."
      );
    }

    try {
      // 7. LOGIC: Fetch current claims
      const userRecord = await admin.auth().getUser(targetUid);
      const currentClaims = userRecord.customClaims || {};
      const currentRoles: string[] = (currentClaims.roles as string[]) || [];

      let newRoles = [...currentRoles];

      if (action === "grant") {
        // Add role if not present
        if (!newRoles.includes(role)) {
          newRoles.push(role);
        }
      } else {
        // Remove role
        newRoles = newRoles.filter((r) => r !== role);
      }

      // 6. EXECUTION: Write back to Auth System
      await admin.auth().setCustomUserClaims(targetUid, {
        ...currentClaims,
        roles: newRoles,
      });

      // 7. SYNC: Update Firestore for UI speed
      // This allows the frontend to show "Admin" badges without decoding the token
      // Use set with merge to create doc if it doesn't exist
      await admin.firestore().collection("users").doc(targetUid).set(
        {
          roles: newRoles,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // 8. AUDIT: Log the action
      await admin.firestore().collection("audit_logs").add({
        action: "role_change",
        targetUid,
        targetEmail: userRecord.email,
        role,
        changeType: action,
        performedBy: context.auth.uid,
        performedByEmail: context.auth.token.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`Role ${action}: ${role} for ${userRecord.email} by ${context.auth.token.email}`);

      return {
        success: true,
        message: `User ${userRecord.email} is now: [${newRoles.join(", ") || "no roles"}]`,
        roles: newRoles,
      };
    } catch (error: unknown) {
      console.error("Role Management Error:", error);

      const firebaseError = error as { code?: string };
      if (firebaseError.code === "auth/user-not-found") {
        throw new functions.https.HttpsError("not-found", "Target user not found.");
      }

      throw new functions.https.HttpsError("internal", "Failed to update user roles.");
    }
  }
);

/**
 * getUserRoles
 *
 * Get the roles for a specific user (admin only)
 * Returns masked email for privacy protection
 */
export const getUserRoles = functions.https.onCall(
  async (data: { targetUid: string }, context: functions.https.CallableContext) => {
    // Authentication
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    // App Check & Rate limiting
    verifyAppCheck(context);
    checkRateLimit(context.auth.uid);

    // Authorization
    const callerRoles = (context.auth.token.roles as string[]) || [];
    if (!callerRoles.includes("admin")) {
      throw new functions.https.HttpsError("permission-denied", "Only Admins can view user roles.");
    }

    // Validation
    const { targetUid } = data;
    if (!targetUid || typeof targetUid !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Target UID required.");
    }

    try {
      const userRecord = await admin.auth().getUser(targetUid);
      const roles = (userRecord.customClaims?.roles as string[]) || [];

      return {
        uid: targetUid,
        email: maskEmail(userRecord.email), // Privacy: mask email
        roles,
      };
    } catch (error: unknown) {
      throw new functions.https.HttpsError("not-found", "User not found.");
    }
  }
);

// ============================================================================
// Profile Creation (Deprecated - handled by REST API)
// ============================================================================

/**
 * createProfile
 *
 * @deprecated Profile creation is now handled by the REST API.
 * This callable function exists only to provide a helpful error message.
 */
export const createProfile = functions.https.onCall(
  async (_data: ProfileCreatePayload, _context: functions.https.CallableContext) => {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Profile creation is handled by the REST API. Use POST /api/profile/create."
    );
  }
);

// ============================================================================
// Video Validation (Storage Trigger) - Enterprise Grade
// ============================================================================

/**
 * Challenge video states for the state machine
 */
type VideoStatus =
  | "pending_upload"
  | "processing"
  | "ready"
  | "rejected";

/**
 * Validation configuration
 */
const VIDEO_VALIDATION_CONFIG = {
  MIN_DURATION_SECONDS: 5,
  MAX_DURATION_SECONDS: 15,
  DURATION_TOLERANCE_SECONDS: 0.5, // Allow 14.5-15.5s
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100MB
  ALLOWED_CONTENT_TYPES: ["video/mp4", "video/quicktime", "video/x-m4v"],
};

/**
 * Rejection reasons for failed validation
 */
type RejectionReason =
  | "duration_too_long"
  | "duration_too_short"
  | "file_too_large"
  | "invalid_format"
  | "file_corrupted"
  | "processing_failed";

interface VideoValidationResult {
  isValid: boolean;
  duration?: number;
  fileSize?: number;
  width?: number;
  height?: number;
  codec?: string;
  rejectionReason?: RejectionReason;
  rejectionMessage?: string;
}

/**
 * Extract video metadata using ffprobe
 */
async function getVideoMetadata(
  filePath: string
): Promise<{ duration: number; width?: number; height?: number; codec?: string }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(
      filePath,
      (err: Error | null, metadata: { format?: { duration?: number }; streams?: Array<{ codec_name?: string; width?: number; height?: number; codec_type?: string }> }) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata?.streams?.find((s) => s.codec_type === "video");
        resolve({
          duration: metadata?.format?.duration ?? 0,
          width: videoStream?.width,
          height: videoStream?.height,
          codec: videoStream?.codec_name,
        });
      }
    );
  });
}

/**
 * Update Firestore challenge document with validation result
 */
async function updateChallengeStatus(
  challengeId: string,
  userId: string,
  status: VideoStatus,
  metadata: Record<string, unknown>
): Promise<void> {
  const db = admin.firestore();

  // Use a transaction for atomicity
  await db.runTransaction(async (tx) => {
    const challengeRef = db.collection("challenges").doc(challengeId);
    const doc = await tx.get(challengeRef);

    if (!doc.exists) {
      console.warn(`[validateChallengeVideo] Challenge ${challengeId} not found`);
      return;
    }

    const clipFieldPath = `clips.${userId}`;

    tx.update(challengeRef, {
      [`${clipFieldPath}.status`]: status,
      [`${clipFieldPath}.validatedAt`]: admin.firestore.FieldValue.serverTimestamp(),
      ...Object.fromEntries(
        Object.entries(metadata).map(([key, value]) => [`${clipFieldPath}.${key}`, value])
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Log audit entry
    const auditRef = db.collection("audit_logs").doc();
    tx.set(auditRef, {
      action: "video_validation",
      challengeId,
      userId,
      status,
      metadata,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Parse storage path to extract challenge and user info
 * Expected format: challenges/{challengeId}/{userId}/{timestamp}.mp4
 * or: challenges/drafts/{userId}/{timestamp}.mp4
 */
function parseStoragePath(filePath: string): {
  challengeId: string | null;
  userId: string | null;
  isDraft: boolean;
} {
  const parts = filePath.split("/");

  // challenges/{challengeId}/{userId}/{filename}
  if (parts.length >= 4 && parts[0] === "challenges") {
    if (parts[1] === "drafts") {
      return { challengeId: null, userId: parts[2], isDraft: true };
    }
    return { challengeId: parts[1], userId: parts[2], isDraft: false };
  }

  return { challengeId: null, userId: null, isDraft: false };
}

/**
 * validateChallengeVideo
 *
 * Storage trigger that validates uploaded challenge videos.
 * Enforces duration (15s max), file size, and format.
 * Updates Firestore state machine and deletes invalid uploads.
 *
 * State Machine:
 * PENDING_UPLOAD -> PROCESSING -> READY | REJECTED
 */
export const validateChallengeVideo = functions
  .runWith({
    timeoutSeconds: 120,
    memory: "512MB",
  })
  .storage.object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    const fileSize = object.size ? parseInt(object.size, 10) : 0;
    const contentType = object.contentType;

    // Only process challenge videos
    if (!filePath || !filePath.startsWith("challenges/")) {
      return;
    }

    // Check content type
    if (!contentType || !contentType.startsWith("video/")) {
      console.log(`[validateChallengeVideo] Skipping non-video file: ${filePath}`);
      return;
    }

    // Parse path to get challenge and user info
    const { challengeId, userId, isDraft } = parseStoragePath(filePath);

    // Generate idempotency key from file metadata
    const idempotencyKey = `${filePath}_${object.generation}_${object.metageneration}`;
    const processedRef = admin.firestore().collection("processed_videos").doc(idempotencyKey);

    // Check if already processed (idempotency)
    const processedDoc = await processedRef.get();
    if (processedDoc.exists) {
      console.log(`[validateChallengeVideo] Already processed: ${filePath}`);
      return;
    }

    // Mark as processing
    await processedRef.set({
      filePath,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "processing",
    });

    const bucket = admin.storage().bucket(object.bucket);
    const file = bucket.file(filePath);
    const tempFilePath = path.join(
      os.tmpdir(),
      `validate_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`
    );

    let validationResult: VideoValidationResult = { isValid: false };

    try {
      console.log(`[validateChallengeVideo] Processing: ${filePath} (${fileSize} bytes)`);

      // Update status to processing if we have challenge context
      if (challengeId && userId && !isDraft) {
        await updateChallengeStatus(challengeId, userId, "processing", {});
      }

      // Validate file size first (before downloading)
      if (fileSize > VIDEO_VALIDATION_CONFIG.MAX_FILE_SIZE_BYTES) {
        validationResult = {
          isValid: false,
          fileSize,
          rejectionReason: "file_too_large",
          rejectionMessage: `File size ${Math.round(fileSize / (1024 * 1024))}MB exceeds maximum ${Math.round(VIDEO_VALIDATION_CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB`,
        };
      } else if (!VIDEO_VALIDATION_CONFIG.ALLOWED_CONTENT_TYPES.includes(contentType)) {
        validationResult = {
          isValid: false,
          fileSize,
          rejectionReason: "invalid_format",
          rejectionMessage: `Content type ${contentType} is not allowed`,
        };
      } else {
        // Download and analyze
        await file.download({ destination: tempFilePath });

        const metadata = await getVideoMetadata(tempFilePath);

        validationResult = {
          isValid: true,
          duration: metadata.duration,
          fileSize,
          width: metadata.width,
          height: metadata.height,
          codec: metadata.codec,
        };

        // Validate duration
        const minDuration = VIDEO_VALIDATION_CONFIG.MIN_DURATION_SECONDS;
        const maxDuration =
          VIDEO_VALIDATION_CONFIG.MAX_DURATION_SECONDS +
          VIDEO_VALIDATION_CONFIG.DURATION_TOLERANCE_SECONDS;

        if (metadata.duration < minDuration) {
          validationResult.isValid = false;
          validationResult.rejectionReason = "duration_too_short";
          validationResult.rejectionMessage = `Video duration ${metadata.duration.toFixed(1)}s is below minimum ${minDuration}s`;
        } else if (metadata.duration > maxDuration) {
          validationResult.isValid = false;
          validationResult.rejectionReason = "duration_too_long";
          validationResult.rejectionMessage = `Video duration ${metadata.duration.toFixed(1)}s exceeds maximum ${VIDEO_VALIDATION_CONFIG.MAX_DURATION_SECONDS}s`;
        }
      }

      // Handle validation result
      if (validationResult.isValid) {
        console.log(
          `[validateChallengeVideo] VALID: ${filePath} (${validationResult.duration?.toFixed(1)}s, ${validationResult.width}x${validationResult.height})`
        );

        // Update Firestore to READY state
        if (challengeId && userId && !isDraft) {
          await updateChallengeStatus(challengeId, userId, "ready", {
            duration: validationResult.duration,
            width: validationResult.width,
            height: validationResult.height,
            codec: validationResult.codec,
            fileSize: validationResult.fileSize,
          });
        }

        // Mark as processed successfully
        await processedRef.update({
          status: "completed",
          result: "valid",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          metadata: validationResult,
        });
      } else {
        console.warn(
          `[validateChallengeVideo] REJECTED: ${filePath} - ${validationResult.rejectionReason}: ${validationResult.rejectionMessage}`
        );

        // Update Firestore to REJECTED state
        if (challengeId && userId && !isDraft) {
          await updateChallengeStatus(challengeId, userId, "rejected", {
            rejectionReason: validationResult.rejectionReason,
            rejectionMessage: validationResult.rejectionMessage,
          });
        }

        // Delete the invalid file
        try {
          await file.delete();
          console.log(`[validateChallengeVideo] Deleted invalid file: ${filePath}`);
        } catch (deleteError) {
          console.error(`[validateChallengeVideo] Failed to delete invalid file: ${filePath}`, deleteError);
        }

        // Mark as processed with rejection
        await processedRef.update({
          status: "completed",
          result: "rejected",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
          rejectionReason: validationResult.rejectionReason,
          rejectionMessage: validationResult.rejectionMessage,
        });
      }
    } catch (error) {
      console.error(`[validateChallengeVideo] Processing failed: ${filePath}`, error);

      // Update Firestore to REJECTED state due to processing error
      if (challengeId && userId && !isDraft) {
        await updateChallengeStatus(challengeId, userId, "rejected", {
          rejectionReason: "processing_failed",
          rejectionMessage: "Video processing failed. Please try uploading again.",
        });
      }

      // Mark as failed
      await processedRef.update({
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Delete potentially corrupted file
      try {
        await file.delete();
      } catch {
        // Ignore deletion errors
      }
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

// ============================================================================
// Challenge Video Status Query
// ============================================================================

interface VideoStatusPayload {
  challengeId: string;
}

interface VideoStatusResponse {
  challengeId: string;
  status: string;
  clips: Record<string, {
    status: VideoStatus;
    duration?: number;
    validatedAt?: admin.firestore.Timestamp;
    rejectionReason?: string;
    rejectionMessage?: string;
  }>;
}

/**
 * getVideoValidationStatus
 *
 * Query the current validation status of challenge videos.
 * Useful for the mobile app to poll for status updates.
 */
export const getVideoValidationStatus = functions.https.onCall(
  async (data: VideoStatusPayload, context: functions.https.CallableContext): Promise<VideoStatusResponse> => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    // Validate input
    const { challengeId } = data;
    if (!challengeId || typeof challengeId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Challenge ID required.");
    }

    // Get challenge document
    const challengeDoc = await admin.firestore().collection("challenges").doc(challengeId).get();

    if (!challengeDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Challenge not found.");
    }

    const challengeData = challengeDoc.data();

    // Verify user is a participant
    const participants = challengeData?.participants || [];
    if (!participants.includes(context.auth.uid)) {
      throw new functions.https.HttpsError("permission-denied", "Not a participant in this challenge.");
    }

    return {
      challengeId,
      status: challengeData?.status || "unknown",
      clips: challengeData?.clips || {},
    };
  }
);

// ============================================================================
// Challenge Creation (Callable)
// ============================================================================

interface CreateChallengePayload {
  opponentUid: string;
  clipUrl: string;
  clipDurationSec: number;
  thumbnailUrl?: string;
}

interface CreateChallengeResponse {
  challengeId: string;
  status: string;
}

/**
 * createChallenge
 *
 * Creates a new S.K.A.T.E. challenge and initializes the state machine.
 * Validates opponent exists and sets up the challenge document.
 */
export const createChallenge = functions.https.onCall(
  async (data: CreateChallengePayload, context: functions.https.CallableContext): Promise<CreateChallengeResponse> => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    // App Check verification
    verifyAppCheck(context);

    // Rate limiting
    checkRateLimit(context.auth.uid);

    // Validate input
    const { opponentUid, clipUrl, clipDurationSec, thumbnailUrl } = data;

    if (!opponentUid || typeof opponentUid !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Opponent UID required.");
    }

    if (opponentUid === context.auth.uid) {
      throw new functions.https.HttpsError("invalid-argument", "Cannot challenge yourself.");
    }

    if (!clipUrl || typeof clipUrl !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Clip URL required.");
    }

    if (typeof clipDurationSec !== "number" || clipDurationSec < 5 || clipDurationSec > 16) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid clip duration.");
    }

    const db = admin.firestore();

    // Verify opponent exists
    const opponentDoc = await db.collection("users").doc(opponentUid).get();
    if (!opponentDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Opponent not found.");
    }

    // Create challenge document
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7); // 7 days to complete

    const challengeRef = db.collection("challenges").doc();
    const challengeData = {
      id: challengeRef.id,
      createdBy: context.auth.uid,
      opponent: opponentUid,
      participants: [context.auth.uid, opponentUid],
      status: "creator_ready", // Creator has uploaded their clip
      rules: {
        maxDuration: 15,
        oneTake: true,
      },
      clips: {
        [context.auth.uid]: {
          userId: context.auth.uid,
          videoUrl: clipUrl,
          thumbnailUrl: thumbnailUrl || null,
          duration: clipDurationSec,
          status: "pending_validation", // Will be updated by storage trigger
          uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      deadline: admin.firestore.Timestamp.fromDate(deadline),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await challengeRef.set(challengeData);

    // Log audit
    await db.collection("audit_logs").add({
      action: "challenge_created",
      challengeId: challengeRef.id,
      createdBy: context.auth.uid,
      opponent: opponentUid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
      `[createChallenge] Created challenge ${challengeRef.id} from ${context.auth.uid} to ${opponentUid}`
    );

    return {
      challengeId: challengeRef.id,
      status: "creator_ready",
    };
  }
);

// ============================================================================
// Accept Challenge (Opponent uploads their clip)
// ============================================================================

interface AcceptChallengePayload {
  challengeId: string;
  clipUrl: string;
  clipDurationSec: number;
  thumbnailUrl?: string;
}

/**
 * acceptChallenge
 *
 * Opponent accepts a challenge by uploading their clip.
 * Updates the challenge state machine.
 */
export const acceptChallenge = functions.https.onCall(
  async (data: AcceptChallengePayload, context: functions.https.CallableContext): Promise<{ success: boolean; status: string }> => {
    // Authentication required
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    // App Check verification
    verifyAppCheck(context);

    // Validate input
    const { challengeId, clipUrl, clipDurationSec, thumbnailUrl } = data;

    if (!challengeId || typeof challengeId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Challenge ID required.");
    }

    if (!clipUrl || typeof clipUrl !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Clip URL required.");
    }

    const db = admin.firestore();

    // Get and validate challenge
    const challengeRef = db.collection("challenges").doc(challengeId);
    const challengeDoc = await challengeRef.get();

    if (!challengeDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Challenge not found.");
    }

    const challengeData = challengeDoc.data()!;

    // Verify user is the opponent
    if (challengeData.opponent !== context.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "Only the challenged opponent can accept.");
    }

    // Verify challenge is in correct state
    if (challengeData.status !== "creator_ready") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        `Cannot accept challenge in ${challengeData.status} state.`
      );
    }

    // Check deadline
    if (challengeData.deadline.toDate() < new Date()) {
      throw new functions.https.HttpsError("deadline-exceeded", "Challenge deadline has passed.");
    }

    // Update challenge with opponent's clip
    await challengeRef.update({
      [`clips.${context.auth.uid}`]: {
        userId: context.auth.uid,
        videoUrl: clipUrl,
        thumbnailUrl: thumbnailUrl || null,
        duration: clipDurationSec,
        status: "pending_validation",
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      status: "opponent_uploading",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Log audit
    await db.collection("audit_logs").add({
      action: "challenge_accepted",
      challengeId,
      acceptedBy: context.auth.uid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[acceptChallenge] ${context.auth.uid} accepted challenge ${challengeId}`);

    return {
      success: true,
      status: "opponent_uploading",
    };
  }
);

// ============================================================================
// Firestore Trigger: Update Challenge Status when Both Clips Ready
// ============================================================================

export const onChallengeClipUpdate = functions.firestore
  .document("challenges/{challengeId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Check if this is a clip status update
    const clipsBefore = before?.clips || {};
    const clipsAfter = after?.clips || {};

    // Get all clip statuses
    const afterStatuses = Object.values(clipsAfter).map((clip: unknown) => (clip as { status: string }).status);

    // If both clips are now "ready", transition to voting state
    const bothReady = afterStatuses.length === 2 && afterStatuses.every((s) => s === "ready");

    if (bothReady && after.status !== "both_ready" && after.status !== "voting") {
      const db = admin.firestore();
      const challengeRef = db.collection("challenges").doc(context.params.challengeId);

      // Set voting deadline (48 hours from now)
      const votingDeadline = new Date();
      votingDeadline.setHours(votingDeadline.getHours() + 48);

      await challengeRef.update({
        status: "both_ready",
        "voting.deadline": admin.firestore.Timestamp.fromDate(votingDeadline),
        "voting.votes": {},
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[onChallengeClipUpdate] Challenge ${context.params.challengeId} both clips ready, entering voting phase`);

      // TODO: Trigger push notification to both participants
    }
  });

// ============================================================================
// Rate Limiting Service
// ============================================================================

interface RateLimitConfig {
  collection: string;
  maxRequests: number;
  windowSeconds: number;
}

const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  challengeCreate: {
    collection: "challenges",
    maxRequests: 10,
    windowSeconds: 3600, // 10 per hour
  },
  videoUpload: {
    collection: "uploads",
    maxRequests: 20,
    windowSeconds: 3600, // 20 per hour
  },
  spotCreate: {
    collection: "spots",
    maxRequests: 5,
    windowSeconds: 86400, // 5 per day
  },
  voteCreate: {
    collection: "votes",
    maxRequests: 50,
    windowSeconds: 3600, // 50 per hour
  },
};

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  currentCount: number;
}

/**
 * Check and update rate limit for a user action
 * Uses Firestore transactions for atomic counter updates
 */
async function checkAndUpdateRateLimit(
  userId: string,
  action: keyof typeof RATE_LIMIT_CONFIGS
): Promise<RateLimitResult> {
  const config = RATE_LIMIT_CONFIGS[action];
  if (!config) {
    throw new Error(`Unknown rate limit action: ${action}`);
  }

  const db = admin.firestore();
  const counterRef = db.doc(`rateLimits/${userId}/${config.collection}/counter`);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const now = Date.now();
    const windowStart = now - config.windowSeconds * 1000;

    let count = 0;
    let lastReset = now;

    if (doc.exists) {
      const data = doc.data()!;
      // Check if within current window
      if (data.lastReset > windowStart) {
        count = data.count;
        lastReset = data.lastReset;
      }
      // else: window expired, reset counter
    }

    const resetAt = new Date(lastReset + config.windowSeconds * 1000);

    if (count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        currentCount: count,
      };
    }

    // Increment counter
    tx.set(counterRef, {
      count: count + 1,
      lastReset: count === 0 ? now : lastReset,
      updatedAt: now,
      action,
    });

    return {
      allowed: true,
      remaining: config.maxRequests - count - 1,
      resetAt,
      currentCount: count + 1,
    };
  });
}

/**
 * Get current rate limit status without incrementing
 */
async function getRateLimitStatus(
  userId: string,
  action: keyof typeof RATE_LIMIT_CONFIGS
): Promise<RateLimitResult> {
  const config = RATE_LIMIT_CONFIGS[action];
  if (!config) {
    throw new Error(`Unknown rate limit action: ${action}`);
  }

  const db = admin.firestore();
  const counterRef = db.doc(`rateLimits/${userId}/${config.collection}/counter`);
  const doc = await counterRef.get();

  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;

  let count = 0;
  let lastReset = now;

  if (doc.exists) {
    const data = doc.data()!;
    if (data.lastReset > windowStart) {
      count = data.count;
      lastReset = data.lastReset;
    }
  }

  const resetAt = new Date(lastReset + config.windowSeconds * 1000);

  return {
    allowed: count < config.maxRequests,
    remaining: Math.max(0, config.maxRequests - count),
    resetAt,
    currentCount: count,
  };
}

/**
 * Callable: Check rate limit status
 */
export const checkRateLimitStatus = functions.https.onCall(
  async (
    data: { action: string },
    context: functions.https.CallableContext
  ): Promise<RateLimitResult> => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    const { action } = data;
    if (!action || !(action in RATE_LIMIT_CONFIGS)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Invalid action. Must be one of: ${Object.keys(RATE_LIMIT_CONFIGS).join(", ")}`
      );
    }

    return getRateLimitStatus(
      context.auth.uid,
      action as keyof typeof RATE_LIMIT_CONFIGS
    );
  }
);

/**
 * Scheduled: Clean up old rate limit counters
 * Runs daily to remove expired counter documents
 */
export const cleanupRateLimitCounters = functions.pubsub
  .schedule("every 24 hours")
  .onRun(async () => {
    const db = admin.firestore();
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Query all rate limit counters
    const snapshot = await db.collectionGroup("counter").get();

    const batch = db.batch();
    let deleteCount = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.updatedAt && now - data.updatedAt > maxAge) {
        batch.delete(doc.ref);
        deleteCount++;
      }
    });

    if (deleteCount > 0) {
      await batch.commit();
      console.log(`[cleanupRateLimitCounters] Deleted ${deleteCount} stale counters`);
    }

    return null;
  });

// ============================================================================
// Push Notifications (FCM)
// ============================================================================

/**
 * Notification types
 */
type NotificationType =
  | "challenge_received"
  | "opponent_uploaded"
  | "voting_requested"
  | "result_posted"
  | "new_follower"
  | "spot_nearby";

interface FCMToken {
  token: string;
  platform: "ios" | "android" | "web";
  deviceId: string;
  createdAt: admin.firestore.Timestamp;
  lastRefreshed: admin.firestore.Timestamp;
}

interface SendNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send push notification to a user
 * Handles multiple tokens per user and cleans up invalid tokens
 */
async function sendPushNotification(params: SendNotificationParams): Promise<void> {
  const { userId, type, title, body, data = {} } = params;

  const db = admin.firestore();
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists) {
    console.log(`[sendPushNotification] User ${userId} not found`);
    return;
  }

  const userData = userDoc.data();
  const tokens: FCMToken[] = userData?.fcmTokens || [];
  const preferences = userData?.notificationPreferences || {};

  // Check if user has notifications enabled
  if (preferences.enabled === false) {
    console.log(`[sendPushNotification] Notifications disabled for user ${userId}`);
    return;
  }

  // Check specific notification preference
  const prefKey = type.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  if (preferences[prefKey] === false) {
    console.log(`[sendPushNotification] ${type} notifications disabled for user ${userId}`);
    return;
  }

  if (tokens.length === 0) {
    console.log(`[sendPushNotification] No FCM tokens for user ${userId}`);
    return;
  }

  // Prepare notification payload
  const tokenStrings = tokens.map((t) => t.token);

  const message: admin.messaging.MulticastMessage = {
    tokens: tokenStrings,
    notification: {
      title,
      body,
    },
    data: {
      type,
      timestamp: new Date().toISOString(),
      ...data,
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
    android: {
      priority: "high",
      notification: {
        sound: "default",
        channelId: type.includes("challenge") ? "challenges" : "activity",
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      `[sendPushNotification] Sent to ${userId}: ${response.successCount} success, ${response.failureCount} failed`
    );

    // Clean up invalid tokens
    const invalidTokens: string[] = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const errorCode = res.error?.code;
        if (
          errorCode === "messaging/invalid-registration-token" ||
          errorCode === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(tokenStrings[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      // Remove invalid tokens
      const validTokens = tokens.filter((t) => !invalidTokens.includes(t.token));
      await db.collection("users").doc(userId).update({
        fcmTokens: validTokens,
      });
      console.log(`[sendPushNotification] Cleaned up ${invalidTokens.length} invalid tokens for ${userId}`);
    }
  } catch (error) {
    console.error(`[sendPushNotification] Failed to send to ${userId}:`, error);
  }
}

/**
 * Firestore Trigger: Send notification when new challenge is created
 */
export const onChallengeCreated = functions.firestore
  .document("challenges/{challengeId}")
  .onCreate(async (snap, context) => {
    const challengeData = snap.data();
    const challengeId = context.params.challengeId;

    // Notify opponent about new challenge
    const creatorDoc = await admin.firestore().collection("users").doc(challengeData.createdBy).get();
    const creatorName = creatorDoc.data()?.displayName || "Someone";

    await sendPushNotification({
      userId: challengeData.opponent,
      type: "challenge_received",
      title: "New S.K.A.T.E. Challenge!",
      body: `${creatorName} challenged you to a S.K.A.T.E. battle!`,
      data: {
        challengeId,
        creatorId: challengeData.createdBy,
        screen: `/challenge/${challengeId}`,
      },
    });

    console.log(`[onChallengeCreated] Notification sent to ${challengeData.opponent} for challenge ${challengeId}`);
  });

/**
 * Firestore Trigger: Send notifications on challenge status changes
 */
export const onChallengeStatusChange = functions.firestore
  .document("challenges/{challengeId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const challengeId = context.params.challengeId;

    // Only process status changes
    if (before.status === after.status) {
      return;
    }

    const db = admin.firestore();

    // Get participant names
    const [creatorDoc, opponentDoc] = await Promise.all([
      db.collection("users").doc(after.createdBy).get(),
      db.collection("users").doc(after.opponent).get(),
    ]);

    const creatorName = creatorDoc.data()?.displayName || "Creator";
    const opponentName = opponentDoc.data()?.displayName || "Opponent";

    // Handle different status transitions
    switch (after.status) {
      case "opponent_uploading":
        // Opponent has started responding - no notification yet
        break;

      case "both_ready":
        // Both clips ready - notify both participants about voting
        await Promise.all([
          sendPushNotification({
            userId: after.createdBy,
            type: "voting_requested",
            title: "Time to Vote!",
            body: `${opponentName} uploaded their clip. Watch both and vote!`,
            data: {
              challengeId,
              screen: `/challenge/${challengeId}/vote`,
            },
          }),
          sendPushNotification({
            userId: after.opponent,
            type: "opponent_uploaded",
            title: "Your Response is Ready!",
            body: `Your challenge clip has been validated. Voting is open!`,
            data: {
              challengeId,
              screen: `/challenge/${challengeId}/vote`,
            },
          }),
        ]);
        console.log(`[onChallengeStatusChange] Voting notifications sent for ${challengeId}`);
        break;

      case "completed":
        // Challenge completed - notify both about results
        const winnerId = after.voting?.result?.winner;
        const winnerName = winnerId === after.createdBy ? creatorName : opponentName;

        await Promise.all([
          sendPushNotification({
            userId: after.createdBy,
            type: "result_posted",
            title: "Challenge Results!",
            body:
              winnerId === after.createdBy
                ? "Congratulations! You won the challenge!"
                : `${opponentName} won this round. Challenge again!`,
            data: {
              challengeId,
              winnerId: winnerId || "",
              screen: `/challenge/${challengeId}/result`,
            },
          }),
          sendPushNotification({
            userId: after.opponent,
            type: "result_posted",
            title: "Challenge Results!",
            body:
              winnerId === after.opponent
                ? "Congratulations! You won the challenge!"
                : `${creatorName} won this round. Challenge again!`,
            data: {
              challengeId,
              winnerId: winnerId || "",
              screen: `/challenge/${challengeId}/result`,
            },
          }),
        ]);
        console.log(`[onChallengeStatusChange] Result notifications sent for ${challengeId}`);
        break;
    }
  });

/**
 * Callable: Send test notification (for debugging)
 */
export const sendTestNotification = functions.https.onCall(
  async (data: { title?: string; body?: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    }

    await sendPushNotification({
      userId: context.auth.uid,
      type: "challenge_received",
      title: data.title || "Test Notification",
      body: data.body || "This is a test notification from SkateHubba!",
      data: {
        test: "true",
      },
    });

    return { success: true };
  }
);

export { createBounty, submitClaim, castVote, payOutClaim, expireBounties };
