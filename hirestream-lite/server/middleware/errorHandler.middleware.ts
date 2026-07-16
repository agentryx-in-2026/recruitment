import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger.config";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  const code = err.code || "INTERNAL_ERROR";

  // Log the error securely
  if (status >= 500) {
    logger.error(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message:: ${message}`, {
      stack: err.stack,
      requestId: (req as any).id || "NO-ID",
    });
  } else {
    logger.warn(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message:: ${message}`);
  }

  // security 2026-07-07 (A05-1): never echo internal error detail to the
  // client for 5xx — raw err.message leaks DB/stack internals. The real
  // message + stack are logged above; the client gets a generic message.
  // 4xx messages are client-safe (set deliberately by handlers) and pass
  // through unchanged. In development the real message still surfaces to
  // keep debugging fast.
  const clientMessage =
    status >= 500 && process.env.NODE_ENV !== "development"
      ? "Internal server error"
      : message;

  res.status(status).json({
    success: false,
    error: {
      code,
      message: clientMessage,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    },
  });
}
