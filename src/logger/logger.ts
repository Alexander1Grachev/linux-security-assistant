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

  constructor(private readonly logFile: string) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  }

  logEvent( 
    level: LogLevel,
    source: string,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    const event: LogEvent = {
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      ...(meta !== undefined && { meta }),
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
      meta ?? "",
    );
  }
}