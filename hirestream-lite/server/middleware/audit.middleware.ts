import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { auditLog } from "@shared/schema";
import { logger } from "../config/logger.config";

/**
 * Audit log middleware — logs admin actions to the audit_log table.
 * Attach to admin routes that modify data (POST, PUT, PATCH, DELETE).
 */
export function auditAction(resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Capture original json to log what was returned
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      // Only log mutating methods
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        const user = req.user as any;
        if (user) {
          const action = req.method === "POST" ? "create"
            : req.method === "DELETE" ? "delete"
            : "update";

          const db = storage.db;
          if (db) {
            db.insert(auditLog).values({
              userId: user.id,
              action,
              resourceType,
              resourceId: req.params.id || body?.data?.id || null,
              details: {
                method: req.method,
                path: req.path,
                body: req.body,
                statusCode: res.statusCode,
              },
              ipAddress: req.ip || req.socket.remoteAddress || null,
            }).catch((err: unknown) => logger.error(`Audit log failed: ${err}`));
          }
        }
      }

      return originalJson(body);
    } as any;

    next();
  };
}
