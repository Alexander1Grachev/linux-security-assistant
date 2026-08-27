import "dotenv/config";
import path from "node:path";
import os from "node:os";

import { OllamaClient } from "../ai/ollama-client.js";
import { QueryPlanner } from "../ai/query-planner.js";
import { AnswerGenerator } from "../ai/answer-generator.js";
import { SecurityAssistant } from "../ai/security-assistant.js";
import { LogQueryService } from "../logger/log-query-service.js";
import { FileLogEventRepository } from "../logger/log-event-repository.js";

const LOG_FILE_PATH = path.join(
  os.homedir(),
  "projects",
  "ai-security-assistant",
  "logs",
  "events.log",
);

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

async function main() {
  const questions = [
    "Было ли что-то опасное сегодня?",
    "Сколько раз блокировались ссылки?",
    "Есть ли новые источники событий, которых раньше не было?",
  ];

  for (const q of questions) {
    console.log(`\n=== Вопрос: ${q} ===`);
    const answer = await assistant.ask(q);
    console.log("Ответ:", answer);
  }
}

main();
