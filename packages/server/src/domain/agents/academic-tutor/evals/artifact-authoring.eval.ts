import { Console, Context, Data, Effect, Layer, Ref, Schema } from "effect";
import type { StudyProfile } from "@proxus/shared";
import { GeminiModel } from "../../gemini.ts";
import { AgentSession } from "../../harness/index.ts";
import { type AgentMessage } from "../../harness/message.ts";
import { makeAcademicTutorHarness } from "../../academic-tutor.ts";
import {
  Artifact,
  ArtifactAttempt,
  ArtifactNotFound,
  ArtifactRepository,
  AttemptNotFound,
  type ArtifactListing,
  type ArtifactRepositoryError,
  type ListArtifactsInput
} from "../../../artifacts/artifact.ts";
import {
  MaterialIndexingFailed,
  MaterialNotFound,
  MaterialNotIndexed,
  MaterialRepository,
  type PdfMaterial,
  type RenderedPage
} from "../../../materials/material.ts";
import { StudyProfileService } from "../../../profile/study-profile.ts";
import { initialTurnBudgetState } from "../../../limits/turn-budget.ts";
import { make as makeRateLimiter } from "../../../limits/rate-limiter.ts";

const EvalId = Schema.String;
const EvalCaseId = Schema.String;

const CriterionStatus = Schema.Union([
  Schema.Literal("passed"),
  Schema.Literal("failed")
]);

// La decisión 4 quitó al tutor la autoría de pruebas; la 7, la entrega y la corrección. Este eval ya
// no comprueba que cree un quiz, sino lo contrario: que NO diga que lo ha creado, que remita a la
// pestaña "Pruebas", y que al recomendar repaso nombre el tema y la señal del perfil que lo trae
// (invariante 5, §7.3).
const ReviewSignal = Schema.Union([
  Schema.Literal("wrong"),
  Schema.Literal("hint"),
  Schema.Literal("emphasis")
]);

const ArtifactAuthoringExpected = Schema.Struct({
  mustNotClaimAuthoring: Schema.Boolean,
  mustPointToTab: Schema.optional(Schema.Boolean),
  mustNameTopic: Schema.optional(Schema.String),
  mustNameSignal: Schema.optional(ReviewSignal)
});
type ArtifactAuthoringExpected = typeof ArtifactAuthoringExpected.Type;

const SeededTopicProfile = Schema.Struct({
  topicId: Schema.String,
  topicLabel: Schema.String,
  correct: Schema.Number,
  incorrect: Schema.Number,
  unevaluated: Schema.Number,
  blank: Schema.Number,
  hintsRevealed: Schema.Number,
  emphasis: Schema.Boolean
});

const MaterialPageFixture = Schema.Struct({
  page: Schema.Number,
  text: Schema.String
});
type MaterialPageFixture = typeof MaterialPageFixture.Type;

const MaterialFixture = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  fileName: Schema.String,
  uploadedAt: Schema.String,
  pages: Schema.Array(MaterialPageFixture)
});
type MaterialFixture = typeof MaterialFixture.Type;

const ArtifactAuthoringEvalCase = Schema.Struct({
  id: EvalCaseId,
  input: Schema.String,
  expected: ArtifactAuthoringExpected,
  materials: Schema.optional(Schema.Array(MaterialFixture)),
  profile: Schema.optional(Schema.Array(SeededTopicProfile)),
  maxSteps: Schema.optional(Schema.Number)
});
type ArtifactAuthoringEvalCase = typeof ArtifactAuthoringEvalCase.Type;

const ArtifactAuthoringEvalDataset = Schema.Struct({
  id: EvalId,
  description: Schema.String,
  cases: Schema.Array(ArtifactAuthoringEvalCase)
});
type ArtifactAuthoringEvalDataset = typeof ArtifactAuthoringEvalDataset.Type;

const CriterionResult = Schema.Struct({
  id: Schema.String,
  status: CriterionStatus,
  message: Schema.String,
  details: Schema.optional(Schema.Unknown)
});
type CriterionResult = typeof CriterionResult.Type;

