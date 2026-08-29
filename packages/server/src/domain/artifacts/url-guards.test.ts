import assert from "node:assert/strict";
import { test } from "node:test";
import { checkContentType, checkScheme, extractText, isPrivateAddress } from "./url-guards.ts";

test("checkScheme: https pasa y devuelve la URL parseada", () => {
  const result = checkScheme("https://example.com/x");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.url.hostname, "example.com");
});

test("checkScheme: http se rechaza nombrando el esquema (F2-20)", () => {
  const result = checkScheme("http://example.com/x");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason.includes("http"), true);
});

test("checkScheme: file se rechaza nombrando el esquema (F2-20)", () => {
  const result = checkScheme("file:///etc/passwd");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason.includes("file"), true);
});

test("checkScheme: una cadena que no es URL se rechaza", () => {
  assert.equal(checkScheme("no soy una url").ok, false);
});

const privateV4 = [
  "10.0.0.1",
  "10.255.255.255",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.1.1",
  "127.0.0.1",
  "169.254.10.10",
  "0.0.0.0",
  "100.64.0.1",
  "100.127.255.255"
];

for (const ip of privateV4) {
  test(`isPrivateAddress: ${ip} es privada (F2-21)`, () => {
    assert.equal(isPrivateAddress(ip), true);
  });
}

const publicV4 = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "100.63.255.255", "93.184.216.34"];
for (const ip of publicV4) {
  test(`isPrivateAddress: ${ip} es pública`, () => {
    assert.equal(isPrivateAddress(ip), false);
  });
}

const privateV6 = ["::1", "::", "fc00::1", "fd12:3456:789a::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:192.168.1.1"];
for (const ip of privateV6) {
  test(`isPrivateAddress: ${ip} es privada / no enrutable (F2-21)`, () => {
    assert.equal(isPrivateAddress(ip), true);
  });
}

const publicV6 = ["2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"];
for (const ip of publicV6) {
  test(`isPrivateAddress: ${ip} es pública`, () => {
    assert.equal(isPrivateAddress(ip), false);
  });
}

// La IPv4 mapeada escrita en hexadecimal es la misma dirección que con puntos: `::ffff:7f00:1` es
// 127.0.0.1. La guarda tiene que verlas iguales, o `https://[::ffff:a9fe:a9fe]/` esquiva el filtro.
const privateV6Embedded = [
  "::ffff:7f00:1", // 127.0.0.1
  "::ffff:a9fe:a9fe", // 169.254.169.254 (metadatos de nube)
  "::ffff:0a00:0001", // 10.0.0.1
  "::ffff:c0a8:0101", // 192.168.1.1
  "0:0:0:0:0:ffff:7f00:1", // la misma, sin comprimir
  "0:0:0:0:0:0:0:1", // ::1 sin comprimir
  "64:ff9b::7f00:1", // NAT64 de 127.0.0.1
  "64:ff9b::a9fe:a9fe", // NAT64 de 169.254.169.254
  "2002:7f00:1::1", // 6to4 de 127.0.0.1
  "2002:a9fe:a9fe::1" // 6to4 de 169.254.169.254
];
for (const ip of privateV6Embedded) {
  test(`isPrivateAddress: ${ip} es privada (IPv4 embebida)`, () => {
    assert.equal(isPrivateAddress(ip), true);
  });
}

const publicV6Embedded = ["::ffff:0808:0808", "64:ff9b::0808:0808", "2002:0808:0808::1"];
for (const ip of publicV6Embedded) {
  test(`isPrivateAddress: ${ip} es pública (IPv4 embebida pública)`, () => {
    assert.equal(isPrivateAddress(ip), false);
  });
}

test("isPrivateAddress: una IPv6 que no parsea se rechaza (fail closed)", () => {
  assert.equal(isPrivateAddress("::ffff:zzzz"), true);
  assert.equal(isPrivateAddress("1:2:3::4:5::6"), true);
});

test("isPrivateAddress: acepta el literal entre corchetes de una URL", () => {
  assert.equal(isPrivateAddress("[::ffff:7f00:1]"), true);
});

test("checkContentType: text/html y text/plain pasan, con o sin charset (F2-24)", () => {
  assert.equal(checkContentType("text/html").ok, true);
  assert.equal(checkContentType("text/plain; charset=utf-8").ok, true);
  assert.equal(checkContentType("TEXT/HTML").ok, true);
});

test("checkContentType: otro tipo se rechaza nombrándolo (F2-24)", () => {
  const result = checkContentType("application/json");
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason.includes("application/json"), true);
});

test("checkContentType: sin cabecera se rechaza", () => {
  assert.equal(checkContentType(null).ok, false);
});

test("extractText: quita script y style con su contenido (F2-25)", () => {
  const { text } = extractText(
    "<html><head><style>body{color:red}</style></head><body>Hola <script>alert(1)</script>mundo</body></html>"
  );
  assert.equal(text.includes("alert"), false);
  assert.equal(text.includes("color:red"), false);
  assert.equal(text, "Hola mundo");
});

test("extractText: saca el título y decodifica entidades", () => {
  const { title, text } = extractText(
    "<title>Conjuntos &amp; relaciones</title><p>a &lt; b y b &gt; c&nbsp;siempre</p>"
  );
  assert.equal(title, "Conjuntos & relaciones");
  assert.equal(text, "a < b y b > c siempre");
});

test("extractText: colapsa los espacios y recorta", () => {
  const { text } = extractText("<p>  varias\n\n  líneas   aquí  </p>");
  assert.equal(text, "varias líneas aquí");
});

test("extractText: sin título devuelve cadena vacía", () => {
  assert.equal(extractText("<p>solo cuerpo</p>").title, "");
});
