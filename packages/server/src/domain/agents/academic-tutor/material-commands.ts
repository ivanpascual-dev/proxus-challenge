import { Effect, Ref } from "effect";
import { LIMITS } from "@proxus/shared";
import * as AgentCli from "../harness/index.ts";
import {
  InvalidPageRange,
  MaterialNotFound,
  MaterialNotIndexed,
  MaterialRepositoryError,
  TooManyPages,
  parsePageSelection,
  type MaterialPageImages,
  type MaterialRepository,
  type PageImage
} from "../../materials/material.ts";
import { explainStop, planIndexRead, planRender, type TurnBudgetState } from "../../limits/turn-budget.ts";
import { classifyRequestedPages, renderIndexRead } from "../../materials/index-read.ts";

const renderMaterialError = (error: MaterialNotFound | MaterialNotIndexed | InvalidPageRange | TooManyPages | { readonly _tag: "MaterialRepositoryError"; readonly reason: unknown }) => {
  switch (error._tag) {
    case "MaterialNotFound":
      return `Material not found: ${error.materialId}`;
    case "MaterialNotIndexed":
      return `Material ${error.materialId} is not indexed yet. Ask the user to index it from the interface, or use "materials view" to read the pages as images.`;
    case "InvalidPageRange":
      return `Invalid page selection ${JSON.stringify(error.range)}: ${error.reason}`;
    case "TooManyPages":
      return `Requested ${error.requested} pages, which is above the limit of ${error.ceiling} pages per turn. Ask for ${error.ceiling} pages or fewer.`;
    case "MaterialRepositoryError":
      return `Material repository error: ${String(error.reason)}`;
  }
};

const base64ByteSize = (dataUrl: string): number => {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex === -1 ? dataUrl.length : dataUrl.length - commaIndex - 1;
};

const renderWithBudget = (
  repository: MaterialRepository,
  budgetRef: Ref.Ref<TurnBudgetState>,
  materialId: string,
  pages: readonly number[]
): Effect.Effect<MaterialPageImages, MaterialNotFound | MaterialRepositoryError> => Effect.gen(function* () {
  let state = yield* Ref.get(budgetRef);
  const rendered: PageImage[] = [];
  let material: MaterialPageImages["material"] | undefined;
  let notice: string | null = null;

  for (const page of pages) {
    const result = yield* repository.renderPage(materialId, page);
    material = result.material;

    const decision = planRender(state, [base64ByteSize(result.image.data)]);
    if (decision.served === 0) {
      notice = explainStop(rendered.length, pages.length, state);
      break;
    }

    rendered.push(result.image);
    state = decision.nextState;
  }

  yield* Ref.set(budgetRef, state);

  if (material === undefined) {
    return yield* new MaterialNotFound({ materialId });
  }

  return notice === null
    ? { type: "material-page-images" as const, material, pages: rendered }
    : { type: "material-page-images" as const, material, pages: rendered, notice };
});

// Lee el texto ya indexado de unas páginas, agrupado por tema. No renderiza nada, así que no toca el
// presupuesto de páginas ni de bytes de imagen: tiene su propio techo de caracteres por turno y, al
// alcanzarlo, para y lo dice (invariante 11: nunca recorte silencioso).
const readIndexWithBudget = (
  repository: MaterialRepository,
  budgetRef: Ref.Ref<TurnBudgetState>,
  materialId: string,
  pages: readonly number[]
): Effect.Effect<string, MaterialNotFound | MaterialRepositoryError> => Effect.gen(function* () {
  if (pages.length > LIMITS.maxIndexTextPagesPerRead) {
    return `Requested ${pages.length} pages, which is above the limit of ${LIMITS.maxIndexTextPagesPerRead} pages per read. Ask for ${LIMITS.maxIndexTextPagesPerRead} pages or fewer.`;
  }

  const lookup = yield* repository.getIndex(materialId).pipe(
    Effect.map((index) => ({ kind: "index" as const, index })),
    Effect.catchTag("MaterialNotIndexed", (error) =>
      Effect.succeed({ kind: "message" as const, message: renderMaterialError(error) })
    )
  );
  if (lookup.kind === "message") {
    return lookup.message;
  }

  const material = yield* repository.get(materialId);
  const { readable, problems } = classifyRequestedPages(lookup.index, pages);

  const state = yield* Ref.get(budgetRef);
  const plan = planIndexRead(
    state,
    readable.map((page) => ({ page: page.page, characters: page.characters }))
  );
  yield* Ref.set(budgetRef, plan.nextState);

  return renderIndexRead({
    materialId,
    title: material.title,
    topics: lookup.index.topics,
    served: readable.slice(0, plan.served),
    problems,
    droppedPages: readable.slice(plan.served).map((page) => page.page),
    notice: plan.notice
  });
});

