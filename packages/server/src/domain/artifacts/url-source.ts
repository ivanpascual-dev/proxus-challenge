import { Effect } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { LIMITS, UrlFetchFailed, UrlRejected, type UrlBlockSource, type UrlSourceResult } from "@proxus/shared";
import { checkContentType, checkScheme, extractText, isPrivateAddress } from "./url-guards.ts";
import { URL_SUMMARY_PROMPT } from "./url-source-prompts.ts";

// La mitad con el mundo de la URL externa (fase 2, §4.7). Las siete guardas: esquema y forma
// (`url-guards`), host que no resuelve a una dirección no pública, sin redirección, tipo de
// contenido permitido, techo de bytes y techo de tiempo. Redirección: se rechaza, no se sigue
// (decisión 9). El modelo no interviene: el fragmento lo extrae el servidor.

const TOO_BIG = "__too_big__";

const resolveAddresses = (host: string): Effect.Effect<readonly string[], string> => {
  if (isIP(host) !== 0) {
    return Effect.succeed([host]);
  }
  return Effect.tryPromise({
    try: () => lookup(host, { all: true }),
    catch: (error) => String(error)
  }).pipe(Effect.map((results) => results.map((result) => result.address)));
};

const readCappedBody = (response: Response): Effect.Effect<string, string> =>
  Effect.tryPromise({
    try: async () => {
      const reader = response.body?.getReader();
      if (reader === undefined) {
        const text = await response.text();
        if (Buffer.byteLength(text) > LIMITS.maxExternalFetchBytes) {
          throw new Error(TOO_BIG);
        }
        return text;
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        total += value.byteLength;
        if (total > LIMITS.maxExternalFetchBytes) {
          await reader.cancel();
          throw new Error(TOO_BIG);
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString("utf-8");
    },
    catch: (error) => (error instanceof Error && error.message === TOO_BIG ? TOO_BIG : String(error))
  });

const timeoutRejected = (url: string) =>
  new UrlRejected({
    url,
    reason: `la descarga superó ${LIMITS.externalFetchTimeoutMs} ms`,
    message: `URL rechazada: la descarga tardó más del máximo de ${LIMITS.externalFetchTimeoutMs / 1_000} s.`
  });

// Texto mínimo para que redactar un borrador tenga sentido; por debajo, el bloque nace vacío.
const MIN_TEXT_FOR_DRAFT = 120;

// Redacta el cuerpo del bloque a partir del fragmento extraído. El texto de la web va delimitado y
// declarado como dato (ADR-008, capa 6). Si el modelo falla, se devuelve null: el bloque se añade
// igual con el fragmento como recibo y el cuerpo vacío (invariante 3).
const draftFromExcerpt = (
  source: UrlBlockSource
): Effect.Effect<string | null, never, LanguageModel.LanguageModel> => {
  if (source.excerpt.trim().length < MIN_TEXT_FOR_DRAFT) {
    return Effect.succeed(null);
  }
  return LanguageModel.generateText({
    prompt: [
      { role: "system", content: URL_SUMMARY_PROMPT },
      {
        role: "user",
        content: `Página: ${source.title || source.url}\n\n<<<BEGIN WEB PAGE>>>\n${source.excerpt}\n<<<END WEB PAGE>>>`
      }
    ]
  }).pipe(
    Effect.map((response): string | null => {
      const text = response.text.trim();
      return text.length === 0 ? null : text;
    }),
    Effect.catch(() => Effect.succeed(null))
  );
};

export const fetchUrlSource = (
  rawUrl: string
): Effect.Effect<UrlSourceResult, UrlRejected | UrlFetchFailed, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    const scheme = checkScheme(rawUrl);
    if (!scheme.ok) {
      return yield* new UrlRejected({ url: rawUrl, reason: scheme.reason, message: `URL rechazada: ${scheme.reason}.` });
    }
    const url = scheme.url;
    const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "");

    const addresses = yield* resolveAddresses(host).pipe(
      Effect.mapError((reason) => new UrlFetchFailed({
        url: rawUrl,
        message: `No se pudo resolver el host "${host}": ${reason}.`
      }))
    );

    const privateHit = addresses.find((address) => isPrivateAddress(address));
    if (privateHit !== undefined) {
      return yield* new UrlRejected({
        url: rawUrl,
        reason: `el host resuelve a la dirección no pública ${privateHit}`,
        message: `URL rechazada: "${host}" resuelve a ${privateHit}, una dirección de red interna o no enrutable.`
      });
    }

    const response = yield* Effect.tryPromise({
      try: () => fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(LIMITS.externalFetchTimeoutMs)
      }),
      catch: (error): UrlRejected | UrlFetchFailed => {
        const name = (error as { readonly name?: string }).name;
        return name === "TimeoutError" || name === "AbortError"
          ? timeoutRejected(rawUrl)
          : new UrlFetchFailed({ url: rawUrl, message: `La descarga falló: ${String(error)}.` });
      }
    });

    // Redirección: se rechaza nombrando el destino, no se sigue (F2-23, decisión 9).
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location") ?? "(sin cabecera Location)";
      return yield* new UrlRejected({
        url: rawUrl,
        reason: `la URL redirige a ${location}`,
        message: `URL rechazada: redirige a ${location} y las redirecciones no se siguen.`
      });
    }

    if (!response.ok) {
      return yield* new UrlFetchFailed({ url: rawUrl, message: `La descarga devolvió el estado ${response.status}.` });
    }

    const contentType = checkContentType(response.headers.get("content-type"));
    if (!contentType.ok) {
      return yield* new UrlRejected({ url: rawUrl, reason: contentType.reason, message: `URL rechazada: ${contentType.reason}.` });
    }

    const body = yield* readCappedBody(response).pipe(
      Effect.mapError((reason) => reason === TOO_BIG
        ? new UrlRejected({
            url: rawUrl,
            reason: `la respuesta pasa de ${LIMITS.maxExternalFetchBytes} bytes`,
            message: `URL rechazada: la respuesta pasa del techo de ${Math.round(LIMITS.maxExternalFetchBytes / 1_024)} KB.`
          })
        : new UrlFetchFailed({ url: rawUrl, message: `No se pudo leer el cuerpo de la respuesta: ${reason}.` }))
    );

    const { title, text } = extractText(body);
    const truncated = text.length > LIMITS.maxSourceExcerptCharacters;

    const source: UrlBlockSource = {
      type: "url",
      url: url.toString(),
      fetchedAt: new Date().toISOString(),
      title: title.slice(0, LIMITS.maxNoteTitleCharacters),
      excerpt: truncated ? text.slice(0, LIMITS.maxSourceExcerptCharacters) : text,
      excerptTruncated: truncated
    };

    const draft = yield* draftFromExcerpt(source);
    return { source, draft };
  });
