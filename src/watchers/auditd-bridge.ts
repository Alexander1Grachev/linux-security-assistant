import { exec } from "node:child_process";
import fs from "node:fs";

import { Logger } from "../logger/logger.js";

const WATCHED_EXECUTABLES = [
  "rm",
  "dd",
  "mkfs",
  "mkfs.ext4",
  "mkfs.xfs",
];

export class AuditdBridge {
  
  private lastProcessedSerial = 0;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly checkpointFile: string,
    private readonly pollIntervalMs: number = 5000,
  ) {
    // Восстанавливаем состояние после перезапуска приложения.
    this.loadCheckpoint();
  }

  /*
   Загружает последний обработанный serial из checkpoint-файла.
   
   Если checkpoint отсутствует или повреждён, считаем запуск первым.
   И вэтом случае начинаем с текущего момента и не пытаемся обрабатывать
  старую историю auditd.
   */
  private loadCheckpoint(): void {
    if (!fs.existsSync(this.checkpointFile)) {
      this.lastProcessedSerial = 0;
      return;
    }

    const raw = fs.readFileSync(this.checkpointFile, "utf-8").trim();
    const parsed = Number(raw);

    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      this.lastProcessedSerial = parsed;
    } else {
      // Повреждённый checkpoint --считаем что это первый запуск.
      this.lastProcessedSerial = 0;
    }
  }

  /*
   Сохраняем serial на диск чтобы после рестарта не обработать
    уже обработанные audit-события повторно.
   */
  private saveCheckpoint(): void {
    fs.writeFileSync(
      this.checkpointFile,
      String(this.lastProcessedSerial),
      "utf-8",
    );
  }

  start(): void {
    // Защита от повторного start() и создания нескольких interval.
    if (this.intervalId !== null) {
      return;
    }

    this.logger.logEvent(
      "info",
      "auditd-bridge",
      "AuditdBridge запущен, опрашиваю ausearch...",
    );

    this.intervalId = setInterval(
      () => this.pollEvents(),
      this.pollIntervalMs,
    );
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);

      // После остановки явно сбрасываем состояние interval.
      this.intervalId = null;
    }
  }

  private pollEvents(): void {
    // Пока используем окно recent
    // Persistent deduplication обеспечивается нашим checkpoint по serial
    //
    // В technical debt оставляем переход на нативный
    // ausearch --checkpoint чтобы не усложнять MVP recovery-логикой.
    const cmd =
      "sudo ausearch -k dangerous_delete -ts recent --format csv";

    exec(cmd, (error, stdout) => {

      if (error && !stdout) {
        return;
      }

      const lines = stdout.split("\n").filter(Boolean);

      
      let maxSerialSeen = this.lastProcessedSerial;

      for (const line of lines) {
        const parsed = this.parseCsvLine(line);

        if (!parsed) {
          continue;
        }

   
        if (parsed.serial <= this.lastProcessedSerial) {
          continue;
        }

  
        this.processEvent(parsed);

        if (parsed.serial > maxSerialSeen) {
          maxSerialSeen = parsed.serial;
        }
      }

      // Записываем checkpoint только один раз за весь poll.
      if (maxSerialSeen > this.lastProcessedSerial) {
        this.lastProcessedSerial = maxSerialSeen;
        this.saveCheckpoint();
      }
    });
  }

 
  private parseCsvLine(
    line: string,
  ): {
    serial: number;
    executable: string;
    success: boolean;
  } | null {
    const columns = line.split(",");

    const serialRaw = columns[4];

   
    const executableRaw = columns.at(-1);

    if (!serialRaw || !executableRaw) {
      return null;
    }

    const serial = Number(serialRaw);

    if (!Number.isSafeInteger(serial) || serial < 0) {
      return null;
    }

    const executable = executableRaw.trim();

    if (!executable) {
      return null;
    }

    return {
      serial,
      executable,

     
      success: columns.some((column) => column.trim() === "success"),
    };
  }

  private processEvent(event: {
    serial: number;
    executable: string;
    success: boolean;
  }): void {
   
    const executableName = event.executable.split("/").pop() ?? "";

  
    if (!WATCHED_EXECUTABLES.includes(executableName)) {
      return;
    }

    this.logger.logEvent(
      event.success ? "danger" : "warn",
      "auditd-bridge",
      `Kernel-level событие: ${executableName} — ${
        event.success ? "выполнено" : "попытка"
      }`,
      {
        
        serial: event.serial,
        executable: executableName,
      },
    );
  }
}