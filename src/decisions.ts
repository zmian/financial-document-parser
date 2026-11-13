import OpenAI from "openai";
import type { Decision, DecisionCreateParams } from "openai/resources/decisions";

/** The one call we make to the Decisions API. Swap it out in tests. */
export type CreateDecision = (params: DecisionCreateParams) => Promise<Decision>;

export function openaiDecisions(client = new OpenAI({ maxRetries: 4 })): CreateDecision {
  return (params) => client.decisions.create(params);
}

export type Answer = Decision["answers"][number];

/** The probability of the option the model picked, not its overall confidence. */
export function chosenProbability(answer: Answer): number {
  if (answer.type !== "choice") return 0;
  return answer.probabilities.find((p) => p.value === answer.choice)?.probability ?? 0;
}

export type { Decision, DecisionCreateParams };
