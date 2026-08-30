import { Effect } from "effect";
import type { StudyProfile } from "@proxus/shared";
import * as AgentCli from "../harness/index.ts";
import type { StudyProfileService } from "../../profile/study-profile.ts";

// El perfil de estudio, de SOLO LECTURA, expuesto como comando del CLI y no como herramienta nueva
// (ADR-004). El agente lo lee; no existe ninguna ruta ni comando por el que pueda escribirlo
// (ADR-002). Devuelve las señales de cada tema POR SEPARADO (invariante 5): quien resume las tres en
// un número rompe la trazabilidad de por qué salió una pregunta.

const renderProfile = (profile: StudyProfile): string => {
  if (profile.topics.length === 0) {
    return `Study profile for material ${profile.materialId}: empty. The student has no graded attempt on this material yet, and no topic is emphasised. There is nothing to recommend for review.`;
  }

  const lines = profile.topics.map((topic) => {
    const signals = [
      `wrong: ${topic.incorrect}`,
      `right: ${topic.correct}`,
      `unevaluated: ${topic.unevaluated}`,
      `blank: ${topic.blank}`,
      `hints opened: ${topic.hintsRevealed}`,
      `emphasised: ${topic.emphasis ? "yes" : "no"}`
    ];
    return `- ${topic.topicLabel} (${topic.topicId})\n    ${signals.join("  ·  ")}`;
  });

  return [
    `Study profile for material ${profile.materialId}${profile.updatedAt === null ? "" : ` (updated ${profile.updatedAt})`}:`,
    "",
    ...lines,
    "",
    "Each signal is separate (wrong answers, hints opened, and topics the student marked are three",
    "different things). When you tell the student why a topic is worth reviewing, name the signal that",
    'brought it ("you got this topic wrong twice" / "you opened a hint here" / "you marked this topic"),',
    "never a single summary score."
  ].join("\n");
};

export const makeProfileCommands = (profile: StudyProfileService) => {
  const show = AgentCli.Command.withExamples([
    { command: "profile show algebra-notes", description: "Show the study profile of a material, topic by topic" }
  ])(
    AgentCli.Command.withDescription(
      "Show a material's study profile: per topic, how many questions the student got wrong, got right, left blank or that could not be evaluated, how many hints they opened, and whether they marked the topic as important. Read-only: you cannot change it."
    )(
      AgentCli.Command.exec("show", {
        materialId: AgentCli.Argument.string("materialId").pipe(
          AgentCli.Argument.withDescription("Material id from `materials list`")
        )
      }, ({ materialId }) =>
        profile.read(materialId).pipe(
          Effect.map(renderProfile),
          Effect.catch((error) => Effect.succeed(`Could not read the study profile of ${materialId}: ${error.reason}`))
        )
      )
    )
  );

  return AgentCli.Command.group("profile", [show] as const).pipe(
    AgentCli.Command.withDescription("The student's study profile for a material, read-only (ADR-002, ADR-004)")
  );
};
