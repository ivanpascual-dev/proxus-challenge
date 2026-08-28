import { Console, Effect, Layer, Ref, Stream } from "effect";
import { Model as AiModel } from "effect/unstable/ai";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { SessionRepository, AgentHarness, AgentSession } from "./harness/index.ts";
import { GeminiModel } from "./gemini.ts";
import { FileSessionRepository } from "../../infra/agents/file-session-repository.ts";
import { MaterialRepository } from "../materials/material.ts";
import { ArtifactRepository } from "../artifacts/artifact.ts";
import { FileMaterialRepository } from "../../infra/materials/file-material-repository.ts";
import { FileMaterialIndexRepository } from "../../infra/materials/file-material-index-repository.ts";
import { IndexingServiceLive } from "../materials/indexing-service.ts";
import { PopplerPdfService } from "../../infra/materials/poppler-pdf-service.ts";
import { FileArtifactRepository } from "../../infra/artifacts/file-artifact-repository.ts";
import { makeMaterialCommands } from "./academic-tutor/material-commands.ts";
import { makeArtifactCommands } from "./academic-tutor/artifact-commands.ts";
import { AcademicTutorSkills } from "./academic-tutor/skills/index.ts";
import { initialTurnBudgetState, type TurnBudgetState } from "../limits/turn-budget.ts";
import { make as makeRateLimiter, type RateLimiter } from "../limits/rate-limiter.ts";

export const makeAcademicTutorHarness = (
  materialRepository: MaterialRepository,
  artifactRepository: ArtifactRepository,
  budgetRef: Ref.Ref<TurnBudgetState>,
  rateLimiter: RateLimiter,
  clientKey: string
) => AgentHarness.make({
  name: `You are an academic tutor agent.

You help students understand academic material, especially their uploaded PDF materials.
Be precise, pedagogical, and honest about what you can infer from the available materials.`,
  skills: AcademicTutorSkills,
  commands: [
    makeMaterialCommands(materialRepository, budgetRef),
    makeArtifactCommands(artifactRepository, rateLimiter, clientKey)
  ]
});

export const academicTutorAgent = Effect.gen(function* () {
  const provider = yield* AiModel.ProviderName;
  const modelName = yield* AiModel.ModelName;
  const sessionRepository = yield* SessionRepository;
  const materialRepository = yield* MaterialRepository;
  const artifactRepository = yield* ArtifactRepository;
  const task = process.argv.slice(2).join(" ").trim() || "List my uploaded materials.";
  const sessionId = process.env.AGENT_SESSION_ID ?? "academic-tutor-demo";
  const storedSession = yield* sessionRepository.getSession(sessionId).pipe(
    Effect.catchTag("SessionNotFound", () => sessionRepository.makeSession({ id: sessionId }))
  );

  const budgetRef = yield* Ref.make(initialTurnBudgetState);
  const rateLimiter = yield* makeRateLimiter();
  const harness = makeAcademicTutorHarness(materialRepository, artifactRepository, budgetRef, rateLimiter, sessionId);
  const session = AgentSession.make(harness);

  console.log(`Provider: ${provider}`);
  console.log(`Model: ${modelName}`);
  console.log(`Session: ${sessionId}`);
  console.log("Conversation messages:");

  const messages = yield* session.stream({
    input: task,
    messages: storedSession.messages,
    maxSteps: 8
  }).pipe(
    Stream.provide(harness.layer),
    Stream.tap((message) => Effect.gen(function* () {
      yield* sessionRepository.appendMessages({
        sessionId,
        messages: [message]
      });
      yield* Console.log(JSON.stringify(message, null, 2));
    })),
    Stream.runCollect
  );

  let output = "";
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === "assistant") {
      output = message.content;
      break;
    }
  }

  console.log(output);

  return output;
}).pipe(
  Effect.provide(Layer.mergeAll(
    GeminiModel,
    FileSessionRepository.layer(".data/agent-sessions").pipe(
      Layer.provide(NodeServices.layer)
    ),
    FileMaterialRepository.layer(".data/materials/pdfs").pipe(
      Layer.provide(PopplerPdfService.layer),
      Layer.provide(FileMaterialIndexRepository.layer(".data/materials/index")),
      Layer.provide(IndexingServiceLive.pipe(Layer.provide(PopplerPdfService.layer), Layer.provide(NodeServices.layer))),
      Layer.provide(NodeServices.layer)
    ),
    FileArtifactRepository.layer(".data/artifacts").pipe(
      Layer.provide(NodeServices.layer)
    )
  ))
);

if (import.meta.main) {
  Effect.runPromise(academicTutorAgent);
}
