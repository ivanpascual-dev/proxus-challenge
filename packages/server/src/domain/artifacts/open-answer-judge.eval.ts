import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Console, Effect, Layer, Schema } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { GeminiJudgeLanguageModelLive, GeminiLanguageModelLive, geminiJudgeLayer, type ThinkingMode } from "../agents/gemini.ts";
import { OPEN_ANSWER_JUDGE_PROMPT } from "./assessment-prompts.ts";
import { interpretJudgeResponse, judgeUserMessage, type JudgeQuestion } from "./open-answer-judge.ts";
import type { ShortAnswerCorrection } from "./artifact.ts";

// Eval del juez de desarrollo corto (§6.7.2). Hace llamadas reales al modelo. Dos objetivos:
//
// 1. Medir la TASA DE CAÍDAS AL PARSEAR con la capa JSON (`GeminiJudgeLanguageModelLive`, la que corre
//    en producción, `responseMimeType: application/json`) y sin ella (`GeminiLanguageModelLive`). Las
//    dos cifras van a `notes/bitacora.md` (riesgo 2) y a `NOTES.md`.
// 2. Ver si el juez acierta el veredicto en los seis casos por pregunta del fixture, con la paráfrasis
//    como caso central (la defensa 2 contra el falso negativo).
//
// Es una herramienta de MEDIDA, no un check de CI: imprime el informe y sale 0, salvo que la capa JSON
// (la que se envía) tenga alguna caída de parseo, que es lo que el riesgo 2 vigila.

// --- fixture ------------------------------------------------------------------------------------

const RubricCriterionFixture = Schema.Struct({ id: Schema.String, text: Schema.String });

const ExpectedVerdict = Schema.Union([
  Schema.Struct({ gradable: Schema.Literal(false) }),
  Schema.Struct({ gradable: Schema.Literal(true), met: Schema.Array(Schema.String) })
]);
type ExpectedVerdict = typeof ExpectedVerdict.Type;

const CaseFixture = Schema.Struct({
  id: Schema.String,
  answer: Schema.String,
  expect: ExpectedVerdict
});

const QuestionFixture = Schema.Struct({
  id: Schema.String,
  prompt: Schema.String,
  expectedAnswer: Schema.String,
  materialExcerpt: Schema.String,
  rubric: Schema.Array(RubricCriterionFixture),
  cases: Schema.Array(CaseFixture)
});

const Fixture = Schema.Struct({
  version: Schema.Number,
  note: Schema.optional(Schema.String),
  questions: Schema.Array(QuestionFixture)
});

const fixture = Schema.decodeUnknownSync(Fixture)(
  JSON.parse(readFileSync(fileURLToPath(new URL("./open-answer-judge.fixture.json", import.meta.url)), "utf-8"))
);

// --- clasificación del resultado del juez ------------------------------------------------------

type Outcome =
  | { readonly kind: "parse-drop" }
  | { readonly kind: "criteria-mismatch" }
  | { readonly kind: "gradable-false" }
  | { readonly kind: "graded"; readonly met: readonly string[] };

const classify = (correction: ShortAnswerCorrection | null): Outcome => {
  if (correction === null) {
    return { kind: "parse-drop" };
  }
  if (correction.status === "graded") {
    return { kind: "graded", met: correction.criteria.filter((c) => c.met).map((c) => c.id).sort() };
  }
  if (correction.unevaluatedReason?.includes("no devolvió los mismos criterios") === true) {
    return { kind: "criteria-mismatch" };
  }
  return { kind: "gradable-false" };
};

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const matchesExpected = (outcome: Outcome, expected: ExpectedVerdict): boolean => {
  if (outcome.kind === "parse-drop" || outcome.kind === "criteria-mismatch") {
    return false;
  }
  if (expected.gradable === false) {
    return outcome.kind === "gradable-false";
  }
  return outcome.kind === "graded" && sameSet(outcome.met, [...expected.met].sort());
};

const describe = (outcome: Outcome): string => {
  switch (outcome.kind) {
    case "parse-drop": return "no parsea";
    case "criteria-mismatch": return "criterios no casan";
    case "gradable-false": return "gradable:false";
    case "graded": return `met=[${outcome.met.join(",")}]`;
  }
};

// --- ejecución de una capa --------------------------------------------------------------------

interface LayerReport {
  readonly label: string;
  readonly total: number;
  readonly parseDrops: number;
  readonly criteriaMismatches: number;
  readonly verdictHits: number;
  readonly verdictChecked: number;
  readonly rows: readonly string[];
}