const EvalCaseReport = Schema.Struct({
  evalId: Schema.String,
  caseId: Schema.String,
  status: CriterionStatus,
  output: Schema.String,
  criteria: Schema.Array(CriterionResult)
});
type EvalCaseReport = typeof EvalCaseReport.Type;

type EvalCaseContext = {
  readonly dataset: ArtifactAuthoringEvalDataset;
  readonly case: ArtifactAuthoringEvalCase;
  readonly output: string;
  readonly messages: readonly AgentMessage[];
};

type AcceptanceCriterion = {
  readonly id: string;
  readonly evaluate: (context: EvalCaseContext) => Effect.Effect<CriterionResult, never, ArtifactRepositoryTestRef>;
};

interface ArtifactRepositoryState {
  readonly artifacts: readonly Artifact[];
  readonly attempts: readonly ArtifactAttempt[];
  readonly nextArtifactId: number;
  readonly nextAttemptId: number;
}

class ArtifactRepositoryTestRef extends Context.Service<ArtifactRepositoryTestRef, Ref.Ref<ArtifactRepositoryState>>()(
  "@proxus/server/evals/ArtifactRepositoryTestRef"
) {
  static readonly layer = Layer.effect(
    ArtifactRepositoryTestRef,
    Ref.make<ArtifactRepositoryState>({
      artifacts: [],
      attempts: [],
      nextArtifactId: 1,
      nextAttemptId: 1
    })
  );
}

const InMemoryArtifactRepository = Layer.effect(
  ArtifactRepository,
  Effect.gen(function* () {
    const ref = yield* ArtifactRepositoryTestRef;

    const saveArtifact = (artifact: Artifact): Effect.Effect<void, ArtifactRepositoryError> =>
      Ref.update(ref, (state) => ({
        ...state,
        artifacts: [...state.artifacts.filter((candidate) => candidate.id !== artifact.id), artifact]
      }));

    const deleteArtifact = (id: string): Effect.Effect<void, ArtifactRepositoryError> =>
      Ref.update(ref, (state) => ({
        ...state,
        artifacts: state.artifacts.filter((candidate) => candidate.id !== id)
      }));

    const getArtifact = (id: string): Effect.Effect<Artifact, ArtifactRepositoryError> =>
      Ref.get(ref).pipe(
        Effect.andThen((state) => {
          const artifact = state.artifacts.find((candidate) => candidate.id === id);
          return artifact === undefined
            ? Effect.fail(new ArtifactNotFound({ artifactId: id }))
            : Effect.succeed(artifact);
        })
      );

    const listArtifacts = (input?: ListArtifactsInput): Effect.Effect<ArtifactListing, ArtifactRepositoryError> =>
      Ref.get(ref).pipe(
        Effect.map((state) => ({
          artifacts: input?.kind === undefined
            ? state.artifacts
            : state.artifacts.filter((artifact) => artifact.kind === input.kind),
          unreadable: []
        }))
      );

    const saveAttempt = (attempt: ArtifactAttempt): Effect.Effect<void, ArtifactRepositoryError> =>
      Ref.update(ref, (state) => ({
        ...state,
        attempts: [...state.attempts.filter((candidate) => candidate.id !== attempt.id), attempt]
      }));

    const getAttempt = (id: string): Effect.Effect<ArtifactAttempt, ArtifactRepositoryError> =>
      Ref.get(ref).pipe(
        Effect.andThen((state) => {
          const attempt = state.attempts.find((candidate) => candidate.id === id);
          return attempt === undefined
            ? Effect.fail(new AttemptNotFound({ attemptId: id }))
            : Effect.succeed(attempt);
        })
      );

    const listAttempts = (artifactId?: string): Effect.Effect<readonly ArtifactAttempt[], ArtifactRepositoryError> =>
      Ref.get(ref).pipe(
        Effect.map((state) => artifactId === undefined
          ? state.attempts
          : state.attempts.filter((attempt) => attempt.artifactId === artifactId)
        )
      );

    return ArtifactRepository.of({
      deleteArtifact,
      saveArtifact,
      getArtifact,
      listArtifacts,
      saveAttempt,
      getAttempt,
      listAttempts
    });
  })
).pipe(Layer.provideMerge(ArtifactRepositoryTestRef.layer));

