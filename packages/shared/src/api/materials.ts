import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { MaterialListResponse, PdfMaterial } from "../schemas/material.ts";
import { MaterialIndex, MaterialPageView } from "../schemas/material-index.ts";
import { MaterialNotFound, MaterialNotIndexed, PageOutOfRange } from "../errors/material-errors.ts";

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
        MaterialNotIndexed.pipe(HttpApiSchema.status(409))
      ]
    }),
    // La imagen real de una página más su entrada de índice, en la misma respuesta.
    HttpApiEndpoint.get("page", "/:id/pages/:page", {
      params: {
        id: Schema.String,
        page: Schema.NumberFromString
      },
      success: MaterialPageView,
      error: [
        MaterialNotFound.pipe(HttpApiSchema.status(404)),
        PageOutOfRange.pipe(HttpApiSchema.status(400)),
        MaterialNotIndexed.pipe(HttpApiSchema.status(409))
      ]
    })
  )
  .prefix("/materials")
{}
