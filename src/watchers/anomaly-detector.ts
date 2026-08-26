import type { LogQueryService } from "../logger/log-query-service.js";
import { Logger } from "../logger/logger.js";

const SOURCE_NAME = "anomaly-detector";

const DANGER_SPIKE_THRESHOLD = 3;
const DANGER_SPIKE_WINDOW_MIN = 5;

const REPEATED_WARN_THRESHOLD = 3;
const REPEATED_WARN_WINDOW_MIN = 10;

const ALERT_COOLDOWN_MIN = 10; // не повторять один и тот же алёрт чаще, чем раз в 10 минут

export class AnomalyDetector {
  private knownSources = new Set<string>();
  private intervalId: NodeJS.Timeout | null = null;
  // Ключ = идентификатор конкретного алёрта (правило + источник, если применимо)
  // Значение = timestamp последнего срабатывания
  private lastAlertAt = new Map<string, number>();

  constructor(
    private readonly logger: Logger,
    private readonly logQueryService: LogQueryService,
    private readonly checkIntervalMs: number = 30000,
  ) {}

  start(): void {
    this.logger.logEvent("info", SOURCE_NAME, "Anomaly Detector запущен");

    const allEvents = this.logQueryService.findEvents();
    for (const event of allEvents) {
      this.knownSources.add(event.source);
    }
    // Собственный источник добавляем сразу, чтобы не триггерить "новый источник" на самих себе
    this.knownSources.add(SOURCE_NAME);

    this.intervalId = setInterval(() => this.runChecks(), this.checkIntervalMs);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private runChecks(): void {
    this.checkDangerSpike();
    this.checkRepeatedWarnings();
    this.checkNewSource();
  }

  // Проверяет cooldown — можно ли сейчас поднять этот алёрт заново
  private canAlert(alertKey: string): boolean {
    const last = this.lastAlertAt.get(alertKey);
    if (!last) return true;
    return Date.now() - last >= ALERT_COOLDOWN_MIN * 60 * 1000;
  }

  private markAlerted(alertKey: string): void {
    this.lastAlertAt.set(alertKey, Date.now());
  }

  private checkDangerSpike(): void {
    const events = this.logQueryService.findEvents({
      levels: ["danger"],
      sinceMinutesAgo: DANGER_SPIKE_WINDOW_MIN,
    });

    // Исключаем собственные danger-события детектора, чтобы не зациклиться
    const count = events.filter((e) => e.source !== SOURCE_NAME).length;

    const alertKey = "danger-spike";
    if (count >= DANGER_SPIKE_THRESHOLD && this.canAlert(alertKey)) {
      this.logger.logEvent(
        "danger",
        SOURCE_NAME,
        `АНОМАЛИЯ: ${count} опасных событий за последние ${DANGER_SPIKE_WINDOW_MIN} минут`,
        { count, windowMinutes: DANGER_SPIKE_WINDOW_MIN }
      );
      this.markAlerted(alertKey);
    }
  }

  private checkRepeatedWarnings(): void {
    const events = this.logQueryService.findEvents({
      levels: ["warn"],
      sinceMinutesAgo: REPEATED_WARN_WINDOW_MIN,
    });

    const filtered = events.filter((e) => e.source !== SOURCE_NAME);
    const grouped = this.logQueryService.groupBySource(filtered);

    for (const [source, sourceEvents] of Object.entries(grouped)) {
      const alertKey = `repeated-warn-${source}`;
      if (sourceEvents.length >= REPEATED_WARN_THRESHOLD && this.canAlert(alertKey)) {
        this.logger.logEvent(
          "danger",
          SOURCE_NAME,
          `АНОМАЛИЯ: повторяющиеся предупреждения от "${source}" (${sourceEvents.length} раз за ${REPEATED_WARN_WINDOW_MIN} минут)`,
          { source, count: sourceEvents.length }
        );
        this.markAlerted(alertKey);
      }
    }
  }

  private checkNewSource(): void {
    const recentEvents = this.logQueryService.findEvents({ sinceMinutesAgo: 1 });

    for (const event of recentEvents) {
      if (event.source === SOURCE_NAME) continue; // не реагируем сами на себя

      if (!this.knownSources.has(event.source)) {
        this.knownSources.add(event.source);
        this.logger.logEvent(
          "warn",
          SOURCE_NAME,
          `Обнаружен новый источник событий: "${event.source}"`,
          { source: event.source }
        );
      }
    }
  }
}