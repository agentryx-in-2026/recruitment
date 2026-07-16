/**
 * Mobile Bearer Token Authentication Middleware
 *
 * Sits before passport.session() in the middleware chain. When a request
 * carries an `Authorization: Bearer <token>` header with a JWT whose `typ`
 * is `mobile_access`, this middleware verifies it and populates `req.user`
 * with the same shape that passport would. All existing route handlers that
 * read `req.user` continue to work — they don't care how the user was
 * authenticated.
 *
 * If the header is absent or not a Bearer token, the middleware calls
 * `next()` silently so the request falls through to passport session auth.
 *
 * See: /PMD-Final wrapup/MobileApps/05_Backend_API_Adaptations.md §3
 */

import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { env } from "../config/env.config";
import { logger } from "../config/logger.config";

export interface MobileAccessPayload {
  sub: string;          // userId
  role: string;
  typ: "mobile_access";
  iat: number;
  exp: number;
}

export async function mobileBearer(req: Request, res: Response, next: NextFunction) {
  // v0.4.16: the mobile app opens media URLs (offer-letter PDF, CV
  // download, etc.) via Linking.openURL — which hands the URL to the
  // device's default browser. The browser doesn't carry the mobile
  // app's Authorization header, so the request would 401. To make
  // these download URLs usable, we ALSO accept the same mobile_access
  // JWT in a `?token=...` query parameter. The token is the user's
  // own short-lived access token (~15 min) so leak surface is small;
  // we additionally set no-store + no-referrer headers on responses
  // that serve media via this path. See /api/v1/me/placements/:id/
  // offer-letter.pdf for one consumer.
  // security 2026-07-07 (A-CERT-1): tokens in query strings leak via browser
  // history, Referer headers, and proxy/access logs. Previously `?token=` was
  // accepted on EVERY route; now it is accepted ONLY on the media-download
  // routes the mobile app must open in the device browser (Linking.openURL
  // can't attach an Authorization header). Everything else requires the
  // `Authorization: Bearer` header.
  const QUERY_TOKEN_PATHS = /^\/api\/v1\/(me|agent)\/placements\/[^/]+\/offer-letter\.pdf$/;
  const header = req.headers.authorization;
  const queryToken =
    typeof req.query.token === "string" && QUERY_TOKEN_PATHS.test(req.path)
      ? req.query.token
      : null;

  let rawToken: string | null = null;
  if (header?.startsWith("Bearer ")) {
    rawToken = header.slice(7);
  } else if (queryToken) {
    rawToken = queryToken;
  }

  if (!rawToken) return next(); // skip — falls through to session

  // If JWT_SECRET is not configured, bearer tokens can't be verified
  if (!env.JWT_SECRET) return next();

  const token = rawToken;

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as MobileAccessPayload;

    // Only process tokens explicitly typed as mobile_access
    if (payload.typ !== "mobile_access") return next();

    const db = storage.db;
    if (!db) return res.status(500).json({ error: "database_unavailable" });

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) return res.status(401).json({ error: "user_not_found" });
    if (user.isActive === false) return res.status(401).json({ error: "user_deactivated" });

    // Populate req.user — same shape as passport.session() would
    (req as any).user = user;

    // Mark this request as mobile-authenticated so downstream code can
    // distinguish if needed (e.g. audit log: "source: mobile")
    (req as any).isMobileAuth = true;
    // Flag query-param auth so handlers can add no-store / no-referrer
    // headers to media responses (the token shouldn't be cached or
    // bounced via Referer to other origins).
    (req as any).isMobileQueryAuth = !!queryToken && !header;

    return next();
  } catch (e: any) {
    if (e.name === "TokenExpiredError") {
      return res.status(401).json({ error: "token_expired" });
    }
    if (e.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "invalid_token" });
    }
    logger.error(`mobileBearer: unexpected error: ${e.message}`);
    return res.status(401).json({ error: "invalid_token" });
  }
}
