// Las guardas puras de la URL externa (fase 2, §4.7). Sin entrada ni salida: aquí es donde, si una
// comprobación falla, el agujero es silencioso, así que aquí van los tests. La parte con el mundo
// (DNS, fetch, techo de bytes y de tiempo) vive en `url-source.ts`.

export type SchemeCheck =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string };

// Solo `https:`. Cualquier otro esquema se rechaza nombrándolo (F2-20).
export const checkScheme = (raw: string): SchemeCheck => {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: `no es una URL válida` };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: `solo se aceptan URLs https; esta usa el esquema "${parsed.protocol.replace(/:$/, "")}"` };
  }
  return { ok: true, url: parsed };
};

const parseIpv4 = (ip: string): readonly [number, number, number, number] | null => {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
};

// Rangos IPv4 no públicos: 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, 0/8, 100.64/10.
const isPrivateIpv4 = ([a, b]: readonly [number, number, number, number]): boolean =>
  a === 10 ||
  a === 127 ||
  a === 0 ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168) ||
  (a === 169 && b === 254) ||
  (a === 100 && b >= 64 && b <= 127);

// IPv4: los siete rangos de arriba. IPv6: `::` (no especificada), `::1` (loopback), `fc00::/7`
// (únicas locales), `fe80::/10` (enlace local), `ff00::/8` (multicast) y las mapeadas
// `::ffff:a.b.c.d`, que se comprueban como IPv4. Ante una dirección que no se sabe parsear se
// devuelve `true`: preferimos rechazar de más a dejar salir una petición a la red interna.
export const isPrivateAddress = (address: string): boolean => {
  const ip = address.trim().toLowerCase();

  const v4 = parseIpv4(ip);
  if (v4 !== null) {
    return isPrivateIpv4(v4);
  }

  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  if (mapped !== null) {
    const inner = parseIpv4(mapped[1]!);
    return inner === null ? true : isPrivateIpv4(inner);
  }

  if (ip === "::" || ip === "::1") {
    return true;
  }

  const firstHextet = ip.split(":")[0] ?? "";
  // fc00::/7 => primer byte 0xfc o 0xfd; ff00::/8 => multicast.
  if (/^f[cdf]/.test(firstHextet)) {
    return true;
  }
  // fe80::/10 => primer hextet entre fe80 y febf.
  if (/^[0-9a-f]{1,4}$/.test(firstHextet)) {
    const value = Number.parseInt(firstHextet.padStart(4, "0"), 16);
    if (Number.isInteger(value) && value >= 0xfe80 && value <= 0xfebf) {
      return true;
    }
  }

  return false;
};

export type ContentTypeCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

// Solo `text/html` y `text/plain` (F2-24). Se ignora el `; charset=...`.
export const checkContentType = (header: string | null): ContentTypeCheck => {
  const value = (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (value === "text/html" || value === "text/plain") {
    return { ok: true };
  }
  return {
    ok: false,
    reason: value.length === 0
      ? "la respuesta no declara tipo de contenido"
      : `el tipo de contenido es "${value}"; solo se aceptan text/html y text/plain`
  };
};

const decodeEntities = (text: string): string =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

export interface ExtractedPage {
  readonly title: string;
  readonly text: string;
}

// No es un parser de HTML y no lo pretende (riesgo 3, va a NOTES.md). Quita `<script>` y `<style>`
// con su contenido, quita el resto de etiquetas, decodifica las entidades básicas y colapsa los
// espacios. Saca el `<title>` si lo hay.
export const extractText = (html: string): ExtractedPage => {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  const title = titleMatch === null
    ? ""
    : decodeEntities(titleMatch[1]!).replace(/\s+/g, " ").trim();

  // `<script>`, `<style>` y `<title>` se quitan con su contenido: no son texto del cuerpo.
  const withoutCode = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, " ");

  const text = decodeEntities(withoutCode.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

  return { title, text };
};