export const makeMaterialCommands = (repository: MaterialRepository, budgetRef: Ref.Ref<TurnBudgetState>) => {
  const list = AgentCli.Command.withExamples([
    { command: "materials list", description: "List all uploaded PDF materials" }
  ])(
    AgentCli.Command.withDescription("List the user's uploaded PDF materials")(
      AgentCli.Command.exec("list", {}, () =>
        repository.list().pipe(
          Effect.map((materials) => {
            if (materials.length === 0) {
              return "No PDF materials found.";
            }

            return materials.map((material) =>
              `- ${material.id}: ${material.title} (${material.pageCount} pages, file: ${material.fileName})`
            ).join("\n");
          }),
          Effect.catch((error) => Effect.succeed(renderMaterialError(error)))
        )
      )
    )
  );

  const view = AgentCli.Command.withExamples([
    { command: "materials view algebra-notes 10", description: "Render page 10 as an image" },
    { command: "materials view algebra-notes 13-20", description: "Render pages 13 through 20 as images" },
    { command: "materials view algebra-notes 10,13-20", description: "Render page 10 and pages 13 through 20" }
  ])(
    AgentCli.Command.withDescription("Render selected PDF pages as PNG images for visual reading")(
      AgentCli.Command.exec("view", {
        materialId: AgentCli.Argument.string("materialId").pipe(
          AgentCli.Argument.withDescription("Material id from `materials list`")
        ),
        pages: AgentCli.Argument.withMetavar("<pages:10,13-20>")(
          AgentCli.Argument.withDescription("Page selection like 10 or 13-20 or 10,13-20")(
            AgentCli.Argument.string("pages")
          )
        )
      }, ({ materialId, pages }) =>
        parsePageSelection(pages).pipe(
          Effect.andThen((parsedPages) => renderWithBudget(repository, budgetRef, materialId, parsedPages)),
          Effect.catch((error) => Effect.succeed(renderMaterialError(error)))
        )
      )
    )
  );

  const read = AgentCli.Command.withExamples([
    { command: "materials read algebra-notes 10", description: "Read the indexed text of page 10, grouped by topic" },
    { command: "materials read algebra-notes 13-20", description: "Read the indexed text of pages 13 through 20" },
    { command: "materials read algebra-notes 10,13-20", description: "Read page 10 and pages 13 through 20" }
  ])(
    AgentCli.Command.withDescription("Read the indexed text of selected pages, grouped by topic, without rendering images")(
      AgentCli.Command.exec("read", {
        materialId: AgentCli.Argument.string("materialId").pipe(
          AgentCli.Argument.withDescription("Material id from `materials list`")
        ),
        pages: AgentCli.Argument.withMetavar("<pages:10,13-20>")(
          AgentCli.Argument.withDescription("Page selection like 10 or 13-20 or 10,13-20")(
            AgentCli.Argument.string("pages")
          )
        )
      }, ({ materialId, pages }) =>
        parsePageSelection(pages).pipe(
          Effect.andThen((parsedPages) => readIndexWithBudget(repository, budgetRef, materialId, parsedPages)),
          Effect.catch((error) => Effect.succeed(renderMaterialError(error)))
        )
      )
    )
  );

  return AgentCli.Command.group("materials", [list, view, read] as const).pipe(
    AgentCli.Command.withDescription("Uploaded PDF material commands")
  );
};