// El perfil de estudio del eval: cada caso lo siembra con las señales que quiera. `sync` no hace
// nada (el eval no entrega intentos).
const seededProfileLayer = (topics: StudyProfile["topics"]) => Layer.succeed(
  StudyProfileService,
  StudyProfileService.of({
    sync: () => Effect.succeed({ materialId: "eval", topics: [], appliedAttemptIds: [], updatedAt: null }),
    read: (materialId) => Effect.succeed({ materialId, topics, updatedAt: null })
  })
);

const makeMaterialRepository = (materials: readonly MaterialFixture[]) => MaterialRepository.of({
  list: () => Effect.succeed(materials.map(toPdfMaterial)),
  get: (id) => {
    const material = materials.find((candidate) => candidate.id === id);
    return material === undefined
      ? Effect.fail(new MaterialNotFound({ materialId: id }))
      : Effect.succeed(toPdfMaterial(material));
  },
  renderPage: (id, page) => {
    const material = materials.find((candidate) => candidate.id === id);
    if (material === undefined) {
      return Effect.fail(new MaterialNotFound({ materialId: id }));
    }

    const fixturePage = material.pages.find((candidate) => candidate.page === page);
    return Effect.succeed<RenderedPage>({
      material: toPdfMaterial(material),
      image: {
        page,
        mediaType: "image/png" as const,
        data: `data:image/png;base64,${btoa(fixturePage?.text ?? `Page ${page}`)}`
      }
    });
  },
  getIndex: (id) => {
    const material = materials.find((candidate) => candidate.id === id);
    if (material === undefined) {
      return Effect.fail(new MaterialNotFound({ materialId: id }));
    }
    if (material.pages.length === 0) {
      return Effect.fail(new MaterialNotIndexed({ materialId: id }));
    }
    return Effect.succeed({
      materialId: material.id,
      fileName: material.fileName,
      contentHash: `eval-${material.id}`,
      pageCount: material.pages.length,
      indexedAt: material.uploadedAt,
      threshold: 600,
      topics: [],
      pages: material.pages.map((page) => ({
        page: page.page,
        provenance: "extracted" as const,
        text: page.text,
        denseCharacters: page.text.length,
        topicIds: [] as readonly string[]
      })),
      failedPages: []
    });
  },
  reindex: (id) => Effect.fail(new MaterialIndexingFailed({ materialId: id, reason: "el eval no indexa materiales" }))
});

const toPdfMaterial = (material: MaterialFixture): PdfMaterial => ({
  id: material.id,
  title: material.title,
  fileName: material.fileName,
  pageCount: material.pages.length,
  uploadedAt: material.uploadedAt,
  indexState: "not-indexed"
});

const makeEvalLayer = (testCase: ArtifactAuthoringEvalCase) => Layer.mergeAll(
  InMemoryArtifactRepository,
  Layer.succeed(MaterialRepository, makeMaterialRepository(testCase.materials ?? [])),
  seededProfileLayer(testCase.profile ?? []),
  GeminiModel
);

// El tutor no debe decir que ha creado, entregado ni corregido nada (decisiones 4 y 7).
const CLAIMS_AUTHORING = /(he creado|he generado|te he hecho|aquí tienes (tu|el|un)|acabo de crear|he preparado (el|un|tu)|created (a|the|your)|generated (a|the))\s+(quiz|test|control|examen|prueba)/i;

const shouldNotClaimAuthoring = (): AcceptanceCriterion => ({
  id: "should-not-claim-authoring",
  evaluate: (context) => Effect.gen(function* () {
    if (context.case.expected.mustNotClaimAuthoring !== true) {
      return passed("should-not-claim-authoring", "Not checked for this case.");
    }
    const ref = yield* ArtifactRepositoryTestRef;
    const state = yield* Ref.get(ref);
    if (state.artifacts.length > 0) {
      return failed("should-not-claim-authoring", "An artifact was created; the tutor has no command to do that.", state.artifacts);
    }
    return CLAIMS_AUTHORING.test(context.output)
      ? failed("should-not-claim-authoring", "The tutor claims it authored an assessment.", { output: context.output })
      : passed("should-not-claim-authoring", "The tutor does not claim to have authored anything.");
  })
});

