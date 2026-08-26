import chokidar, { FSWatcher } from "chokidar";
import { exec } from "node:child_process";
import path from "node:path";
import { Logger } from "../logger/logger.js";

export class DownloadsWatcher {
  private watcher: FSWatcher | null = null;

  constructor( 
    private readonly logger: Logger,
    private readonly downloadsDir: string,
  ) {}

  start(): void {
    this.logger.logEvent(
      "info",
      "clamav-watcher",
      `Watcher запущен, слежу за: ${this.downloadsDir}`
    );

    this.watcher = chokidar.watch(this.downloadsDir, {
      ignoreInitial: true,
      depth: 0,
    });

    this.watcher.on("add", (filePath) => this.scanFile(filePath));
  }

  stop(): void {
    this.watcher?.close();
  }

  private scanFile(filePath: string): void {
    const fileName = path.basename(filePath);

    this.logger.logEvent(
      "info",
      "clamav-watcher",
      `Новый файл обнаружен: ${fileName}`,
      { filePath }
    );

    exec(`clamscan --no-summary "${filePath}"`, (error, stdout) => {
      const isInfected = stdout.includes("FOUND");

      if (isInfected) {
        this.logger.logEvent(
          "danger",
          "clamav-watcher",
          `ОПАСНЫЙ ФАЙЛ обнаружен: ${fileName}`,
          { filePath, scanOutput: stdout.trim() }
        );
      } else {
        this.logger.logEvent("info", "clamav-watcher", `Файл чист: ${fileName}`, {
          filePath,
        });
      }
    });
  }
}