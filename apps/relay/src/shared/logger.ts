import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";
import os from "os";

const logsDir = process.env.LOGS_DIR
  ? path.resolve(process.cwd(), process.env.LOGS_DIR)
  : path.join(os.homedir(), "maximus-chat-logs");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  }),
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, "chat-server-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      zippedArchive: true,
    }),
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});
