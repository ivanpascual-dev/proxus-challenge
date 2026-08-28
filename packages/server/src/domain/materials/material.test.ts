import assert from "node:assert/strict";
import { test } from "node:test";
import { Cause, Effect, Exit } from "effect";
import { parsePageSelection } from "./material.ts";

const runFailure = async (selection: string) => {
  const exit = await Effect.runPromiseExit(parsePageSelection(selection));
  assert.equal(Exit.isFailure(exit), true, `expected "${selection}" to fail`);
  return Cause.squash((exit as Exit.Failure<never, unknown>).cause) as { readonly _tag: string; readonly reason?: string };
};

test("parsePageSelection rejects an inverted range", async () => {
  const error = await runFailure("20-10");
  assert.equal(error._tag, "InvalidPageRange");
});

test("parsePageSelection rejects page zero", async () => {
  const error = await runFailure("0");
  assert.equal(error._tag, "InvalidPageRange");
});

test("parsePageSelection rejects a non-integer page", async () => {
  const error = await runFailure("1.5");
  assert.equal(error._tag, "InvalidPageRange");
});

test("parsePageSelection deduplicates repeated pages", async () => {
  const pages = await Effect.runPromise(parsePageSelection("1,1,2"));
  assert.deepEqual(pages, [1, 2]);
});

test("parsePageSelection sorts the output regardless of input order", async () => {
  const pages = await Effect.runPromise(parsePageSelection("5,1,3"));
  assert.deepEqual(pages, [1, 3, 5]);
});

test("parsePageSelection accepts exactly 20 pages", async () => {
  const pages = await Effect.runPromise(parsePageSelection("1-20"));
  assert.equal(pages.length, 20);
});

test("parsePageSelection rejects 21 pages, naming the ceiling and the amount requested", async () => {
  const error = await runFailure("1-21");
  assert.equal(error._tag, "TooManyPages");
});
