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

// Expande una IPv6 (con compresión `::` y posible IPv4 embebida al final: `::ffff:1.2.3.4`,
// `::1.2.3.4`, `64:ff9b::1.2.3.4`) a sus 16 bytes. `null` si no parsea. No basta con mirar el primer
// hextet ni con una regex de la forma con puntos: `::ffff:7f00:1` es 127.0.0.1 escrito en hex y tiene
// que entrar por el mismo aro que `::ffff:127.0.0.1`.
const parseIpv6 = (raw: string): Uint8Array | null => {
  let main = raw;
  let embeddedV4: readonly [number, number, number, number] | null = null;

  const lastColon = main.lastIndexOf(":");
  if (lastColon !== -1 && main.slice(lastColon + 1).includes(".")) {
    embeddedV4 = parseIpv4(main.slice(lastColon + 1));
    if (embeddedV4 === null) {
      return null;
    }
    // Se sustituye por dos hextets a cero; los bytes reales se escriben al final.
    main = `${main.slice(0, lastColon + 1)}0:0`;
  }

  const halves = main.split("::");
  if (halves.length > 2) {
    return null;
  }

  const parseGroups = (group: string): number[] | null => {
    if (group === "") {
      return [];
    }
    const out: number[] = [];
    for (const hextet of group.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(hextet)) {
        return null;
      }
      out.push(Number.parseInt(hextet, 16));
    }
    return out;
  };

  const head = parseGroups(halves[0]!);
  const tail = halves.length === 2 ? parseGroups(halves[1]!) : null;
  if (head === null || (halves.length === 2 && tail === null)) {
    return null;
  }

  let hextets: readonly number[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail!.length;
    if (missing < 1) {
      return null; // "::" representa al menos un grupo de ceros
    }
    hextets = [...head, ...Array<number>(missing).fill(0), ...tail!];
  } else {
    hextets = head;
  }
  if (hextets.length !== 8) {
    return null;
  }

  const bytes = new Uint8Array(16);
  hextets.forEach((value, index) => {
    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 0xff;
  });
  if (embeddedV4 !== null) {
    bytes[12] = embeddedV4[0];
    bytes[13] = embeddedV4[1];
    bytes[14] = embeddedV4[2];
    bytes[15] = embeddedV4[3];
  }
  return bytes;
};

const allZero = (bytes: Uint8Array, start: number, end: number): boolean => {
  for (let index = start; index < end; index++) {
    if (bytes[index] !== 0) {
      return false;
    }
  }
  return true;
};

const isPrivateIpv6 = (bytes: Uint8Array): boolean => {
  const embedded = [bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!] as const;

  // `::ffff:0:0/96` mapeada: se comprueba como la IPv4 que lleva dentro, en cualquier notación.
  if (allZero(bytes, 0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPrivateIpv4(embedded);
  }
  // `::/96` (`::`, `::1` y las IPv4-compatible deprecadas): loopback / no especificada / interna.
  if (allZero(bytes, 0, 12)) {
    return embedded[0] === 0 && embedded[1] === 0 && embedded[2] === 0 ? true : isPrivateIpv4(embedded);
  }
  // `64:ff9b::/96` NAT64: lleva una IPv4 en los últimos 32 bits.
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && allZero(bytes, 4, 12)) {
    return isPrivateIpv4(embedded);
  }
  // `2002::/16` 6to4: lleva una IPv4 en los bytes 2..5.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return isPrivateIpv4([bytes[2]!, bytes[3]!, bytes[4]!, bytes[5]!]);
  }
  // `ff00::/8` multicast.
  if (bytes[0] === 0xff) {
    return true;
  }
  // `fe80::/10` enlace local.
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) {
    return true;
  }
  // `fc00::/7` únicas locales.
  if ((bytes[0]! & 0xfe) === 0xfc) {
    return true;
  }
  return false;
};

// IPv4: los siete rangos de arriba. IPv6: se expande a 16 bytes y se clasifica (loopback, enlace
// local, únicas locales, multicast, y las que embeben una IPv4: mapeadas, 6to4, NAT64). Ante una
// dirección que no se sabe parsear se devuelve `true`: preferimos rechazar de más a dejar salir una
// petición a la red interna.
export const isPrivateAddress = (address: string): boolean => {
  const ip = address.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  const v4 = parseIpv4(ip);
  if (v4 !== null) {
    return isPrivateIpv4(v4);
  }

  if (ip.includes(":")) {
    const bytes = parseIpv6(ip);
    return bytes === null ? true : isPrivateIpv6(bytes);
  }

  // No es una IP: un hostname. Aquí no se decide (lo hace el DNS en `url-source`).
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
