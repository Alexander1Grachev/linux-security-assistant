import "dotenv/config";

import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { UrlGuard } from "./guards/url-guard.js";
import { UrlCache } from "./guards/url-cache.js";
import { Logger } from "./logger/logger.js";


const logFile = path.join(
  os.homedir(),
  "projects",
  "ai-security-assistant",
  "logs",
  "events.log",
);

const logger = new Logger(logFile);

const cache = new UrlCache();

const apiKey = process.env.VT_API_KEY;

if (!apiKey) {
  throw new Error("VT_API_KEY не найден в переменных окружения (.env)");
}

const guard = new UrlGuard(logger, cache, apiKey);

const KILL_SWITCH_FILE = path.join(
  os.homedir(),
  "projects",
  "ai-security-assistant",
  ".disabled",
);

async function main(): Promise<void> {

  const url = process.argv[2];

  if (!url) {
    console.error("Использование: check-and-open <url>");
    process.exit(1);
  }


  if (fs.existsSync(KILL_SWITCH_FILE)) {
    logger.logEvent(
      "warn",
      "url-guard",
      `Проверка отключена (kill switch), открываю напрямую: ${url}`,
      { url },
    );

    exec(`brave-browser "${url}"`);

    return;
  }


  exec(`notify-send "🛡️ Security Guard" "Проверяю ссылку..."`);

 
  const { safe, details, source } = await guard.checkUrl(url);

  if (safe) {
    exec(`brave-browser "${url}"`, (error) => {
      if (error) {
        logger.logEvent(
          "warn",
          "url-guard",
          `Не удалось открыть браузер: ${error.message}`,
          { url },
        );
      }
    });

    return;
  }

  const message =
    source === "error"
      ? `Не удалось проверить ссылку (возможно, нет интернета): ${url}`
      : `ОПАСНАЯ ссылка заблокирована: ${url}`;

  exec(`notify-send -u critical "🛡️ Security Guard" "${message}"`, (error) => {
    if (error) {
      console.error("notify-send failed:", error.message);
    }
  });

  console.log(message, details ?? "");
}


main();