const shouldPointToTab = (): AcceptanceCriterion => ({
  id: "should-point-to-tab",
  evaluate: (context) => {
    if (context.case.expected.mustPointToTab !== true) {
      return Effect.succeed(passed("should-point-to-tab", "Not checked for this case."));
    }
    const mentionsTab = /pesta[ñn]a[^.]*pruebas|\bpruebas\b[^.]*(pesta[ñn]a|tab|material)|en\s+"?pruebas"?/i.test(context.output);
    return Effect.succeed(mentionsTab
      ? passed("should-point-to-tab", "The tutor points the student to the \"Pruebas\" tab.")
      : failed("should-point-to-tab", "The tutor does not send the student to the \"Pruebas\" tab.", { output: context.output }));
  }
});

const SIGNAL_PHRASE: Record<"wrong" | "hint" | "emphasis", RegExp> = {
  wrong: /fallaste|fallad|fallos|te equivocaste/i,
  hint: /pista/i,
  emphasis: /marcaste|marcad|import/i
};

const shouldNameTopicAndSignal = (): AcceptanceCriterion => ({
  id: "should-name-topic-and-signal",
  evaluate: (context) => {
    const { mustNameTopic, mustNameSignal } = context.case.expected;
    if (mustNameTopic === undefined && mustNameSignal === undefined) {
      return Effect.succeed(passed("should-name-topic-and-signal", "Not checked for this case."));
    }
    const output = context.output.toLocaleLowerCase();
    if (mustNameTopic !== undefined && !output.includes(mustNameTopic.toLocaleLowerCase())) {
      return Effect.succeed(failed("should-name-topic-and-signal", `The answer does not name the topic "${mustNameTopic}".`, { output: context.output }));
    }
    if (mustNameSignal !== undefined && !SIGNAL_PHRASE[mustNameSignal].test(context.output)) {
      return Effect.succeed(failed("should-name-topic-and-signal", `The answer does not name the "${mustNameSignal}" signal.`, { output: context.output }));
    }
    return Effect.succeed(passed("should-name-topic-and-signal", "The answer names the topic and the signal that brought it."));
  }
});

const shouldNotHaveToolFailures = (): AcceptanceCriterion => ({
  id: "should-not-have-tool-failures",
  evaluate: (context) => {
    const failures = context.messages.filter((message) => message.role === "tool-result" && message.isFailure);
    return Effect.succeed(failures.length === 0
      ? passed("should-not-have-tool-failures", "No tool failures were produced.")
      : failed("should-not-have-tool-failures", "Expected no tool failures.", failures)
    );
  }
});

const passed = (id: string, message: string, details?: unknown): CriterionResult =>
  CriterionResult.make({ id, status: "passed", message, details });

const failed = (id: string, message: string, details?: unknown): CriterionResult =>
  CriterionResult.make({ id, status: "failed", message, details });

const calculo: MaterialFixture = {
  id: "calculo",
  title: "Cálculo I",
  fileName: "calculo.pdf",
  uploadedAt: "2026-08-01T00:00:00.000Z",
  pages: [
    { page: 1, text: "La derivada de una función mide su tasa de cambio instantánea. ".repeat(20) },
    { page: 2, text: "El límite de una función describe su comportamiento cerca de un punto. ".repeat(20) }
  ]
};

