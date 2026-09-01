import { Console, Context, Data, Effect, Layer, Ref, Schema } from "effect";
import { ChatContextRef, LIMITS, type StudyProfile } from "@proxus/shared";
import { GeminiModel } from "../../gemini.ts";
import { AgentSession, renderScreenContext } from "../../harness/index.ts";
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

// Este eval se llamó `artifact-authoring.eval.ts` desde la fase 3, cuando lo único que comprobaba era
// que el tutor no se atribuyera la autoría de una prueba. La fase 4 le añade comportamientos que no
// tienen nada que ver con autoría (idioma, seguimiento, elección de skill, contexto de pantalla): el
// nombre llevaba dos fases equivocado (fase 4, tramo 4G, paso 19b). Las 4 comprobaciones originales
// se quedan tal cual; las 4 nuevas van detrás.
//
// La decisión 4 quitó al tutor la autoría de pruebas; la 7, la entrega y la corrección. Este eval ya
// no comprueba que cree un quiz, sino lo contrario: que NO diga que lo ha creado, que remita a la
// pestaña "Pruebas", y que al recomendar repaso nombre el tema y la señal del perfil que lo trae
// (invariante 5, §7.3).
const ReviewSignal = Schema.Union([
  Schema.Literal("wrong"),
  Schema.Literal("hint"),
  Schema.Literal("emphasis")
]);

const TutorBehaviourExpected = Schema.Struct({
  mustNotClaimAuthoring: Schema.Boolean,
  mustPointToTab: Schema.optional(Schema.Boolean),
  mustNameTopic: Schema.optional(Schema.String),
  mustNameSignal: Schema.optional(ReviewSignal),
  // Decisión 9 (fase 4, tramo 4G, paso 19b): entrada en inglés, salida en español.
  mustAnswerInSpanish: Schema.optional(Schema.Boolean),
  // Decisión 8: el bloque de seguimiento son exactamente `LIMITS.followUpQuestions` preguntas en
  // español, nunca menos completadas ni más recortadas.
  mustHaveFollowUp: Schema.optional(Schema.Boolean),
  // Distingue las dos skills que reemplazaron a `use-study-assessments` (decisión 17): cuál debe
  // cargar el tutor y, opcionalmente, cuál NO debe cargar por confundirla con la otra.
  mustLoadSkill: Schema.optional(Schema.String),
  mustNotLoadSkill: Schema.optional(Schema.String),
  // El contexto de pantalla (decisión 5, §6.2) ya trae el id del material: no hay que pedirle al
  // tutor que lo redescubra con `materials list`.
  mustNotRelistMaterials: Schema.optional(Schema.Boolean)
});
type TutorBehaviourExpected = typeof TutorBehaviourExpected.Type;

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

const TutorBehaviourEvalCase = Schema.Struct({
  id: EvalCaseId,
  input: Schema.String,
  expected: TutorBehaviourExpected,
  materials: Schema.optional(Schema.Array(MaterialFixture)),
  profile: Schema.optional(Schema.Array(SeededTopicProfile)),
  // Fase 4, tramo 4G, paso 19b: mismo `ChatContextRef` que manda `tutor-chat-service.ts`, para
  // reproducir el caso "el material ya está en pantalla".
  context: Schema.optional(Schema.Array(ChatContextRef)),
  maxSteps: Schema.optional(Schema.Number)
});
type TutorBehaviourEvalCase = typeof TutorBehaviourEvalCase.Type;