const runLayer = (
  label: string,
  layer: Layer.Layer<LanguageModel.LanguageModel>
): Effect.Effect<LayerReport> =>
  Effect.gen(function* () {
    let total = 0;
    let parseDrops = 0;
    let criteriaMismatches = 0;
    let verdictHits = 0;
    const rows: string[] = [];

    for (const question of fixture.questions) {
      for (const testCase of question.cases) {
        const judgeQuestion: JudgeQuestion = {
          questionId: `${question.id}:${testCase.id}`,
          prompt: question.prompt,
          expectedAnswer: question.expectedAnswer,
          rubric: question.rubric,
          maxScore: 1,
          answer: testCase.answer,
          materialExcerpt: question.materialExcerpt
        };

        const raw = yield* LanguageModel.generateText({
          prompt: [
            { role: "system", content: OPEN_ANSWER_JUDGE_PROMPT },
            { role: "user", content: judgeUserMessage(judgeQuestion) }
          ]
        }).pipe(
          Effect.map((response) => response.text),
          Effect.provide(layer),
          Effect.catch(() => Effect.succeed(""))
        );

        total += 1;
        const outcome = raw === "" ? ({ kind: "parse-drop" } as const) : classify(interpretJudgeResponse(raw, judgeQuestion));
        const hit = matchesExpected(outcome, testCase.expect);

        if (outcome.kind === "parse-drop") {
          parseDrops += 1;
        } else if (outcome.kind === "criteria-mismatch") {
          criteriaMismatches += 1;
        }
        if (hit) {
          verdictHits += 1;
        }

        const want = testCase.expect.gradable === false ? "gradable:false" : `met=[${[...testCase.expect.met].sort().join(",")}]`;
        rows.push(`  ${hit ? "✓" : "✗"} ${judgeQuestion.questionId.padEnd(34)} espera ${want.padEnd(18)} → ${describe(outcome)}`);
      }
    }

    return {
      label,
      total,
      parseDrops,
      criteriaMismatches,
      verdictHits,
      verdictChecked: total - parseDrops - criteriaMismatches,
      rows
    };
  });

// --- salida ----------------------------------------------------------------------------------

const pct = (n: number, d: number) => d === 0 ? "0.0%" : `${((n / d) * 100).toFixed(1)}%`;

const formatLayer = (report: LayerReport): string => [
  `── ${report.label} ${"─".repeat(Math.max(0, 40 - report.label.length))}`,
  ...report.rows,
  "",
  `  caídas al parsear:     ${report.parseDrops}/${report.total}  (${pct(report.parseDrops, report.total)})`,
  `  criterios no casan:    ${report.criteriaMismatches}/${report.total}  (${pct(report.criteriaMismatches, report.total)})`,
  `  veredicto correcto:    ${report.verdictHits}/${report.verdictChecked} interpretables  (${pct(report.verdictHits, report.verdictChecked)}), ${report.verdictHits}/${report.total} del total`
].join("\n");

const main = Effect.gen(function* () {
  const which = process.argv.find((arg) => arg.startsWith("--layer="))?.split("=")[1] ?? "both";
  const thinking = process.argv.find((arg) => arg.startsWith("--thinking="))?.split("=")[1] as ThinkingMode | undefined;

  const reports: LayerReport[] = [];
  // Fase 4, tramo 4G, paso 21 (decisión 14): con `--thinking=`, corre solo la capa JSON (la que se
  // envía en producción) en ese nivel de pensamiento, para decidir low/high/off por resultado.
  if (thinking !== undefined) {
    reports.push(yield* runLayer(`con capa JSON, thinking ${thinking}`, geminiJudgeLayer(thinking)));
  } else {
    if (which === "both" || which === "json") {
      reports.push(yield* runLayer("con capa JSON (responseMimeType)", GeminiJudgeLanguageModelLive));
    }
    if (which === "both" || which === "plain") {
      reports.push(yield* runLayer("sin capa JSON (temperatura 0.2)", GeminiLanguageModelLive));
    }
  }

  yield* Console.log(`\neval del juez · fixture v${fixture.version} · ${fixture.questions.length} preguntas × 6 casos\n`);
  for (const report of reports) {
    yield* Console.log(formatLayer(report));
    yield* Console.log("");
  }

  const json = reports.find((r) => r.label.includes("JSON"));
  const plain = reports.find((r) => r.label.includes("sin capa"));
  yield* Console.log("── resumen para la bitácora ──────────────");
  if (json !== undefined) {
    yield* Console.log(`  tasa de caídas CON capa JSON:  ${pct(json.parseDrops, json.total)}  (${json.parseDrops}/${json.total})`);
  }
  if (plain !== undefined) {
    yield* Console.log(`  tasa de caídas SIN capa JSON:  ${pct(plain.parseDrops, plain.total)}  (${plain.parseDrops}/${plain.total})`);
  }

  // La eval es una medida, no un check de CI. Sale 1 solo si la capa que se envía (JSON) deja caer
  // algún parseo: es lo que vigila el riesgo 2.
  if (json !== undefined && json.parseDrops > 0) {
    yield* Console.log("\n⚠ la capa JSON dejó caer algún parseo: revisar antes de dar el riesgo 2 por controlado.");
    yield* Effect.sync(() => { process.exitCode = 1; });
  }
});

if (import.meta.main) {
  Effect.runPromise(main);
}
