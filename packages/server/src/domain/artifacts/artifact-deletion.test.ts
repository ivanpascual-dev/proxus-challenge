import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import {
  ArtifactRepository,
  ArtifactNotFound,
  AttemptNotFound,
  type Artifact,
  type ArtifactAttempt,
  type QuizArtifact,
  type NoteArtifact
} from "./artifact.ts";
import { deleteArtifactCascade } from "./artifact-deletion.ts";

const quiz: QuizArtifact = {
  kind: "quiz",
  id: "quiz-1",
  title: "Control de Densidad",
  questions: [],
  scope: { materialId: "densidad", topicId: null, topicLabel: "Densidad" },
  origin: "material",
  createdAt: "2026-08-01T00:00:00.000Z",
  examTimeLimitSeconds: 600
};

const otherQuiz: QuizArtifact = { ...quiz, id: "quiz-other" };

const note: NoteArtifact = {
  kind: "note",
  id: "note-1",
  title: "Apuntes de Densidad",
  materialId: "densidad",
  blocks: [],
  proposals: []
};

const attemptOf = (id: string, artifactId: string): ArtifactAttempt => ({
  id,
  artifactId,
  artifactKind: "quiz",
  mode: "practice",
  startedAt: "2026-08-01T00:00:00.000Z",
  timeLimitSeconds: null,
  hintsRevealed: [],
  answers: [],
  connectedSeconds: 0,
  lastHeartbeatAt: null,
  interruptions: [],
  status: "in-progress"
});

const fakeArtifacts = (store: Artifact[], attempts: ArtifactAttempt[] = []): ArtifactRepository => ArtifactRepository.of({
  saveArtifact: () => Effect.die("not used"),
  getArtifact: () => Effect.die("not used"),
  deleteArtifact: (id) => {
    const at = store.findIndex((candidate) => candidate.id === id);
    if (at === -1) {
      return Effect.fail(new ArtifactNotFound({ artifactId: id }));
    }
    store.splice(at, 1);
    return Effect.void;
  },
  listArtifacts: () => Effect.succeed({ artifacts: store, unreadable: [] }),
  saveAttempt: () => Effect.die("not used"),
  getAttempt: () => Effect.die("not used"),
  listAttempts: (artifactId) => Effect.succeed(
    artifactId === undefined ? attempts : attempts.filter((attempt) => attempt.artifactId === artifactId)
  ),
  deleteAttempt: (id) => {
    const at = attempts.findIndex((candidate) => candidate.id === id);
    if (at === -1) {
      return Effect.fail(new AttemptNotFound({ attemptId: id }));
    }
    attempts.splice(at, 1);
    return Effect.void;
  }
});

const run = (artifacts: Artifact[], attempts: ArtifactAttempt[], artifactId: string) =>
  Effect.runPromise(deleteArtifactCascade(fakeArtifacts(artifacts, attempts), artifactId));

test("borra el artefacto y sus intentos, sin tocar los de otro artefacto", async () => {
  const artifacts: Artifact[] = [quiz, otherQuiz];
  const attempts: ArtifactAttempt[] = [
    attemptOf("attempt-1", quiz.id),
    attemptOf("attempt-2", quiz.id),
    attemptOf("attempt-other", otherQuiz.id)
  ];

  await run(artifacts, attempts, quiz.id);

  assert.deepEqual(artifacts.map((artifact) => artifact.id), ["quiz-other"]);
  assert.deepEqual(attempts.map((attempt) => attempt.id), ["attempt-other"]);
});

test("un apunte sin intentos se borra sin más", async () => {
  const artifacts: Artifact[] = [note];

  await run(artifacts, [], note.id);

  assert.deepEqual(artifacts, []);
});

test("ArtifactNotFound si el artefacto no existe, sin tocar los intentos de otro", async () => {
  const artifacts: Artifact[] = [otherQuiz];
  const attempts: ArtifactAttempt[] = [attemptOf("attempt-other", otherQuiz.id)];

  await assert.rejects(
    run(artifacts, attempts, quiz.id),
    (error: unknown) => (error as { _tag?: string })._tag === "ArtifactNotFound"
  );
  assert.deepEqual(attempts.map((attempt) => attempt.id), ["attempt-other"]);
});