const dataset = ArtifactAuthoringEvalDataset.make({
  id: "academic-tutor.artifact-authoring",
  description: "The tutor does NOT author or grade assessments (decisions 4 and 7): it points the student to the \"Pruebas\" tab and, when recommending review, names the profile signal that brought a topic.",
  cases: [
    {
      id: "no-autora-remite-a-la-pestana",
      input: "Hazme un test de 5 preguntas sobre este material y corrígemelo.",
      expected: { mustNotClaimAuthoring: true, mustPointToTab: true },
      materials: [calculo],
      maxSteps: 6
    },
    {
      id: "lee-el-perfil-y-nombra-la-senal",
      input: "¿Qué llevo peor del material calculo? ¿Qué debería repasar?",
      expected: { mustNotClaimAuthoring: true, mustNameTopic: "Derivadas", mustNameSignal: "wrong" },
      materials: [calculo],
      profile: [
        { topicId: "derivadas", topicLabel: "Derivadas", correct: 1, incorrect: 3, unevaluated: 0, blank: 0, hintsRevealed: 0, emphasis: false },
        { topicId: "limites", topicLabel: "Límites", correct: 4, incorrect: 0, unevaluated: 0, blank: 0, hintsRevealed: 0, emphasis: false }
      ],
      maxSteps: 6
    }
  ]
});

const criteria = [
  shouldNotClaimAuthoring(),
  shouldPointToTab(),
  shouldNameTopicAndSignal(),
  shouldNotHaveToolFailures()
] as const;

const runEvalCase = (
  evalDataset: ArtifactAuthoringEvalDataset,
  testCase: ArtifactAuthoringEvalCase
) => Effect.gen(function* () {
  const materialRepository = yield* MaterialRepository;
  const artifactRepository = yield* ArtifactRepository;
  const studyProfileService = yield* StudyProfileService;
  const budgetRef = yield* Ref.make(initialTurnBudgetState);
  const rateLimiter = yield* makeRateLimiter();
  const harness = makeAcademicTutorHarness(materialRepository, artifactRepository, studyProfileService, budgetRef, rateLimiter, "eval");
  const session = AgentSession.make(harness);
  const result = yield* session.run({
    input: testCase.input,
    maxSteps: testCase.maxSteps ?? 8
  }).pipe(Effect.provide(harness.layer));

  const context: EvalCaseContext = {
    dataset: evalDataset,
    case: testCase,
    output: result.output,
    messages: result.messages
  };

  const criterionResults = yield* Effect.all(
    criteria.map((criterion) => criterion.evaluate(context)),
    { concurrency: 1 }
  );
  const status = criterionResults.every((criterion) => criterion.status === "passed") ? "passed" : "failed";

  return EvalCaseReport.make({
    evalId: evalDataset.id,
    caseId: testCase.id,
    status,
    output: result.output,
    criteria: criterionResults
  });
});

const runDataset = (evalDataset: ArtifactAuthoringEvalDataset) => Effect.gen(function* () {
  const reports: EvalCaseReport[] = [];

  for (const testCase of evalDataset.cases) {
    const report = yield* runEvalCase(evalDataset, testCase).pipe(
      Effect.provide(makeEvalLayer(testCase))
    );
    reports.push(report);
  }

  return reports;
});

const formatReport = (reports: readonly EvalCaseReport[]) => {
  const lines: string[] = [dataset.id];

  for (const report of reports) {
    lines.push(`  ${report.status === "passed" ? "✓" : "✗"} ${report.caseId}`);
    for (const criterion of report.criteria) {
      lines.push(`    ${criterion.status === "passed" ? "✓" : "✗"} ${criterion.id}: ${criterion.message}`);
      if (criterion.status === "failed" && criterion.details !== undefined) {
        lines.push(`      ${JSON.stringify(criterion.details, null, 2).split("\n").join("\n      ")}`);
      }
    }
  }

  return lines.join("\n");
};

class ArtifactAuthoringEvalFailed extends Data.TaggedError("ArtifactAuthoringEvalFailed")<{}> {}

export const artifactAuthoringEval = runDataset(dataset).pipe(
  Effect.tap((reports) => Console.log(formatReport(reports))),
  Effect.andThen((reports) => reports.some((report) => report.status === "failed")
    ? Effect.fail(new ArtifactAuthoringEvalFailed())
    : Effect.succeed(reports)
  )
);

if (import.meta.main) {
  Effect.runPromise(artifactAuthoringEval);
}