const TutorBehaviourEvalDataset = Schema.Struct({
  id: EvalId,
  description: Schema.String,
  cases: Schema.Array(TutorBehaviourEvalCase)
});
type TutorBehaviourEvalDataset = typeof TutorBehaviourEvalDataset.Type;

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
  readonly dataset: TutorBehaviourEvalDataset;
  readonly case: TutorBehaviourEvalCase;
  readonly output: string;
  readonly messages: readonly AgentMessage[];
  readonly followUpQuestions: readonly string[];
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

    const deleteAttempt = (id: string): Effect.Effect<void, ArtifactRepositoryError> =>
      Ref.update(ref, (state) => ({
        ...state,
        attempts: state.attempts.filter((candidate) => candidate.id !== id)
      }));

    return ArtifactRepository.of({
      deleteArtifact,
      saveArtifact,
      getArtifact,
      listArtifacts,
      saveAttempt,
      getAttempt,
      listAttempts,
      deleteAttempt
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
  reindex: (id) => Effect.fail(new MaterialIndexingFailed({ materialId: id, reason: "el eval no indexa materiales" })),
  upload: () => Effect.die("stub: upload no debería llamarse en este eval"),
  validate: () => Effect.die("stub: validate no debería llamarse en este eval"),
  remove: () => Effect.die("stub: remove no debería llamarse en este eval")
});

const toPdfMaterial = (material: MaterialFixture): PdfMaterial => ({
  id: material.id,
  title: material.title,
  fileName: material.fileName,
  pageCount: material.pages.length,
  uploadedAt: material.uploadedAt,
  indexState: "not-indexed"
});

const makeEvalLayer = (testCase: TutorBehaviourEvalCase) => Layer.mergeAll(
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
    // Iván (2026-09-01): "Controles y/o Exámenes" vale igual que "Pruebas" (mismo sitio de la interfaz,
    // solo cambia el vocabulario). El regex acepta cualquier mención de "pestaña" cerca de esos nombres,
    // en vez de forzar el nombre literal o una conjunción concreta ("Controles" o "Exámenes" separados
    // por "o" cuenta igual que "Controles y Exámenes").
    const mentionsTab = /pesta[ñn]a[^.]*(pruebas|controles|ex[aá]menes)|\bpruebas\b[^.]*(pesta[ñn]a|tab|material)|en\s+"?pruebas"?|controles?[^.]*ex[aá]menes|ex[aá]menes[^.]*controles?/i.test(context.output);
    return Effect.succeed(mentionsTab
      ? passed("should-point-to-tab", "The tutor points the student to the tests screen.")
      : failed("should-point-to-tab", "The tutor does not send the student to the tests screen.", { output: context.output }));
  }
});

