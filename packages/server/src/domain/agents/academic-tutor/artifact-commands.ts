import { Effect, Schema } from "effect";
import { RateLimited } from "@proxus/shared";
import * as AgentCli from "../harness/index.ts";
import {
  ArtifactRepositorySerializationError,
  type Artifact,
  type ArtifactAttempt,
  type ArtifactListing,
  type ArtifactRepository,
  type ArtifactRepositoryError,
  type NoteArtifact,
  type NoteBlock
} from "../../artifacts/artifact.ts";
import type { RateLimiter } from "../../limits/rate-limiter.ts";
import { ProposeNoteChangeInput, type NoteService } from "../../artifacts/note-service.ts";

// Fase 3, decisión 4 y 7: el tutor NO crea Controles ni Exámenes, ni entrega, ni corrige intentos.
// Esos comandos (`artifacts create`, `artifacts submit`, `artifacts grade`) se retiran: solo el
// alumno, desde la interfaz, genera intentos que muevan el perfil (§1.3, invariante 4 impuesta en el
// código). Aquí quedan la lectura (`list`, `show`, `block`, `attempts`) y la propuesta de cambios en
// un apunte, que el alumno acepta o descarta (ADR-014).

const ProposeNoteChangeInputFromJson = Schema.fromJsonString(ProposeNoteChangeInput);

// El `excerpt` de la fuente de un bloque es texto del material cacheado para la interfaz (invariante
// 8): el agente no lo necesita, no puede rellenarlo y en un apunte largo son decenas de KB. Se quita
// al enseñar el apunte por el CLI, dejando el resto de la fuente (páginas, id del material).
const leanBlock = (block: NoteBlock) => {
  if (block.source === null) {
    return block;
  }
  const { excerpt: _excerpt, excerptTruncated: _excerptTruncated, ...source } = block.source;
  return { ...block, source };
};

// La primera línea de encabezado del bloque, sin los `#`. Es lo que la interfaz enseña como título
// del bloque y lo que el alumno nombra al hablar de él.
const noteHeading = (markdown: string): string => {
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const heading = trimmed.replace(/^#{1,6}\s+/, "").trim();
    return heading.length > 80 ? `${heading.slice(0, 77)}...` : heading;
  }
  return "(no heading)";
};

const blockSourceLabel = (block: NoteBlock): string => {
  if (block.source === null) {
    return "no source";
  }
  if (block.source.type === "material") {
    return block.source.pages.length === 0
      ? "material (no pages)"
      : `material p.${block.source.pages.join(",")}`;
  }
  try {
    return `url ${new URL(block.source.url).hostname}`;
  } catch {
    return "url";
  }
};

// El índice del apunte: una línea por bloque con lo justo para elegir cuál leer entero
// (`artifacts block`). Sustituye al volcado del markdown completo de cada bloque, que en un apunte
// largo son decenas de miles de tokens que el turno casi nunca necesita.
export const renderNoteOutline = (note: NoteArtifact): string => {
  const header =
    `note ${note.id}: "${note.title}" (material: ${note.materialId})\n` +
    `${note.blocks.length} blocks, ${note.proposals.length} pending proposals`;
  const blocks = note.blocks.length === 0
    ? "\n\n(no blocks yet)"
    : "\n\n" + note.blocks.map((block) => {
        const tags = [block.author, block.emphasis ? "emphasis" : undefined].filter(Boolean).join(", ");
        return `- ${block.id}  ${noteHeading(block.markdown)}  [${tags}]  ${blockSourceLabel(block)}  · ${block.markdown.length} chars`;
      }).join("\n");
  const proposals = note.proposals.length === 0
    ? ""
    : "\n\nPending proposals:\n" +
      note.proposals.map((proposal) => `- ${proposal.id}  ${proposal.operation.type}  "${proposal.rationale}"`).join("\n");
  const hint = `\n\nRead a block's full text: artifacts block ${note.id} <blockId>  (comma-separate ids for several)`;
  return `${header}${blocks}${proposals}${hint}`;
};

// El texto completo de bloques concretos, sin el `excerpt` cacheado (invariante 8). Es a `artifacts
// show` lo que `materials view` a `materials read`: el detalle caro, solo el que se pide.
export const renderNoteBlocks = (note: NoteArtifact, blockIds: readonly string[]): string => {
  const found: string[] = [];
  const missing: string[] = [];
  for (const id of blockIds) {
    const block = note.blocks.find((candidate) => candidate.id === id);
    if (block === undefined) {
      missing.push(id);
    } else {
      found.push(JSON.stringify(leanBlock(block), null, 2));
    }
  }
  return [
    found.length === 0 ? undefined : found.join("\n\n"),
    missing.length === 0 ? undefined : `Not in note ${note.id}: ${missing.join(", ")}`
  ].filter((part) => part !== undefined).join("\n\n") || `Note ${note.id} has no blocks.`;
};

