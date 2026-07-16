import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export const validateRequest = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync(req.body);
      req.body = validated; // Replace with cleaned/validated data
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        // Surface the FIRST issue's message in `message` so single-alert
        // callers (e.g. the mobile RegisterScreen which just
        // Alert.alert's the error.message) show an actionable string
        // like "Password must contain at least one special character"
        // instead of the generic "Validation Error". The full details
        // array stays in `details` for richer UIs.
        const firstIssue = error.issues?.[0];
        const friendly = firstIssue?.message || validationError.message || "Validation Error";
        return res.status(400).json({
          success: false,
          error: {
            code: 400,
            message: friendly,
            details: validationError.details,
          },
        });
      }
      next(error);
    }
  };
};
