import { Console, Effect, Layer, Ref, Stream } from "effect";
import { Model as AiModel } from "effect/unstable/ai";
import { LIMITS } from "@proxus/shared";
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
import { makeProfileCommands } from "./academic-tutor/profile-commands.ts";
import { make as makeNoteService } from "../artifacts/note-service.ts";
import {
  make as makeStudyProfileService,
  StudyProfileRepository,
  type StudyProfileService
} from "../profile/study-profile.ts";
import { FileStudyProfileRepository } from "../../infra/profile/file-study-profile-repository.ts";
import { AcademicTutorSkills } from "./academic-tutor/skills/index.ts";
import { initialTurnBudgetState, type TurnBudgetState } from "../limits/turn-budget.ts";
import { make as makeRateLimiter, type RateLimiter } from "../limits/rate-limiter.ts";

export const makeAcademicTutorHarness = (
  materialRepository: MaterialRepository,
  artifactRepository: ArtifactRepository,
  studyProfileService: StudyProfileService,
  budgetRef: Ref.Ref<TurnBudgetState>,
  rateLimiter: RateLimiter,
  clientKey: string
) => AgentHarness.make({
  // Plantilla provisional (fase 4, tramo 4C): conserva el texto de hoy, solo movido desde el arnés
  // hasta aquí y con el hueco `{{SKILLS}}`. El texto canónico de la sección 6.1 del plan llega en el
  // tramo 4E (paso 15); no se adelanta aquí para no reabrir esa decisión antes de tiempo.
  systemPromptTemplate: `You are an academic tutor agent.

You help students understand academic material, especially their uploaded PDF materials.
Be precise, pedagogical, and honest about what you can infer from the available materials.

You have access to a CLI tool. Use --help when you need command usage, subcommands, or examples.

Available skills:
{{SKILLS}}`,
  skills: AcademicTutorSkills,
  commands: [
    makeMaterialCommands(materialRepository, budgetRef),
    makeArtifactCommands(
      artifactRepository,
      makeNoteService(artifactRepository, materialRepository),
      rateLimiter,
      clientKey
    ),
    makeProfileCommands(studyProfileService)
  ]
});

export const academicTutorAgent = Effect.gen(function* () {
  const provider = yield* AiModel.ProviderName;
  const modelName = yield* AiModel.ModelName;
  const sessionRepository = yield* SessionRepository;
  const materialRepository = yield* MaterialRepository;
  const artifactRepository = yield* ArtifactRepository;
  const studyProfileRepository = yield* StudyProfileRepository;
  const studyProfileService = makeStudyProfileService(studyProfileRepository, artifactRepository, materialRepository);
  const task = process.argv.slice(2).join(" ").trim() || "List my uploaded materials.";
  const sessionId = process.env.AGENT_SESSION_ID ?? "academic-tutor-demo";
  const storedSession = yield* sessionRepository.getSession(sessionId).pipe(
    Effect.catchTag("SessionNotFound", () => sessionRepository.makeSession({ id: sessionId }))
  );

  const budgetRef = yield* Ref.make(initialTurnBudgetState);
  const rateLimiter = yield* makeRateLimiter();
  const harness = makeAcademicTutorHarness(materialRepository, artifactRepository, studyProfileService, budgetRef, rateLimiter, sessionId);
  const session = AgentSession.make(harness);

  console.log(`Provider: ${provider}`);
  console.log(`Model: ${modelName}`);
  console.log(`Session: ${sessionId}`);
  console.log("Conversation messages:");

  const messages = yield* session.stream({
    input: task,
    messages: storedSession.messages,
    maxSteps: LIMITS.maxAgentSteps
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
    ),
    FileStudyProfileRepository.layer(".data/profile").pipe(
      Layer.provide(NodeServices.layer)
    )
  ))
);

if (import.meta.main) {
  Effect.runPromise(academicTutorAgent);
}
