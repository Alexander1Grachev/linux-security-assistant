

import type { LogEvent, LogLevel } from "./logger.js";
import type { FileLogEventRepository } from "./log-event-repository.js";

export interface QueryFilters {
  levels?: LogLevel[];
  sources?: string[];
  sinceMinutesAgo?: number;
  messageContains?: string;
}

export class LogQueryService {

  constructor(
    private readonly fileLogEventRepository: FileLogEventRepository,
  ) {}
 

 
  findEvents(filters: QueryFilters = {}): LogEvent[] {
    let events = this.fileLogEventRepository.getAll();
 
    if (filters.levels && filters.levels.length > 0) {
      events = events.filter((e) => filters.levels!.includes(e.level));
    }
 
    if (filters.sources && filters.sources.length > 0) {
      events = events.filter((e) => filters.sources!.includes(e.source));
    }
 
    if (filters.sinceMinutesAgo !== undefined) {
      // Защита от некорректного значения (отрицательное, NaN)
      const minutes = Number.isFinite(filters.sinceMinutesAgo) && filters.sinceMinutesAgo >= 0
        ? filters.sinceMinutesAgo
        : 0;
      const cutoff = Date.now() - minutes * 60 * 1000;
      events = events.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
    }
 
    if (filters.messageContains) {
      const needle = filters.messageContains.toLowerCase();
      events = events.filter((e) => e.message.toLowerCase().includes(needle));
    }
 
    return events;
  }
 
  // Подсчёт событий, удовлетворяющих фильтру —  для anomaly detection
  countEvents(filters: QueryFilters = {}): number {
    return this.findEvents(filters).length;
  }

  // Группировка по источнику —  для сводок
  groupBySource(events: LogEvent[]): Record<string, LogEvent[]> {
    const grouped: Record<string, LogEvent[]> = {};

    for (const event of events) {
      const source = (grouped[event.source] ??= []);

      source.push(event);
    }
    return grouped;
  }
}
