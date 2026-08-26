import type { LogEvent, LogLevel } from "./logger.js";

const VALID_LEVELS: LogLevel[] = ["info", "warn", "danger"];

export function isValidLogEvent(obj: unknown): obj is LogEvent {
  if (typeof obj !== "object" || obj === null) return false;

  const e = obj as Record<string, unknown>;

  return (
    typeof e.timestamp === "string" &&
    typeof e.source === "string" &&
    typeof e.message === "string" &&
    typeof e.level === "string" &&
    VALID_LEVELS.includes(e.level as LogLevel) &&
    !Number.isNaN(new Date(e.timestamp).getTime())
  );
}