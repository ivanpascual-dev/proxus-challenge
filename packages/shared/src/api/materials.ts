import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { MaterialListResponse, PageImage, PdfMaterial } from "../schemas/material.ts";
import { MaterialIndex } from "../schemas/material-index.ts";
import { MaterialAssessmentsResponse } from "../schemas/attempt-api.ts";
import { MaterialNotFound, MaterialNotIndexed, MaterialStorageError, PageOutOfRange } from "../errors/material-errors.ts";
import { ExamLockdownGuard } from "./exam-lockdown.ts";

export class MaterialsApi extends HttpApiGroup.make("materials")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: MaterialListResponse
    }),
    HttpApiEndpoint.get("get", "/:id", {
      params: {
        id: Schema.String
      },
      success: PdfMaterial,
      error: [MaterialNotFound.pipe(HttpApiSchema.status(404))]
    }),
    // El índice sin imágenes: temas, procedencia y texto de cada página.
    HttpApiEndpoint.get("index", "/:id/index", {
      params: {
        id: Schema.String
      },
      success: MaterialIndex,
      error: [
        MaterialNotFound.pipe(HttpApiSchema.status(404)),
        MaterialNotIndexed.pipe(HttpApiSchema.status(409)),
        MaterialStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // Controles y Exámenes de ese material, con su último intento (§5.6). Lo que la pestaña Pruebas
    // necesita para pintar la lista sin descargar cada prueba entera.
    HttpApiEndpoint.get("assessments", "/:id/assessments", {
      params: {
        id: Schema.String
      },
      success: MaterialAssessmentsResponse,
      error: [
        MaterialNotFound.pipe(HttpApiSchema.status(404)),
        MaterialStorageError.pipe(HttpApiSchema.status(500))
      ]
    }),
    // El render real de una página. No exige índice: ver el PDF va antes de indexarlo.
    HttpApiEndpoint.get("page", "/:id/pages/:page", {
      params: {
        id: Schema.String,
        page: Schema.NumberFromString
      },
      success: PageImage,
      error: [
        MaterialNotFound.pipe(HttpApiSchema.status(404)),
        PageOutOfRange.pipe(HttpApiSchema.status(400)),
        MaterialStorageError.pipe(HttpApiSchema.status(500))
      ]
    })
  )
  .middleware(ExamLockdownGuard)
  .prefix("/materials")
{}
