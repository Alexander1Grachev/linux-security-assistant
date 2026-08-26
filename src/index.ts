import "dotenv/config";

import os from "node:os";
import path from "node:path";

import { Logger } from "./logger/logger.js";
import { LogQueryService } from "./logger/log-query-service.js";
import { AnomalyDetector } from "./watchers/anomaly-detector.js";
import { DownloadsWatcher } from "./watchers/downloads-watcher.js";
import { AuditdBridge } from "./watchers/auditd-bridge.js";
import { FileLogEventRepository } from "./logger/log-event-repository.js";

const projectDir = path.join(
  os.homedir(),
  "projects",
  "ai-security-assistant",
);

const logFile = path.join(
  projectDir,
  "logs",
  "events.log",
);

const downloadsDir = path.join(
  os.homedir(),
  "Downloads",
);

const auditdCheckpointFile = path.join(
  projectDir,
  "cache",
  "auditd-checkpoint.txt",
);

const logger = new Logger(logFile);

const repository = new FileLogEventRepository(logFile);

const logQueryService = new LogQueryService(repository);

const anomalyDetector = new AnomalyDetector(
  logger,
  logQueryService,
);

const downloadsWatcher = new DownloadsWatcher(
  logger,
  downloadsDir,
);

const auditdBridge = new AuditdBridge(
  logger,
  auditdCheckpointFile,
);

console.log("🛡️ AI Security Assistant — запуск...");

downloadsWatcher.start();
auditdBridge.start();
anomalyDetector.start();