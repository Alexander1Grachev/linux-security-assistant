import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type LogLevel = "info" | "warn" | "danger";

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

export class Logger {
  private static instance: Logger;

  private readonly logDir: string;
  private readonly logFile: string;

  private constructor() {
    this.logDir = path.join(
      os.homedir(),
      "projects",
      "ai-security-assistant",
      "logs"
    );
    this.logFile = path.join(this.logDir, "events.log");
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  // Единая точка доступа — все модули получают один и тот же инстанс
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  logEvent(
    level: LogLevel,
    source: string,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    const event: LogEvent = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
        ...(meta !== undefined && { meta }), // если мета есть положи еслии нет не добавляй
    };

    fs.appendFileSync(this.logFile, JSON.stringify(event) + "\n");

    const prefix =
      level === "danger"
        ? "🔴 DANGER"
        : level === "warn"
          ? "🟡 WARN"
          : "🟢 INFO";
    console.log(
      `[${event.timestamp}] ${prefix} [${source}] ${message}`,
      meta ?? ""
    );
  }
}