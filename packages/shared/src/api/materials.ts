import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Multipart } from "effect/unstable/http";
import { LIMITS } from "../limits.ts";
import { MaterialListResponse, MaterialUploadResponse, PageImage, PdfMaterial } from "../schemas/material.ts";
import { MaterialIndex } from "../schemas/material-index.ts";
import { MaterialAssessmentsResponse } from "../schemas/attempt-api.ts";
import { StudyProfile } from "../schemas/study-profile.ts";
import {
  MaterialNotFound,
  MaterialNotIndexed,
  MaterialStorageError,
  PageOutOfRange,
  TooManyMaterials
} from "../errors/material-errors.ts";
import { LimitExceeded, RateLimited } from "../errors/limit-exceeded.ts";
import { ExamLockdownGuard } from "./exam-lockdown.ts";

// Multipart en buffer (no en stream): el fichero entero tiene que estar en disco antes de que
// `pdfinfo` lo compruebe (sección 4.2 del plan de fase 4). `maxFileSize` es el techo por fichero
// (`maxUploadBytes`); `maxTotalSize` es el caso peor de un lote al límite (`maxFilesPerUpload`
// ficheros, cada uno al techo).
const UploadPayload = Schema.Struct({
  files: Multipart.FilesSchema
}).pipe(HttpApiSchema.asMultipart({
  maxParts: LIMITS.maxFilesPerUpload,
  maxFileSize: LIMITS.maxUploadBytes,
  maxTotalSize: LIMITS.maxFilesPerUpload * LIMITS.maxUploadBytes
}));

export class MaterialsApi extends HttpApiGroup.make("materials")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: MaterialListResponse
    }),
    // Al subir, se indexa y se generan los apuntes en cadena, sin pulsar nada (decisión 3). Solo PDF
    // (decisión 2). Fallo por fichero (tipo, nombre duplicado) va dentro de la respuesta, uno por
    // fichero (F4-02); solo los fallos agregados (frecuencia, número de ficheros, `maxMaterials`)
    // abortan la petición entera, antes de escribir nada (F4-03, F4-04).
    HttpApiEndpoint.post("upload", "/", {
      payload: UploadPayload,
      success: MaterialUploadResponse,
      error: [
        TooManyMaterials.pipe(HttpApiSchema.status(400)),
        LimitExceeded.pipe(HttpApiSchema.status(400)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        // Fallo de disco al listar los materiales existentes o al escribir uno nuevo. No estaba en
        // el contrato original del tramo 4B; sin él, un fallo de almacenamiento en la subida solo
        // podría mapearse con `Effect.orDie` (invariante 6).
        MaterialStorageError.pipe(HttpApiSchema.status(500))
      ]
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
    // El perfil de estudio de ese material, tema a tema (§5.6, ADR-002). Solo lectura: el modelo
    // nunca lo escribe, y esta ruta tampoco. Cada tema trae sus señales POR SEPARADO (invariante 5).
    HttpApiEndpoint.get("profile", "/:id/profile", {
      params: {
        id: Schema.String
      },
      success: StudyProfile,
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
