/**
 * Push Notification Delivery Service — B2.2
 *
 * Sends push notifications to mobile devices via the Expo Push API.
 * Since the mobile app registers Expo Push Tokens (not raw FCM/APNs),
 * we use https://exp.host/--/api/v2/push/send instead of firebase-admin.
 *
 * This service:
 * - Looks up all active push tokens for a given user
 * - Sends via Expo Push API (batched, up to 100 per request)
 * - Handles delivery receipts and cleans up stale tokens
 *
 * Called from notification.service.ts → notify()
 */

import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { mobilePushTokens } from "@shared/schema";
import { logger } from "../config/logger.config";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: "default" | null;
  channelId?: string;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;           // receipt ID (when status === "ok")
  message?: string;      // error message
  details?: {
    error?: "DeviceNotRegistered" | "InvalidCredentials" | "MessageTooBig" | "MessageRateExceeded";
  };
}

/**
 * Send a push notification to all devices belonging to a user.
 *
 * @param userId - The user ID to send to
 * @param payload - The notification content
 * @returns Number of successfully queued messages
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<number> {
  const db = storage.db;
  if (!db) {
    logger.warn("Push: database not available, skipping");
    return 0;
  }

  try {
    // Get all push tokens for this user
    const tokens = await db
      .select()
      .from(mobilePushTokens)
      .where(eq(mobilePushTokens.userId, userId));

    if (tokens.length === 0) {
      // User has no registered devices — normal for web-only users
      return 0;
    }

    // Build Expo push messages
    const messages: ExpoPushMessage[] = tokens.map((t: any) => ({
      to: t.token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: payload.sound ?? "default",
      badge: payload.badge,
      channelId: payload.channelId || "default",
    }));

    // Send via Expo Push API (supports batches up to 100)
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      logger.error(`Push API error: HTTP ${response.status} — ${await response.text()}`);
      return 0;
    }

    const result = await response.json();
    const tickets: ExpoPushTicket[] = result.data || [];

    let sent = 0;
    const staleTokenIds: string[] = [];

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === "ok") {
        sent++;
      } else if (ticket.details?.error === "DeviceNotRegistered") {
        // Token is stale — mark for cleanup
        staleTokenIds.push(tokens[i].id);
        logger.info(`Push: stale token detected, will clean up: user=${userId} token=${tokens[i].token.slice(0, 20)}...`);
      } else {
        logger.warn(`Push delivery failed: user=${userId} error=${ticket.message || ticket.details?.error || "unknown"}`);
      }
    }

    // Clean up stale tokens (device uninstalled, etc.)
    if (staleTokenIds.length > 0) {
      for (const id of staleTokenIds) {
        await db.delete(mobilePushTokens).where(eq(mobilePushTokens.id, id));
      }
      logger.info(`Push: cleaned ${staleTokenIds.length} stale token(s) for user=${userId}`);
    }

    if (sent > 0) {
      logger.info(`Push sent: user=${userId} devices=${sent}/${tokens.length} title="${payload.title}"`);
    }

    return sent;
  } catch (error) {
    // Push failures should never break the notification flow
    logger.error(`Push delivery error: user=${userId} — ${error}`);
    return 0;
  }
}

/**
 * Send a push notification to multiple users at once (e.g. "new job posted").
 *
 * @param userIds - Array of user IDs
 * @param payload - The notification content
 * @returns Total number of successfully queued messages
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<number> {
  let total = 0;
  // Process in parallel with a concurrency limit
  const BATCH = 10;
  for (let i = 0; i < userIds.length; i += BATCH) {
    const batch = userIds.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((uid) => sendPushToUser(uid, payload))
    );
    total += results.reduce((sum, n) => sum + n, 0);
  }
  return total;
}
