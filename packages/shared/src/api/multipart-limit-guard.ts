import { HttpApiMiddleware, HttpApiSchema } from "effect/unstable/httpapi";
import { LimitExceeded } from "../errors/limit-exceeded.ts";

// F4-03: `HttpApiSchema.asMultipart` declara `maxFileSize`/`maxTotalSize`/`maxParts`, pero el propio
// `HttpApiBuilder` de esta beta envuelve la decodificación del payload multipart con `Effect.orDie`
// (`decodePayload`, caso "Multipart"): cualquier `Multipart.MultipartError`, incluido pasarse de esos
// techos, se convierte en un defecto y sale como 500 mudo, sin pasar por el `error` que declara el
// endpoint. Este middleware es el punto donde el servidor lo intercepta (`multipart-limit-guard.ts`)
// y lo traduce a `LimitExceeded`, el mismo error que ya usan `upload` y `validate` para el resto de
// sus techos. Se aplica a `MaterialsApi`, el único grupo con endpoints multipart.
export class MultipartLimitGuard extends HttpApiMiddleware.Service<MultipartLimitGuard>()(
  "MultipartLimitGuard",
  {
    error: LimitExceeded.pipe(HttpApiSchema.status(400))
  }
) {}
