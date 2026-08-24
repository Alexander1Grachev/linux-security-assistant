import "dotenv/config";
import { UrlGuard } from "./guards/url-guard.js";

const guard = new UrlGuard();

// Тестовая безопасная ссылка
const safeUrl = "https://www.google.com";

// Официальная тестовая страница Google Safe Browsing — реально доступна в сети,
// в отличие от .test доменов, и распознаётся большинством движков как тестовая угроза
const testMaliciousUrl = "https://testsafebrowsing.appspot.com/s/malware.html";

async function main() {
  console.log("=== Тест 1: безопасная ссылка ===");
  const result1 = await guard.checkUrl(safeUrl);
  console.log("Результат:", result1);

  console.log("\n=== Тест 2: тестовая опасная ссылка ===");
  const result2 = await guard.checkUrl(testMaliciousUrl);
  console.log("Результат:", result2);
}

main();