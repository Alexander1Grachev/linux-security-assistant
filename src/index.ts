import { AuditdBridge } from "./watchers/auditd-bridge.js";
import { DownloadsWatcher } from "./watchers/downloads-watcher.js";

console.log("🛡️  AI Security Assistant — запуск...");

const downloadsWatcher = new DownloadsWatcher();
downloadsWatcher.start();

const auditdBridge = new AuditdBridge();
auditdBridge.start();

// Дальше сюда будем добавлять: UrlGuard, VoiceInterface