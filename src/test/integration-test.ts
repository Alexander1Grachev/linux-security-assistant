import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Logger } from "../logger/logger.js";
import { LogQueryService } from "../logger/log-query-service.js";
import { AnomalyDetector } from "../watchers/anomaly-detector.js";
import { FileLogEventRepository } from "../logger/log-event-repository.js";

const TEST_DIR = path.join(os.tmpdir(), "ai-security-assistant-test");
const LOG_FILE = path.join(TEST_DIR, "events.log");

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`❌ FAIL: ${message}`);
  }

  console.log(`✅ PASS: ${message}`);
}

function resetTestEnvironment(): void {
  fs.rmSync(TEST_DIR, {
    recursive: true,
    force: true,
  });

  fs.mkdirSync(TEST_DIR, {
    recursive: true,
  });
}

function readLog(): string {
  if (!fs.existsSync(LOG_FILE)) {
    return "";
  }

  return fs.readFileSync(LOG_FILE, "utf-8");
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log(" AI Security Assistant integration test");
  console.log("========================================\n");

  resetTestEnvironment();

  // Logger получает путь к файлу через constructor и не зависит
  // от глобального Singleton или конкретной структуры проекта.
  console.log("=== Тест 1: Logger ===");

  const logger = new Logger(LOG_FILE);

  logger.logEvent(
    "info",
    "integration-test",
    "Logger test event",
  );

  assert(
    fs.existsSync(LOG_FILE),
    "Logger создал events.log",
  );

  assert(
    readLog().includes("Logger test event"),
    "Logger записал событие в файл",
  );

  // Repository отвечает только за получение LogEvent из storage.
  console.log("\n=== Тест 2: FileLogEventRepository ===");

  logger.logEvent(
    "warn",
    "integration-test",
    "Warning event",
  );

  logger.logEvent(
    "danger",
    "integration-test",
    "Danger event",
  );

  const repository = new FileLogEventRepository(LOG_FILE);
  const allEvents = repository.getAll();

  assert(
    allEvents.length === 3,
    `Repository прочитал 3 события (получено ${allEvents.length})`,
  );

  assert(
    allEvents.some((event) => event.level === "danger"),
    "Repository корректно восстановил LogEvent.level",
  );

  // QueryService работает уже с полученными событиями:
  // фильтрует, считает и группирует их.
  console.log("\n=== Тест 3: LogQueryService ===");

  const queryService = new LogQueryService(repository);

  const dangerEvents = queryService.findEvents({
    levels: ["danger"],
  });

  assert(
    dangerEvents.length === 1,
    "findEvents({ levels: ['danger'] }) работает",
  );

  const warningEvents = queryService.findEvents({
    levels: ["warn"],
  });

  assert(
    warningEvents.length === 1,
    "findEvents({ levels: ['warn'] }) работает",
  );

  const sourceEvents = queryService.findEvents({
    sources: ["integration-test"],
  });

  assert(
    sourceEvents.length === 3,
    "Фильтрация по source работает",
  );

  const messageEvents = queryService.findEvents({
    messageContains: "danger",
  });

  assert(
    messageEvents.length === 1,
    "Фильтрация по messageContains работает",
  );

  assert(
    queryService.countEvents({
      levels: ["danger"],
    }) === 1,
    "countEvents() работает",
  );

  console.log("\n=== Тест 4: groupBySource ===");

  const grouped = queryService.groupBySource(allEvents);

  assert(
    grouped["integration-test"]?.length === 3,
    "groupBySource() правильно сгруппировал события",
  );

  // Для detector используем короткий interval, чтобы не ждать реальные 30 секунд.
  console.log("\n=== Тест 5: AnomalyDetector + cooldown ===");

  // Создаём 3 warning от одного источника — этого достаточно
  // для срабатывания правила repeated warnings.
  for (let i = 1; i <= 3; i++) {
    logger.logEvent(
      "warn",
      "regression-source",
      `Regression warning ${i}`,
    );
  }

  const detector = new AnomalyDetector(
    logger,
    queryService,
    100,
  );

  detector.start();

  // Ждём несколько циклов detector:
  // первое срабатывание → затем cooldown.
  await new Promise((resolve) => {
    setTimeout(resolve, 450);
  });

  detector.stop();

  // Проверяем alert через QueryService, а не поиском текста в сыром файле.
  const anomalyEvents = queryService.findEvents({
    levels: ["danger"],
    sources: ["anomaly-detector"],
    messageContains: "повторяющиеся предупреждения",
  });

  const regressionAlerts = anomalyEvents.filter((event) =>
    event.message.includes("regression-source"),
  );

  assert(
    regressionAlerts.length >= 1,
    "AnomalyDetector обнаружил repeated warnings",
  );

  // Несколько циклов проверки не должны создавать несколько одинаковых alert.
  assert(
    regressionAlerts.length === 1,
    `Cooldown предотвратил повторный alert (получено ${regressionAlerts.length})`,
  );

  console.log("\n=== Тест 6: AnomalyDetector lifecycle ===");

  // stop() вызывается повторно для проверки безопасного lifecycle.
  detector.stop();

  assert(
    true,
    "AnomalyDetector корректно остановлен",
  );

  console.log("\n========================================");
  console.log("✅ Все integration tests пройдены");
  console.log("========================================");

  console.log(`\nТестовый лог: ${LOG_FILE}`);
}

main().catch((error) => {
  console.error("\n========================================");
  console.error("❌ Integration test FAILED");
  console.error("========================================\n");

  console.error(error);

  process.exit(1);
});