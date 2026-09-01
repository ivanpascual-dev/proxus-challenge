import { Context, Effect, Layer, Ref } from "effect";
import { LIMITS, RateLimited } from "@proxus/shared";

export type RateLimiterFamily = "messages" | "artifacts";

export interface RateLimiter {
  readonly check: (
    key: string,
    family: RateLimiterFamily,
  ) => Effect.Effect<void, RateLimited>;
  readonly acquire: (key: string) => Effect.Effect<void, RateLimited>; // concurrencia
  readonly release: (key: string) => Effect.Effect<void>;
  // La frecuencia de subidas (fase 4, decisión 4): un solo umbral (`LIMITS.uploadsPerWindow`), sin
  // el segundo tramo diario que sí tienen "messages" y "artifacts". No encaja en `check`, por eso
  // tiene su propio método en vez de una tercera `RateLimiterFamily`.
  readonly checkUpload: (key: string) => Effect.Effect<void, RateLimited>;
  // La gracia de alta (fase 4, decisión 4, sección 4.2): un material recién subido no cobra el cubo
  // `artifacts` en su primera indexación ni su primera generación de apuntes, porque subir ya se
  // cobró contra `uploadsPerWindow`. Es un hueco deliberado (riesgo 6 de la fase 4): lo acota el
  // techo de subidas, no la gracia misma.
  readonly grantUploadGrace: (materialId: string) => Effect.Effect<void>;
  readonly hasUploadGrace: (materialId: string) => Effect.Effect<boolean>;
  // Revoca la gracia de un material (fase 5, ADR-028): la llama la generación de apuntes al cerrar su
  // stream, en éxito y en fallo, para que la gracia no siga viva más allá de la preparación automática
  // que la motivó. Revocar un material sin gracia (ya expirada, o nunca concedida) es una operación
  // idempotente, no un error.
  readonly revokeUploadGrace: (materialId: string) => Effect.Effect<void>;
}

export const RateLimiter = Context.Service<RateLimiter>(
  "@proxus/server/limits/RateLimiter",
);

interface WindowLimit {
  readonly limit: number;
  readonly windowMs: number;
}

const windowLimitFor = (family: RateLimiterFamily): WindowLimit =>
  family === "messages" ? LIMITS.messagesPerWindow : LIMITS.artifactsPerWindow;

const dayLimitFor = (family: RateLimiterFamily): WindowLimit =>
  family === "messages" ? LIMITS.messagesPerDay : LIMITS.artifactsPerDay;

