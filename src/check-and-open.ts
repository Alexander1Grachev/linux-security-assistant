import "dotenv/config";
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { UrlGuard } from "./guards/url-guard.js";
import { Logger } from "./logger/logger.js";

const logger = Logger.getInstance();
const KILL_SWITCH_FILE = path.join(
  os.homedir(),
  "projects",
  "ai-security-assistant",
  ".disabled"
);

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("Использование: check-and-open <url>");
    process.exit(1);
  }

  // Kill switch — если файл существует, пропускаем проверку и сразу открываем
  if (fs.existsSync(KILL_SWITCH_FILE)) {
    logger.logEvent("warn", "url-guard", `Проверка отключена (kill switch), открываю напрямую: ${url}`, { url });
    exec(`brave-browser "${url}"`);
    return;
  }

  exec(`notify-send "🛡️ Security Guard" "Проверяю ссылку..."`);

  const guard = new UrlGuard();
  const { safe, details, source } = await guard.checkUrl(url);

  if (safe) {
    // Открываем реальный браузер напрямую по бинарнику, чтобы не зациклиться
    // через xdg-open (который снова вызвал бы этот же обработчик)
    exec(`brave-browser "${url}"`, (error) => {
      if (error) {
        logger.logEvent("warn", "url-guard", `Не удалось открыть браузер: ${error.message}`, {
          url,
        });
      }
    });
  } else {
    const message =
      source === "error"
        ? `Не удалось проверить ссылку (возможно, нет интернета): ${url}`
        : `ОПАСНАЯ ссылка заблокирована: ${url}`;

    // Системное уведомление KDE — это то самое "невидимое" предупреждение для сотрудника
    exec(
      `notify-send -u critical "🛡️ Security Guard" "${message}"`,
      (error) => {
        if (error) console.error("notify-send failed:", error.message);
      }
    );

    console.log(message, details ?? "");
  }
}

main();