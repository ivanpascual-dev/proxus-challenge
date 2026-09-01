import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Multipart } from "effect/unstable/http";
import { LIMITS } from "../limits.ts";
import {
  MaterialListResponse,
  MaterialUploadResponse,
  MaterialValidationResponse,
  PageImage,
  PdfMaterial
} from "../schemas/material.ts";
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
import { MultipartLimitGuard } from "./multipart-limit-guard.ts";

// Multipart en buffer (no en stream): el fichero entero tiene que estar en disco antes de que
// `pdfinfo` lo compruebe (sección 4.2 del plan de fase 4). `maxFileSize` es el techo por fichero
// (`maxUploadBytes`); `maxTotalSize` es el caso peor de un lote al límite (`maxFilesPerUpload`
// ficheros, cada uno al techo).
//
// `maxParts` va con un fichero de holgura (`+ 1`), a propósito: el parser de multipart de esta beta
// (`multipasta`) no rechaza un lote que pasa de `maxParts`, lo trunca en silencio a los primeros N
// sin avisar (verificado contra la API real). Con el techo exacto, un lote de 6 llegaría al servidor
// como si fueran 5, sin ningún rechazo (F4-03, invariante 3: nada de fallo silencioso). Con la
// holgura, el sexto fichero sí llega, y es `checkFileCount` en `handlers.ts` quien lo rechaza en voz
// alta nombrando el techo real y lo recibido.
const UploadPayload = Schema.Struct({
  files: Multipart.FilesSchema
}).pipe(HttpApiSchema.asMultipart({
  maxParts: LIMITS.maxFilesPerUpload + 1,
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
    // Comprueba un lote de PDFs (tipo, nombre duplicado) sin escribir nada: la interfaz lo llama al
    // soltar los ficheros, antes de que la persona vea el botón "Subir" (cierre de fase 4, punto 5 de
    // la revisión de fiel-al-plan). No comprueba `maxMaterials`: eso es un fallo agregado de `upload`,
    // no algo que dependa de qué fichero se está mirando. Sin `RateLimited`: no cuenta contra
    // `uploadsPerWindow`, que es el techo de subidas reales (decisión 4), no de comprobaciones.
    HttpApiEndpoint.post("validate", "/validate", {
      payload: UploadPayload,
      success: MaterialValidationResponse,
      error: [
        LimitExceeded.pipe(HttpApiSchema.status(400)),
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
    // Borrar el PDF se lleva sus artefactos (apunte, controles, exámenes con sus intentos): dejarlos
    // huérfanos es lo que producía el choque al resubir el mismo PDF (materialId se deriva del
    // nombre, ADR-011). El frontend avisa de la pérdida antes de llamar; el servidor no pregunta.
    HttpApiEndpoint.delete("remove", "/:id", {
      params: {
        id: Schema.String
      },
      success: HttpApiSchema.NoContent,
      error: [
        MaterialNotFound.pipe(HttpApiSchema.status(404)),
        RateLimited.pipe(HttpApiSchema.status(429)),
        MaterialStorageError.pipe(HttpApiSchema.status(500))
      ]
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
  .middleware(MultipartLimitGuard)
  .prefix("/materials")
{}
