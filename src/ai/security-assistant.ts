import { QueryPlanner } from "./query-planner.js";
import { AnswerGenerator } from "./answer-generator.js";
import { LogQueryService } from "../logger/log-query-service.js";

export class SecurityAssistant {
  constructor(
    private readonly queryPlanner: QueryPlanner,
    private readonly logQueryService: LogQueryService,
    private readonly answerGenerator: AnswerGenerator
  ) {}

  async ask(userQuestion: string): Promise<string> {
    // Stage 1: превращаем вопрос в фильтр
    const filters = await this.queryPlanner.planQuery(userQuestion);

    // Stage 2: код достаёт реальные факты (детерминированно, без ИИ)
    const events = this.logQueryService.findEvents(filters);

    // Stage 3: ИИ формулирует ответ на основе фактов
    const answer = await this.answerGenerator.generateAnswer(userQuestion, events);

    return answer;
  }
}