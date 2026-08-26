
/* Какую задачи решаем:
как получить LogEvent из storage
*/

import fs from "node:fs";
import type { LogEvent } from "./logger.js";
import { isValidLogEvent } from "./log-event-validator.js";

export class FileLogEventRepository {
  constructor(
    private readonly logFile: string,
  ) {}

  getAll(): LogEvent[] {
    if (!fs.existsSync(this.logFile)) {
      return [];
    }

    const content = fs.readFileSync(this.logFile, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    const events: LogEvent[] = [];

    for (const line of lines) {
      let parsed: unknown;

      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (isValidLogEvent(parsed)) {
        events.push(parsed);
      }
    }

    return events;
  }
}