// Ventana deslizante en memoria, con el reloj inyectado: si no, los tests tienen que dormir de
// verdad y entonces no se escriben. `now` por defecto es Date.now para el uso en producción.
export const make = (
  now: () => number = Date.now,
): Effect.Effect<RateLimiter> =>
  Effect.gen(function* () {
    const hitsRef = yield* Ref.make(new Map<string, readonly number[]>());
    const concurrencyRef = yield* Ref.make(new Map<string, number>());
    const uploadGraceRef = yield* Ref.make(new Map<string, number>()); // materialId -> expira en

    const recentHits = (
      hits: ReadonlyMap<string, readonly number[]>,
      bucketKey: string,
      windowMs: number,
      t: number,
    ) =>
      (hits.get(bucketKey) ?? []).filter(
        (timestamp) => t - timestamp < windowMs,
      );

    const checkBucket = (
      bucketKey: string,
      limit: WindowLimit,
      limitName: string,
      message: string,
      t: number,
    ): Effect.Effect<readonly number[], RateLimited> =>
      Effect.gen(function* () {
        const hits = yield* Ref.get(hitsRef);
        const recent = recentHits(hits, bucketKey, limit.windowMs, t);
        if (recent.length >= limit.limit) {
          const oldest = recent[0] ?? t;
          return yield* new RateLimited({
            limit: limitName,
            retryAfterMs: Math.max(0, limit.windowMs - (t - oldest)),
            message,
          });
        }
        return recent;
      });

    const check: RateLimiter["check"] = (key, family) =>
      Effect.gen(function* () {
        const t = now();
        const windowBucket = `${family}:window:${key}`;
        const dayBucket = `${family}:day:${key}`;

        const windowLimit = windowLimitFor(family);
        const windowMinutes = Math.round(windowLimit.windowMs / 1_000 / 60);
        const windowRecent = yield* checkBucket(
          windowBucket,
          windowLimit,
          `${family}PerWindow`,
          `Tu ventana de ${windowMinutes} minutos se ha agotado. Espera un poco antes de volver a intentarlo.`,
          t,
        );
        const dayRecent = yield* checkBucket(
          dayBucket,
          dayLimitFor(family),
          `${family}PerDay`,
          "Tu límite diario ha llegado a su fin. Descansa y vuelve mañana.",
          t,
        );

        yield* Ref.update(hitsRef, (map) => {
          const next = new Map(map);
          next.set(windowBucket, [...windowRecent, t]);
          next.set(dayBucket, [...dayRecent, t]);
          return next;
        });
      });

    const acquire: RateLimiter["acquire"] = (key) =>
      Effect.gen(function* () {
        const concurrency = yield* Ref.get(concurrencyRef);
        const current = concurrency.get(key) ?? 0;
        if (current >= LIMITS.maxConcurrentRequests) {
          return yield* new RateLimited({
            limit: "maxConcurrentRequests",
            retryAfterMs: 1_000,
            message: `Hay ${LIMITS.maxConcurrentRequests} peticiones tuyas en curso. Espera a que termine alguna.`,
          });
        }
        yield* Ref.update(concurrencyRef, (map) =>
          new Map(map).set(key, current + 1),
        );
      });

    const release: RateLimiter["release"] = (key) =>
      Ref.update(concurrencyRef, (map) => {
        const current = map.get(key) ?? 0;
        const next = new Map(map);
        if (current <= 1) {
          next.delete(key);
        } else {
          next.set(key, current - 1);
        }
        return next;
      });

    const checkUpload: RateLimiter["checkUpload"] = (key) =>
      Effect.gen(function* () {
        const t = now();
        const bucket = `uploads:window:${key}`;
        const windowDays = Math.round(LIMITS.uploadsPerWindow.windowMs / 1_000 / 60 / 60 / 24);
        const recent = yield* checkBucket(
          bucket,
          LIMITS.uploadsPerWindow,
          "uploadsPerWindow",
          windowDays <= 1
            ? "Has llegado a tu límite de subidas de hoy. Vuelve mañana."
            : `Has llegado a tu límite de subidas de los últimos ${windowDays} días. Espera un poco antes de volver a intentarlo.`,
          t,
        );
        yield* Ref.update(hitsRef, (map) => new Map(map).set(bucket, [...recent, t]));
      });

    const grantUploadGrace: RateLimiter["grantUploadGrace"] = (materialId) =>
      Ref.update(uploadGraceRef, (map) => new Map(map).set(materialId, now() + LIMITS.uploadGraceMs));

    const hasUploadGrace: RateLimiter["hasUploadGrace"] = (materialId) =>
      Ref.get(uploadGraceRef).pipe(
        Effect.map((map) => {
          const expiresAt = map.get(materialId);
          return expiresAt !== undefined && now() < expiresAt;
        }),
      );

    const revokeUploadGrace: RateLimiter["revokeUploadGrace"] = (materialId) =>
      Ref.update(uploadGraceRef, (map) => {
        if (!map.has(materialId)) {
          return map;
        }
        const next = new Map(map);
        next.delete(materialId);
        return next;
      });

    return { check, acquire, release, checkUpload, grantUploadGrace, hasUploadGrace, revokeUploadGrace };
  });

export const layer = (now?: () => number) =>
  Layer.effect(RateLimiter)(make(now));