// Fase 4, tramo 4E (bitácora 2026-08-31): "wrong" solo casaba `fallaste|fallad|fallos|te
// equivocaste`, y el modelo real dice "3 respuestas incorrectas" o "has fallado 3 preguntas". 19b
// amplía el regex contra el comportamiento observado, no solo añade los criterios nuevos.
const SIGNAL_PHRASE: Record<"wrong" | "hint" | "emphasis", RegExp> = {
  wrong: /fallaste|fallad|fallos|te equivocaste|incorrecta|incorrecto|respuestas? mal|erróneas?/i,
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

// --- las 4 comprobaciones nuevas de la fase 4 (tramo 4G, paso 19b) ------------------------------

// Un indicio de inglés que un texto en español no produce por accidente: pronombres y artículos
// ingleses de una sola palabra. No se usan palabras que puedan colarse como vocabulario propio del
// material (el prompt del tutor prohíbe traducir ese vocabulario a propósito).
const ENGLISH_TELL = /\b(the|you|your|this|that|with|and|is|are|have|has|will|would|should|about|what|how|because)\b/i;
const SPANISH_TELL = /\b(el|la|los|las|que|para|con|es|est[áa]|una|uno|de|del|puedes|debes)\b/i;

const isSpanish = (text: string): boolean => !ENGLISH_TELL.test(text) && SPANISH_TELL.test(text);

const shouldAnswerInSpanish = (): AcceptanceCriterion => ({
  id: "should-answer-in-spanish",
  evaluate: (context) => {
    if (context.case.expected.mustAnswerInSpanish !== true) {
      return Effect.succeed(passed("should-answer-in-spanish", "Not checked for this case."));
    }
    return Effect.succeed(isSpanish(context.output)
      ? passed("should-answer-in-spanish", "The reply is in Spanish.")
      : failed("should-answer-in-spanish", "The reply is not in Spanish (English input, decision 9).", { output: context.output }));
  }
});

const shouldGiveWellFormedFollowUp = (): AcceptanceCriterion => ({
  id: "should-give-well-formed-follow-up",
  evaluate: (context) => {
    if (context.case.expected.mustHaveFollowUp !== true) {
      return Effect.succeed(passed("should-give-well-formed-follow-up", "Not checked for this case."));
    }
    const { followUpQuestions } = context;
    if (followUpQuestions.length !== LIMITS.followUpQuestions) {
      return Effect.succeed(failed(
        "should-give-well-formed-follow-up",
        `Expected exactly ${LIMITS.followUpQuestions} follow-up questions, got ${followUpQuestions.length}.`,
        { followUpQuestions }
      ));
    }
    const notSpanish = followUpQuestions.filter((question) => !isSpanish(question));
    if (notSpanish.length > 0) {
      return Effect.succeed(failed("should-give-well-formed-follow-up", "A follow-up question is not in Spanish.", { notSpanish }));
    }
    return Effect.succeed(passed("should-give-well-formed-follow-up", `Exactly ${LIMITS.followUpQuestions} follow-up questions, all in Spanish.`));
  }
});

const shouldLoadTheRightSkill = (): AcceptanceCriterion => ({
  id: "should-load-the-right-skill",
  evaluate: (context) => {
    const { mustLoadSkill, mustNotLoadSkill } = context.case.expected;
    if (mustLoadSkill === undefined && mustNotLoadSkill === undefined) {
      return Effect.succeed(passed("should-load-the-right-skill", "Not checked for this case."));
    }
    const loadedSkills = context.messages
      .filter((message) => message.role === "tool-call" && message.name === "load_skill")
      .map((message) => (message as { readonly input: unknown }).input)
      .filter((input): input is { readonly name: string } => typeof input === "object" && input !== null && "name" in input)
      .map((input) => input.name);

    if (mustLoadSkill !== undefined && !loadedSkills.includes(mustLoadSkill)) {
      return Effect.succeed(failed("should-load-the-right-skill", `Expected the tutor to load skill "${mustLoadSkill}".`, { loadedSkills }));
    }
    if (mustNotLoadSkill !== undefined && loadedSkills.includes(mustNotLoadSkill)) {
      return Effect.succeed(failed("should-load-the-right-skill", `The tutor should not have loaded skill "${mustNotLoadSkill}".`, { loadedSkills }));
    }
    return Effect.succeed(passed("should-load-the-right-skill", `Loaded skills: ${loadedSkills.join(", ")}.`));
  }
});

const MATERIALS_LIST_COMMAND = /^\s*materials\s+list\b/i;

const shouldNotRelistWhatScreenContextAlreadyGives = (): AcceptanceCriterion => ({
  id: "should-not-relist-materials-with-screen-context",
  evaluate: (context) => {
    if (context.case.expected.mustNotRelistMaterials !== true) {
      return Effect.succeed(passed("should-not-relist-materials-with-screen-context", "Not checked for this case."));
    }
    const relisted = context.messages.some((message) => {
      if (message.role !== "tool-call" || message.name !== "cli") {
        return false;
      }
      const input = message.input;
      return typeof input === "object" && input !== null && "input" in input
        && typeof (input as { readonly input: unknown }).input === "string"
        && MATERIALS_LIST_COMMAND.test((input as { readonly input: string }).input);
    });
    return Effect.succeed(relisted
      ? failed("should-not-relist-materials-with-screen-context", "The tutor ran `materials list` even though the material was already in the screen context.", { messages: context.messages })
      : passed("should-not-relist-materials-with-screen-context", "The tutor did not re-request what the screen context already gave it."));
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

const dataset = TutorBehaviourEvalDataset.make({
  id: "academic-tutor.behaviour",
  description: "Comportamientos deterministas del tutor: no se atribuye autoría (decisiones 4 y 7), responde en español a una entrada en inglés y cierra con tres preguntas de seguimiento (decisiones 8 y 9), carga la skill que corresponde entre las que reemplazan a use-study-assessments (decisión 17), y no vuelve a pedir por comando lo que el contexto de pantalla ya le dio (decisión 5).",
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
    },
    {
      id: "responde-en-espanol-con-seguimiento-a-entrada-en-ingles",
      input: "In one short paragraph, what is a derivative? No need to look anything up, general knowledge is fine.",
      expected: { mustNotClaimAuthoring: true, mustAnswerInSpanish: true, mustHaveFollowUp: true },
      maxSteps: 4
    },
    {
      id: "elige-review-progress-no-read-assessments",
      input: "¿Qué llevo peor en el material calculo y qué debería repasar?",
      expected: { mustNotClaimAuthoring: true, mustLoadSkill: "review-progress", mustNotLoadSkill: "read-assessments" },
      materials: [calculo],
      profile: [
        { topicId: "derivadas", topicLabel: "Derivadas", correct: 1, incorrect: 3, unevaluated: 0, blank: 0, hintsRevealed: 0, emphasis: false }
      ],
      maxSteps: 6
    },
    {
      id: "elige-read-assessments-no-review-progress",
      input: "Enséñame las preguntas y las respuestas correctas de mis Controles guardados.",
      expected: { mustNotClaimAuthoring: true, mustLoadSkill: "read-assessments", mustNotLoadSkill: "review-progress" },
      maxSteps: 6
    },
    {
      id: "no-relista-materiales-con-contexto-en-pantalla",
      input: "¿Qué dice este material sobre las derivadas?",
      expected: { mustNotClaimAuthoring: true, mustNotRelistMaterials: true },
      materials: [calculo],
      context: [{ type: "material", materialId: "calculo", title: "Cálculo I" }],
      maxSteps: 6
    }
  ]
});

const criteria = [
  shouldNotClaimAuthoring(),
  shouldPointToTab(),
  shouldNameTopicAndSignal(),
  shouldNotHaveToolFailures(),
  shouldAnswerInSpanish(),
  shouldGiveWellFormedFollowUp(),
  shouldLoadTheRightSkill(),
  shouldNotRelistWhatScreenContextAlreadyGives()
] as const;

const runEvalCase = (
  evalDataset: TutorBehaviourEvalDataset,
  testCase: TutorBehaviourEvalCase
) => Effect.gen(function* () {
  const materialRepository = yield* MaterialRepository;
  const artifactRepository = yield* ArtifactRepository;
  const studyProfileService = yield* StudyProfileService;
  const budgetRef = yield* Ref.make(initialTurnBudgetState);
  const rateLimiter = yield* makeRateLimiter();
  const harness = makeAcademicTutorHarness(materialRepository, artifactRepository, studyProfileService, budgetRef, rateLimiter, "eval");
  const session = AgentSession.make(harness);

  // Mismo ensamblado que `tutor-chat-service.ts`: el contexto de pantalla viaja al final del mensaje
  // del usuario, nunca en el system prompt (decisión 11).
  const screenContext = testCase.context === undefined ? undefined : renderScreenContext(testCase.context);
  const turnInput = screenContext === undefined ? testCase.input : `${testCase.input}\n\n${screenContext}`;

  const result = yield* session.run({
    input: turnInput,
    maxSteps: testCase.maxSteps ?? 8
  }).pipe(Effect.provide(harness.layer));

  const context: EvalCaseContext = {
    dataset: evalDataset,
    case: testCase,
    output: result.output,
    messages: result.messages,
    followUpQuestions: result.followUpQuestions
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

const runDataset = (evalDataset: TutorBehaviourEvalDataset) => Effect.gen(function* () {
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

class TutorBehaviourEvalFailed extends Data.TaggedError("TutorBehaviourEvalFailed")<{}> {}

export const tutorBehaviourEval = runDataset(dataset).pipe(
  Effect.tap((reports) => Console.log(formatReport(reports))),
  Effect.andThen((reports) => reports.some((report) => report.status === "failed")
    ? Effect.fail(new TutorBehaviourEvalFailed())
    : Effect.succeed(reports)
  )
);

if (import.meta.main) {
  Effect.runPromise(tutorBehaviourEval);
}
