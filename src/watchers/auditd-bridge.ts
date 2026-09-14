import { exec } from "node:child_process";
import fs from "node:fs";

import { Logger } from "../logger/logger.js";

const WATCHED_EXECUTABLES = ["rm", "dd", "mkfs", "mkfs.ext4", "mkfs.xfs"];

export class AuditdBridge {
  // serial сбрасывается auditd при каждой перезагрузке системы,
  // поэтому сам по себе не годится как единственный критерий checkpoint.
  // timestamp — основной критерий (всегда растёт в реальном времени),
  // serial — tie-breaker для нескольких событий внутри одной секунды.
  private lastCheckpoint: { timestampMs: number; serial: number } = {
    timestampMs: 0,
    serial: 0,
  };
  private intervalId: NodeJS.Timeout | null = null;
  // Внутреннее состояние процесса.
  // Не является внешней зависимостью или конфигурацией.
  private isPolling = false;
  constructor(
    private readonly logger: Logger,
    private readonly checkpointFile: string,
    // Внешняя конфигурация: задаётся при создании объекта.
    private readonly pollIntervalMs: number = 5000,
  ) {
    // Восстанавливаем состояние после перезапуска приложения.
    this.loadCheckpoint();
  }

  private loadCheckpoint(): void {
    if (!fs.existsSync(this.checkpointFile)) {
      this.lastCheckpoint = { timestampMs: Date.now(), serial: 0 };
      return;
    }

    try {
      const raw = fs.readFileSync(this.checkpointFile, "utf-8").trim();
      const parsed = JSON.parse(raw);

      if (
        Number.isSafeInteger(parsed.timestampMs) &&
        parsed.timestampMs >= 0 &&
        Number.isSafeInteger(parsed.serial) &&
        parsed.serial >= 0
      ) {
        this.lastCheckpoint = parsed;
        return;
      }
    } catch {
      // Повреждённый или старый (число вместо JSON) checkpoint — считаем первым запуском
    }

    this.lastCheckpoint = { timestampMs: Date.now(), serial: 0 };
  }

  private saveCheckpoint(): void {
    fs.writeFileSync(
      this.checkpointFile,
      JSON.stringify(this.lastCheckpoint),
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

    this.intervalId = setInterval(() => this.pollEvents(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);

      // После остановки явно сбрасываем состояние interval.
      this.intervalId = null;
    }
  }

  private parseCsvLine(line: string): {
    timestampMs: number;
    serial: number;
    executable: string;
    success: boolean;
  } | null {
    //долг:это не полноценный CSV parser. Если значение когда-нибудь содержит запятую/экранирование, индексы поплывут.
    const columns = line.split(",");

    const date = columns[2]; // MM/DD/YYYY
    const time = columns[3]; // HH:MM:SS
    const serialRaw = columns[4];
    const executableRaw = columns.at(-1);

    if (!date || !time || !serialRaw || !executableRaw) {
      return null;
    }

    const serial = Number(serialRaw);
    if (!Number.isSafeInteger(serial) || serial < 0) {
      return null;
    }

    const [month, day, year] = date.split("/");
    // долг: нормализовать audit timestamp с явной timezone/epoch-семантикой.
    const timestampMs = new Date(`${year}-${month}-${day}T${time}`).getTime();
    if (Number.isNaN(timestampMs)) {
      return null;
    }

    const executable = executableRaw.trim();
    if (!executable) {
      return null;
    }

    return {
      timestampMs,
      serial,
      executable,
      success: columns.some((column) => column.trim() === "success"),
    };
  }

  private pollEvents(): void {
    // Не запускаем новый опрос, если предыдущий ausearch ещё не завершился.
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    const cmd = "sudo ausearch -k dangerous_delete -ts recent --format csv";

    exec(cmd, (error, stdout) => {
      try {
        // ausearch может вернуть ненулевой exit code,
        // например когда подходящих событий нет.
        // Если при этом stdout пустой — просто заканчиваем этот poll.
        if (error && !stdout) {
          return;
        }

        const lines = stdout.split("\n").filter(Boolean);

        // Начинаем с текущего checkpoint.
        // В процессе обработки будем искать самую новую позицию.
        let newCheckpoint = this.lastCheckpoint;

        for (const line of lines) {
          const parsed = this.parseCsvLine(line);

          // Строка не соответствует ожидаемому формату.
          if (!parsed) {
            continue;
          }

          /*
           * Проверяем, новее ли событие последнего checkpoint.
           *
           * Сначала сравниваем timestamp.
           * Если события произошли в одну секунду —
           * используем serial как tie-breaker.
           */
          const isNewer =
            parsed.timestampMs > this.lastCheckpoint.timestampMs ||
            (parsed.timestampMs === this.lastCheckpoint.timestampMs &&
              parsed.serial > this.lastCheckpoint.serial);

          // Уже обработанное событие — пропускаем.
          if (!isNewer) {
            continue;
          }

          // Обрабатываем только новое событие.
          this.processEvent(parsed);

          /*
           * Отдельно определяем, является ли это событие
           * самым новым среди всех обработанных в текущем poll.
           *
           * Это важно, потому что строки могут прийти в любом порядке.
           */
          const isNewestSoFar =
            parsed.timestampMs > newCheckpoint.timestampMs ||
            (parsed.timestampMs === newCheckpoint.timestampMs &&
              parsed.serial > newCheckpoint.serial);

          if (isNewestSoFar) {
            newCheckpoint = {
              timestampMs: parsed.timestampMs,
              serial: parsed.serial,
            };
          }
        }

        /*
         * Если за этот poll встретилось что-то новее checkpoint —
         * сохраняем новую точку на диск.
         */
        const checkpointChanged =
          newCheckpoint.timestampMs !== this.lastCheckpoint.timestampMs ||
          newCheckpoint.serial !== this.lastCheckpoint.serial;

        if (checkpointChanged) {
          this.lastCheckpoint = newCheckpoint;
          this.saveCheckpoint();
        }
      } finally {
        // В любом случае разрешаем следующий poll.
        // Даже если внутри произошёл return или исключение.
        this.isPolling = false;
      }
    });
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