// Un quiz o un test se enseñan como JSON entero (el tutor los lee para hablar de ellos, no para
// crearlos); un apunte, como su índice de bloques.
const renderArtifact = (artifact: Artifact) =>
  artifact.kind === "note" ? renderNoteOutline(artifact) : JSON.stringify(artifact, null, 2);

const attemptScoreLabel = (attempt: ArtifactAttempt): string => {
  switch (attempt.status) {
    case "graded":
      return `score ${attempt.displayedScore}/10`;
    case "abandoned":
      return attempt.reason === "cancelled" ? "cancelled" : "expired";
    case "in-progress":
      return "in progress";
  }
};

const attemptInstant = (attempt: ArtifactAttempt): string =>
  attempt.status === "graded" ? attempt.submittedAt
    : attempt.status === "abandoned" ? attempt.abandonedAt
    : attempt.startedAt;

// El listado de intentos que ve el tutor: fecha, modo y nota, de solo lectura (decisión 7, §6.10). El
// tutor los cita al hablar de cómo lleva el alumno una prueba; no puede entregar ni corregir.
const renderAttempts = (attempts: readonly ArtifactAttempt[]): string => {
  if (attempts.length === 0) {
    return "No attempts found.";
  }
  return [...attempts]
    .sort((a, b) => attemptInstant(b).localeCompare(attemptInstant(a)))
    .map((attempt) =>
      `- ${attempt.id}  ${attempt.artifactKind} ${attempt.artifactId}  ${attempt.mode}  ${attemptInstant(attempt)}  ${attemptScoreLabel(attempt)}`)
    .join("\n");
};

// El listado que ve el tutor. La línea de un apunte lleva su `materialId`: así el tutor empareja
// "los apuntes de este material" con su id sin adivinar por el título, y de ahí los lee con
// `artifacts show`. Quiz y test no tienen material, así que no llevan sufijo.
export const renderArtifactListing = (listing: ArtifactListing): string => {
  const lines = listing.artifacts.length === 0
    ? "No artifacts found."
    : listing.artifacts
        .map((artifact) => {
          const material = artifact.kind === "note" ? `, material ${artifact.materialId}` : "";
          return `- ${artifact.id}: ${artifact.title} (${artifact.kind})${material}`;
        })
        .join("\n");
  const unreadable = listing.unreadable.length === 0
    ? ""
    : `\n\nUnreadable files (${listing.unreadable.length}): ${listing.unreadable
        .map((file) => `${file.fileName} (${file.reason})`)
        .join(", ")}`;
  return `${lines}${unreadable}`;
};

const renderArtifactError = (error: ArtifactRepositoryError | RateLimited): string => {
  switch (error._tag) {
    case "ArtifactNotFound":
      return `Artifact not found: ${error.artifactId}`;
    case "AttemptNotFound":
      return `Attempt not found: ${error.attemptId}`;
    case "ArtifactTypeMismatch":
      return `Artifact ${error.artifactId} has kind ${error.actual}; expected ${error.expected}`;
    case "QuestionNotFound":
      return `Question not found: ${error.questionId}`;
    case "AnswerTypeMismatch":
      return `Answer type mismatch for question ${error.questionId}: expected ${error.expected}, got ${error.actual}`;
    case "TooManyQuestions":
      return `Artifact ${error.artifactId} has ${error.received} questions; the ceiling is ${error.ceiling}`;
    case "ArtifactRepositoryStorageError":
      return `Artifact repository storage error: ${String(error.reason)}`;
    case "ArtifactRepositorySerializationError":
      return `Invalid artifact JSON: ${String(error.reason)}`;
    case "RateLimited":
      return error.message;
  }
};

// Los errores de `proposeChange` vienen del contrato (`@proxus/shared`) y ya traen `message` en
// español; el de decodificación es del dominio. Todos se enseñan al agente como texto.
const renderProposeError = (error: { readonly _tag: string; readonly message?: string; readonly reason?: unknown }) =>
  error._tag === "ArtifactRepositorySerializationError"
    ? `Invalid proposal JSON: ${String(error.reason)}\n\nUse artifacts note propose --help for an example.`
    : error.message ?? error._tag;

const decodeProposeNoteChangeInput = (json: string) =>
  Schema.decodeUnknownEffect(ProposeNoteChangeInputFromJson)(json).pipe(
    Effect.mapError((reason) => new ArtifactRepositorySerializationError({ reason }))
  );

