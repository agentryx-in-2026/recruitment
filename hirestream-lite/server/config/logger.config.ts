import winston from "winston";
import path from "path";
import { env } from "./env.config";

const LOG_DIR = path.resolve(process.cwd(), "logs");

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "hirestream-api" },
  transports: [
    // Console — coloured, human-readable in dev
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const duration = meta.duration ? ` (${meta.duration}ms)` : "";
          const metaKeys = Object.keys(meta).filter(
            (k) => !["service", "timestamp"].includes(k)
          );
          const metaStr =
            metaKeys.length > 0 && env.NODE_ENV !== "test"
              ? ` ${JSON.stringify(
                  Object.fromEntries(metaKeys.map((k) => [k, meta[k]])),
                )}`
              : "";
          return `${timestamp} [${level}]: ${message}${duration}${metaStr}`;
        })
      ),
      // Suppress noisy logs during tests
      silent: env.NODE_ENV === "test",
    }),

    // File — structured JSON, one file per day (max 14 days retained)
    new winston.transports.File({
      filename: path.join(LOG_DIR, "app.log"),
      maxsize: 10 * 1024 * 1024, // 10 MB per file
      maxFiles: 14,
      tailable: true,
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      ),
    }),

    // Error-only file for quick scanning
    new winston.transports.File({
      filename: path.join(LOG_DIR, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 14,
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      ),
    }),
  ],
});
