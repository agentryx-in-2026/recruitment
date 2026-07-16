import { Request, Response, NextFunction } from "express";

export function protect(req: Request, res: Response, next: NextFunction) {
  // Session-based auth (web portal)
  if (req.isAuthenticated()) {
    return next();
  }
  // Bearer token auth (mobile app) — mobileBearer middleware sets req.user
  if ((req as any).user) {
    return next();
  }
  return res.status(401).json({
    success: false,
    error: {
      code: 401,
      message: "Authentication required",
    },
  });
}
