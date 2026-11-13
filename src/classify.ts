import { config } from "./config.js";
import { type CreateDecision, type DecisionCreateParams, chosenProbability } from "./decisions.js";
import { type DocumentType, documentTypes } from "./documents/index.js";
import { type PreparedDocument, dataUrl } from "./input.js";

export interface Guess {
  value: string;
  probability: number;
  probabilities: Record<string, number>;
}

export interface Classification {
  type: Guess;
  variant: Guess | null;
}

type Question = DecisionCreateParams["questions"][number];

function variantQuestion(t: DocumentType): Question {
  return {
    type: "choice",
    name: `${t.id}_variant`,
    instructions: t.variantQuestion,
    choices: t.variants.map((v) => ({ value: v.id, description: v.description })),
  };
}

/**
 * One request, several questions: what type is this, and for every type we
 * support, which variant would it be. The questions run in parallel, so asking
 * for every variant up front costs about the same as asking for one.
 */
export async function classify(
  createDecision: CreateDecision,
  doc: PreparedDocument,
  knownType?: string,
): Promise<Classification> {
  const candidates = knownType ? documentTypes.filter((t) => t.id === knownType) : documentTypes;
  if (candidates.length === 0) throw new Error(`Unknown document type: ${knownType}`);

  const questions: Question[] = [];
  if (!knownType) {
    questions.push({
      type: "choice",
      name: "document_type",
      instructions: "What kind of financial document is this?",
      choices: [
        ...documentTypes.map((t) => ({ value: t.id, description: t.description })),
        // Always give the model a way out. A forced guess is worse than "other".
        { value: "other", description: "Anything else: a different financial document, a partial page, or not a financial document." },
      ],
    });
  }
  questions.push(...candidates.map(variantQuestion));

  const decision = await createDecision({
    model: config.decisionModel,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "This is the first page of a document a user uploaded." },
          { type: "input_image", image_url: dataUrl(doc.pages[0]!, doc.imageMimeType), detail: "high" },
        ],
      },
    ],
    questions,
  });

  const answers = new Map(decision.answers.map((a) => [a.name, a]));
  const toPick = (name: string): Guess | null => {
    const answer = answers.get(name);
    if (!answer || answer.type !== "choice") return null; // refusals land here
    return {
      value: String(answer.choice),
      probability: chosenProbability(answer),
      probabilities: Object.fromEntries(answer.probabilities.map((p) => [String(p.value), p.probability])),
    };
  };

  const type: Guess = knownType
    ? { value: knownType, probability: 1, probabilities: { [knownType]: 1 } }
    : (toPick("document_type") ?? { value: "other", probability: 0, probabilities: {} });

  const variant = type.value === "other" ? null : toPick(`${type.value}_variant`);
  return { type, variant };
}
