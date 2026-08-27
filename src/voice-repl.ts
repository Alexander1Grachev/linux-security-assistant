import "dotenv/config";
import readline from "node:readline";
import path from "node:path";
import os from "node:os";

import { OllamaClient } from "./ai/ollama-client.js";
import { QueryPlanner } from "./ai/query-planner.js";
import { AnswerGenerator } from "./ai/answer-generator.js";
import { SecurityAssistant } from "./ai/security-assistant.js";
import { LogQueryService } from "./logger/log-query-service.js";
import { TextToSpeech } from "./voice/text-to-speech.js";
import { FileLogEventRepository } from "./logger/log-event-repository.js";

const PROJECT_DIR = path.join(
  os.homedir(),
  "projects",
  "ai-security-assistant",
);
const LOG_FILE_PATH = path.join(PROJECT_DIR, "logs", "events.log");
const PIPER_BINARY = path.join(PROJECT_DIR, "tools", "piper", "piper", "piper");
const VOICE_MODEL = path.join(
  PROJECT_DIR,
  "tools",
  "piper",
  "voices",
  "ru_RU-irina-medium.onnx",
);
const TEMP_WAV = path.join(PROJECT_DIR, "cache", "tts-output.wav");

const ollama = new OllamaClient();
const queryPlanner = new QueryPlanner(ollama);
const repository = new FileLogEventRepository(LOG_FILE_PATH);
const logQueryService = new LogQueryService(repository);
const answerGenerator = new AnswerGenerator(ollama);
const assistant = new SecurityAssistant(
  queryPlanner,
  logQueryService,
  answerGenerator,
);
const tts = new TextToSpeech(PIPER_BINARY, VOICE_MODEL, TEMP_WAV);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("🛡️  AI Security Assistant — голосовой режим");
console.log(
  'Введите вопрос (например: "было ли что-то опасное сегодня?") или "выход" для завершения.\n',
);

function askQuestion() {
  rl.question("> ", async (userInput) => {
    if (userInput.trim().toLowerCase() === "выход") {
      rl.close();
      return;
    }

    console.log("⏳ Думаю...");

    try {
      const answer = await assistant.ask(userInput);
      console.log(`🤖 ${answer}\n`);

      await tts.speak(answer);
    } catch (error) {
      console.error("Ошибка:", error instanceof Error ? error.message : error);
    }

    askQuestion();
  });
}

askQuestion();
