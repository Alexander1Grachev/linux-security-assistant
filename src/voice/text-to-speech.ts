import { exec } from "node:child_process";
import path from "node:path";

export class TextToSpeech {
  constructor(
    private readonly piperBinaryPath: string,
    private readonly voiceModelPath: string,
    private readonly tempWavPath: string
  ) {}

  async speak(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Экранируем кавычки в тексте, чтобы не сломать shell-команду
      const safeText = text.replace(/"/g, '\\"');

      const generateCmd = `echo "${safeText}" | "${this.piperBinaryPath}" --model "${this.voiceModelPath}" --output_file "${this.tempWavPath}"`;

      exec(generateCmd, (genError) => {
        if (genError) {
          reject(genError);
          return;
        }

        // Проигрываем сгенерированный файл
        exec(`paplay "${this.tempWavPath}"`, (playError) => {
          if (playError) {
            reject(playError);
            return;
          }
          resolve();
        });
      });
    });
  }
}