export const makeArtifactCommands = (
  repository: ArtifactRepository,
  notes: NoteService,
  rateLimiter: RateLimiter,
  clientKey: string
) => {
  const list = AgentCli.Command.withExamples([
    { command: "artifacts list", description: "List all saved artifacts" },
    { command: "artifacts list quiz", description: "List quiz artifacts only" }
  ])(
    AgentCli.Command.withDescription("List saved artifacts")(
      AgentCli.Command.exec("list", {
        kind: AgentCli.Argument.optionalChoice("kind", ["note", "quiz", "test"] as const).pipe(
          AgentCli.Argument.withDescription("Optional artifact kind filter")
        )
      }, ({ kind }) =>
        repository.listArtifacts(kind === undefined ? {} : { kind }).pipe(
          Effect.map(renderArtifactListing),
          Effect.catch((error) => Effect.succeed(renderArtifactError(error)))
        )
      )
    )
  );

  const show = AgentCli.Command.withExamples([
    { command: "artifacts show abc123", description: "Show a quiz or test as JSON, or a note as a block outline" }
  ])(
    AgentCli.Command.withDescription("Show a saved artifact. A note comes back as an outline (block ids, headings, sources); read a block's text with 'artifacts block'")(
      AgentCli.Command.exec("show", {
        artifactId: AgentCli.Argument.string("artifactId")
      }, ({ artifactId }) =>
        repository.getArtifact(artifactId).pipe(
          Effect.map(renderArtifact),
          Effect.catch((error) => Effect.succeed(renderArtifactError(error)))
        )
      )
    )
  );

  const block = AgentCli.Command.withExamples([
    { command: "artifacts block note123 blk-abc", description: "Show the full markdown of one note block" },
    { command: "artifacts block note123 blk-abc,blk-def", description: "Show several blocks (comma-separated ids)" }
  ])(
    AgentCli.Command.withDescription("Show the full text of one or more blocks of a study note")(
      AgentCli.Command.exec("block", {
        artifactId: AgentCli.Argument.string("artifactId"),
        blockIds: AgentCli.Argument.string("blockIds").pipe(
          AgentCli.Argument.withDescription("One block id, or several comma-separated")
        )
      }, ({ artifactId, blockIds }) =>
        repository.getArtifact(artifactId).pipe(
          Effect.map((artifact) => artifact.kind === "note"
            ? renderNoteBlocks(artifact, blockIds.split(",").map((id) => id.trim()).filter((id) => id.length > 0))
            : `Artifact ${artifactId} is a ${artifact.kind}, not a note: it has no blocks.`),
          Effect.catch((error) => Effect.succeed(renderArtifactError(error)))
        )
      )
    )
  );

  const attempts = AgentCli.Command.withExamples([
    { command: "artifacts attempts", description: "List all attempts, newest first" },
    { command: "artifacts attempts abc123", description: "List attempts for one quiz or test" }
  ])(
    AgentCli.Command.withDescription("List quiz and test attempts, read-only: date, mode and score. You cannot submit or grade attempts; the student does that from the interface.")(
      AgentCli.Command.exec("attempts", {
        artifactId: AgentCli.Argument.optionalString("artifactId").pipe(
          AgentCli.Argument.withDescription("Optional artifact id filter")
        )
      }, ({ artifactId }) =>
        repository.listAttempts(artifactId).pipe(
          Effect.map(renderAttempts),
          Effect.catch((error) => Effect.succeed(renderArtifactError(error)))
        )
      )
    )
  );

  // El tutor propone cambios en un apunte; nunca los aplica (ADR-014, F2-26). La propuesta se guarda
  // como pendiente y el alumno la acepta o descarta desde la pestaña Apuntes. No existe ningún
  // comando para aceptar, aplicar ni rechazar una propuesta (F2-27): esa barrera vive en el código,
  // no en el prompt.
  const propose = AgentCli.Command.withExamples([
    {
      command: `artifacts note propose abc123 '{"rationale":"Falta el caso del conjunto vacío","operation":{"type":"insert","afterBlockId":null,"markdown":"## El conjunto vacío\\nEl conjunto vacío no tiene elementos...","source":{"type":"material","materialId":"sets","pages":[4]}}}'`,
      description: "Propose inserting a new block into a note"
    },
    {
      command: `artifacts note propose abc123 '{"rationale":"Esta definición se contradice con la página 3","operation":{"type":"replace","blockId":"<blockId>","markdown":"<full new block text>"}}'`,
      description: "Propose rewriting an existing block"
    }
  ])(
    AgentCli.Command.withDescription("Propose a change to a note. You propose; the student accepts or rejects it.")(
      AgentCli.Command.exec("propose", {
        artifactId: AgentCli.Argument.string("artifactId"),
        json: AgentCli.Argument.string("json").pipe(
          AgentCli.Argument.withDescription("ProposeNoteChangeInput JSON (rationale + operation)")
        )
      }, ({ artifactId, json }) =>
        rateLimiter.check(clientKey, "artifacts").pipe(
          Effect.andThen(() => decodeProposeNoteChangeInput(json)),
          Effect.andThen((input) => notes.proposeChange(artifactId, input)),
          Effect.map((note) => `Proposal saved as pending on note ${note.id}. The student decides whether to apply it.\n\n${renderArtifact(note)}`),
          Effect.catch((error) => Effect.succeed(renderProposeError(error)))
        )
      )
    )
  );

  const note = AgentCli.Command.group("note", [propose] as const).pipe(
    AgentCli.Command.withDescription("Propose changes to a study note")
  );

  return AgentCli.Command.group("artifacts", [list, show, block, attempts, note] as const).pipe(
    AgentCli.Command.withDescription("Study artifacts: read notes, quizzes and tests, and list attempts")
  );
};
