import { Logger } from "../logger/logger.js";
import { UrlCache } from "./url-cache.js";
import { isWhitelisted } from "./whitelist.js";

const VT_API_BASE = "https://www.virustotal.com/api/v3";

interface VtAnalysisResult {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
}

export class UrlGuard {
  constructor(
    private readonly logger: Logger,
    private readonly cache: UrlCache,
    private readonly apiKey: string,
  ) {}


  async checkUrl(url: string): Promise<{ safe: boolean; details: unknown; source: string }> {
    // Шаг 1: whitelist — доверенные домены пропускаем сразу
    if (isWhitelisted(url)) {
      this.logger.logEvent("info", "url-guard", `Ссылка в whitelist, пропускаю: ${url}`, { url });
      return { safe: true, details: null, source: "whitelist" };
    }

    // Шаг 2: кэш — если уже проверяли недавно, не тратим лимит API
    const cached = this.cache.get(url);
    if (cached) {
      this.logger.logEvent(
        cached.safe ? "info" : "danger",
        "url-guard",
        `Результат из кэша: ${url} — ${cached.safe ? "безопасна" : "ОПАСНА"}`,
        { url, cachedAt: new Date(cached.checkedAt).toISOString() }
      );
      return { safe: cached.safe, details: cached.details, source: "cache" };
    }

    // Шаг 3: реальная проверка через VirusTotal
    this.logger.logEvent("info", "url-guard", `Проверяю через VirusTotal: ${url}`, { url });

    try {
      const analysisId = await this.submitUrl(url);
      const result = await this.pollAnalysis(analysisId);

      const isSafe = result.malicious === 0 && result.suspicious === 0;

      this.cache.set(url, isSafe, result);

      if (isSafe) {
        this.logger.logEvent("info", "url-guard", `Ссылка безопасна: ${url}`, { url, result });
      } else {
        this.logger.logEvent(
          "danger",
          "url-guard",
          `ОПАСНАЯ ссылка обнаружена: ${url} (malicious: ${result.malicious}, suspicious: ${result.suspicious})`,
          { url, result }
        );
      }

      return { safe: isSafe, details: result, source: "virustotal" };
    } catch (error) {
      this.logger.logEvent("warn", "url-guard", `Ошибка проверки ссылки: ${url}`, {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fail closed — при ошибке считаем небезопасной
      return { safe: false, details: null, source: "error" };
    }
  }

  private async submitUrl(url: string): Promise<string> {
    const response = await fetch(`${VT_API_BASE}/urls`, {
      method: "POST",
      headers: {
        "x-apikey": this.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `url=${encodeURIComponent(url)}`,
    });

    if (!response.ok) {
      throw new Error(`VirusTotal submit failed: ${response.status}`);
    }

    const data = await response.json();
    return data.data.id;
  }

  private async pollAnalysis(analysisId: string, maxAttempts = 15): Promise<VtAnalysisResult> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await fetch(`${VT_API_BASE}/analyses/${analysisId}`, {
        headers: { "x-apikey": this.apiKey },
      });

      if (!response.ok) {
        throw new Error(`VirusTotal analysis fetch failed: ${response.status}`);
      }

      const data = await response.json();
      const status = data.data.attributes.status;

      if (status === "completed") {
        const stats = data.data.attributes.stats;
        return {
          malicious: stats.malicious ?? 0,
          suspicious: stats.suspicious ?? 0,
          harmless: stats.harmless ?? 0,
          undetected: stats.undetected ?? 0,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error("VirusTotal analysis timeout — не дождались результата");
  }
}