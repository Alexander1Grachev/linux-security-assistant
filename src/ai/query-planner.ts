import type { QueryFilters } from "../logger/log-query-service.js";
import type { LogLevel } from "../logger/logger.js";
import { OllamaClient } from "./ollama-client.js";

const SYSTEM_PROMPT = `Ты — планировщик запросов для системы безопасности.
Твоя задача: превратить вопрос пользователя в JSON-фильтр для поиска событий в логах.

Доступные поля фильтра:
- levels: массив из "info", "warn", "danger" (какие уровни важности искать)
- sinceMinutesAgo: число минут назад, за которые искать события (например, 60 = последний час, 1440 = последние сутки)
- sources: массив источников, например ["clamav-watcher", "auditd-bridge", "url-guard", "anomaly-detector"]
- messageContains: строка для поиска по тексту сообщения

Отвечай ТОЛЬКО валидным JSON, без пояснений, без markdown-обёртки, без каких-либо других слов.
Если вопрос не уточняет период — используй sinceMinutesAgo: 1440 (сутки) по умолчанию.
Если вопрос не уточняет уровень — не указывай levels вообще (искать все).
Если вопрос спрашивает про угрозы, блокировки, опасность, заражения — обязательно указывай levels: ["danger"].

Пример вопроса: "было что-то опасное за последний час?"
Пример ответа: {"levels": ["danger"], "sinceMinutesAgo": 60}

Пример вопроса: "что происходило сегодня с загрузками?"
Пример ответа: {"sinceMinutesAgo": 1440, "sources": ["clamav-watcher"]}

Пример вопроса: "появлялись новые источники событий?"
Пример ответа: {"sinceMinutesAgo": 1440, "sources": ["anomaly-detector"], "messageContains": "новый источник"}`;

export class QueryPlanner {
  constructor(private readonly ollama: OllamaClient) {}

  async planQuery(userQuestion: string): Promise<QueryFilters> {
    try {
      const raw = await this.ollama.generate(SYSTEM_PROMPT, userQuestion);
      const cleaned = this.stripMarkdownFences(raw);
      const parsed = JSON.parse(cleaned);

      return this.validateFilters(parsed);
    } catch {
      // Fallback — если модель вернула невалидный JSON, используем безопасный дефолт
      return { sinceMinutesAgo: 1440 };
    }
  }

  private stripMarkdownFences(text: string): string {
    return text.replace(/```json\s*|```\s*/g, "").trim();
  }

  // Валидация — не доверяем слепо тому, что вернула модель
  private validateFilters(obj: unknown): QueryFilters {
    if (typeof obj !== "object" || obj === null)
      return { sinceMinutesAgo: 1440 };

    const raw = obj as Record<string, unknown>;
    const filters: QueryFilters = {};

    const validLevels: LogLevel[] = ["info", "warn", "danger"];
    if (Array.isArray(raw.levels)) {
      const levels = raw.levels.filter((l): l is LogLevel =>
        validLevels.includes(l as LogLevel),
      );
      if (levels.length > 0) filters.levels = levels;
    }

    if (typeof raw.sinceMinutesAgo === "number" && raw.sinceMinutesAgo > 0) {
      filters.sinceMinutesAgo = raw.sinceMinutesAgo;
    } else {
      filters.sinceMinutesAgo = 1440; // дефолт — сутки
    }

    if (Array.isArray(raw.sources)) {
      const sources = raw.sources.filter(
        (s): s is string => typeof s === "string",
      );
      if (sources.length > 0) filters.sources = sources;
    }

    if (
      typeof raw.messageContains === "string" &&
      raw.messageContains.length > 0
    ) {
      filters.messageContains = raw.messageContains;
    }

    return filters;
  }
}
