import { exec } from "node:child_process";
import { Logger } from "../logger/logger.js";

// Бинарники, за которыми реально хотим следить — остальное считаем шумом
const WATCHED_EXECUTABLES = ["rm", "dd", "mkfs", "mkfs.ext4", "mkfs.xfs"];

export class AuditdBridge {
  private readonly logger: Logger;
  private intervalId: NodeJS.Timeout | null = null;
  private lastCheckTimestamp: Date;

  constructor(private readonly pollIntervalMs: number = 5000) {
    this.logger = Logger.getInstance();
    this.lastCheckTimestamp = new Date();
  }

  start(): void {
    this.logger.logEvent(
      "info",
      "auditd-bridge",
      "AuditdBridge запущен, опрашиваю ausearch..."
    );

    this.intervalId = setInterval(() => this.pollEvents(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private pollEvents(): void {
    // Берём события за последние ~10 секунд, чтобы не пропустить на стыке опроса
    const cmd = `sudo ausearch -k dangerous_delete -ts recent --format text`;

    exec(cmd, (error, stdout) => {
      if (error && !stdout) {
        // ausearch возвращает ненулевой код, если событий нет — это не ошибка
        return;
      }

      const lines = stdout.split("\n").filter(Boolean);

      for (const line of lines) {
        this.processLine(line);
      }
    });
  }

  private processLine(line: string): void {
    // Пример строки:
    // At 15:59:18 08/22/2026 alexander888 successfully deleted /home/.../file using /usr/bin/rm
    const executableMatch = line.match(/using\s+(\S+)\s*$/);
    if (!executableMatch) return;

    const fullPath = executableMatch[1];
    const executableName = fullPath.split("/").pop() ?? "";

    // Фильтруем шум — интересуют только реально опасные бинарники
    if (!WATCHED_EXECUTABLES.includes(executableName)) {
      return;
    }

    const timestampMatch = line.match(/^At (\S+ \S+)/);
    const eventTime = timestampMatch ? timestampMatch[1] : "unknown";

    // Простая защита от повторной обработки одного и того же события при пересечении окон опроса
    const eventKey = `${eventTime}-${line}`;
    if (this.seenEvents.has(eventKey)) return;
    this.seenEvents.add(eventKey);

    const isSuccess = line.includes("successfully");

    this.logger.logEvent(
      isSuccess ? "danger" : "warn",
      "auditd-bridge",
      `Kernel-level событие: ${executableName} — ${isSuccess ? "выполнено" : "попытка"}`,
      { rawLine: line.trim(), executable: executableName }
    );
  }

  private seenEvents = new Set<string>();
}