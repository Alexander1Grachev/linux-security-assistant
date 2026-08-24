import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

interface CacheEntry {
  safe: boolean;
  checkedAt: number; // timestamp в ms
  details: unknown;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней — угрозы для домена редко появляются/исчезают за пару дней

export class UrlCache {
  private readonly cacheFile: string;
  private cache: Record<string, CacheEntry> = {};

  constructor() {
    const cacheDir = path.join(
      os.homedir(),
      "projects",
      "ai-security-assistant",
      "cache"
    );
    fs.mkdirSync(cacheDir, { recursive: true });
    this.cacheFile = path.join(cacheDir, "url-cache.json");

    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.cacheFile)) {
      try {
        this.cache = JSON.parse(fs.readFileSync(this.cacheFile, "utf-8"));
      } catch {
        this.cache = {};
      }
    }
  }

  private save(): void {
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
  }

  private hashUrl(url: string): string {
    // Хэшируем URL, чтобы не хранить их as-is (компактнее и не палим историю браузинга в открытом виде)
    return crypto.createHash("sha256").update(url).digest("hex");
  }

  get(url: string): CacheEntry | null {
    const key = this.hashUrl(url);
    const entry = this.cache[key];

    if (!entry) return null;

    const isExpired = Date.now() - entry.checkedAt > CACHE_TTL_MS;
    if (isExpired) {
      delete this.cache[key];
      this.save();
      return null;
    }

    return entry;
  }

  set(url: string, safe: boolean, details: unknown): void {
    const key = this.hashUrl(url);
    this.cache[key] = { safe, checkedAt: Date.now(), details };
    this.save();
  }
}