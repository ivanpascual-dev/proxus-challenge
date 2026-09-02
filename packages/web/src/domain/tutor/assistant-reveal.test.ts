import assert from "node:assert/strict";
import { test } from "node:test";
import { codePointLength, revealSchedule, sliceCodePoints, toCodePoints } from "./assistant-reveal.ts";

test("cero caracteres: no hay nada que revelar", () => {
  const schedule = revealSchedule(0);
  assert.equal(schedule.codePointsPerTick, 0);
  assert.equal(schedule.totalCodePoints, 0);
  assert.equal(sliceCodePoints("", 5), "");
});

test("un emoji fuera del plano básico cuenta como un punto de código y nunca se parte", () => {
  const text = "hola 👋🏽 mundo";
  // "👋🏽" son dos code points (mano + modificador de tono), cuatro unidades UTF-16.
  assert.equal(text.length > codePointLength(text), true);
  const points = toCodePoints(text);
  // Cortar por la mitad del emoji no puede producir un carácter de reemplazo: cada prefijo es válido.
  for (let i = 0; i <= points.length; i++) {
    const prefix = sliceCodePoints(text, i);
    assert.equal(prefix, points.slice(0, i).join(""));
    assert.ok(!prefix.includes("�"));
  }
});

test("texto corto: termina en un tick con al menos un carácter por tick", () => {
  const schedule = revealSchedule(codePointLength("Sí."));
  assert.equal(schedule.totalCodePoints, 3);
  assert.ok(schedule.codePointsPerTick >= 1);
  assert.ok(schedule.codePointsPerTick * (1500 / schedule.tickMs) >= schedule.totalCodePoints);
});

test("texto largo: el reparto por tick basta para acabar dentro del máximo", () => {
  const total = 2000;
  const schedule = revealSchedule(total);
  const ticks = Math.ceil(total / schedule.codePointsPerTick);
  assert.ok(ticks * schedule.tickMs <= 1500);
});

test("sliceCodePoints devuelve el texto entero cuando se piden más puntos de los que hay", () => {
  assert.equal(sliceCodePoints("abc", 10), "abc");
  assert.equal(sliceCodePoints("abc", 2), "ab");
});
