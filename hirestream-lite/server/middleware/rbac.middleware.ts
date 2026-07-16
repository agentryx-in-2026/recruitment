import { Request, Response, NextFunction } from "express";

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req.user as any)?.role;
    
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 403,
          message: "Forbidden: You do not have permission to access this resource",
        },
      });
    }

    next();
  };
}
