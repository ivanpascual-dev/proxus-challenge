Default to the Node.js + pnpm workflow for this repo.

- Use `pnpm install` from the root.
- Use `pnpm run <script>` from the root, or `pnpm --filter <package> run <script>` for package scripts.
- Server TypeScript entrypoints run on Node via `node --env-file=../../.env --import tsx ...`.
- Frontend dev/build uses Vite.
- Do not use Bun-specific APIs (`Bun.serve`, `Bun.file`, `bun:*`, `bun build`) in new code.

## APIs

- Server HTTP is composed with Effect HTTP API and `@effect/platform-node`.
- Prefer Effect platform services (`FileSystem`, `Path`, `ChildProcessSpawner`) at infrastructure boundaries.
- Use native `fetch`, `WebSocket`, and standard Node APIs where appropriate.
- Keep HTTP contracts in `packages/shared`.

## Testing / checks

Use the existing scripts:

```sh
pnpm run typecheck
pnpm --filter @proxus/web run build
pnpm --filter @proxus/server run typecheck
```

## Frontend

- React app lives in `packages/web/src`.
- Vite config lives in `packages/web/vite.config.ts`.
- Tailwind output is generated into `packages/web/src/styles.generated.css` by package scripts.

## AI / local config

- `.env` lives at repo root.
- `GOOGLE_GENERATIVE_AI_API_KEY` is required for the server to start.
- Poppler commands `pdfinfo` and `pdftoppm` are required for the server to start.
- Local runtime data lives under `packages/server/.data` and must not be committed.

## Effect version

This repo runs `effect@4.0.0-beta.83`, a beta. **Do not write Effect APIs from memory.** If a pattern
is not already present somewhere in this repo, look it up first (context7 `/effect-ts/effect`,
`/websites/effect_website_v4`, or `/kitlangton/effect-solutions`). Beta APIs move between releases and
the failure shows up at runtime, not at typecheck.

Known pitfall, also flagged in `docs/effect-primer.md`: `Effect.orDie` removes a typed error from the
signature. It is convenient and it is how error information gets lost.

## Product invariants

These are the rules a contributor (human or agent) would break without noticing. Breaking one is a
regression even when everything compiles.

1. **Never translate the material's own vocabulary.** If the PDF says `set`, the tutor says `set`, not
   "conjunto". The student's exam, their code and their notes all use the source term. Translating it
   breaks the citation promise even when the citation is correct: it sends the student to a page where
   the word they just learned does not appear.
2. **Every generated question carries a verifiable citation** (`materialId` plus pages) and a topic
   taken from the material's own index. A question that cannot be anchored is marked, never silently
   published and never silently dropped.
3. **No silent failures.** When something cannot be computed, say "no data". Never substitute a
   neutral default: a broken judge returning a middling score reads as mediocre performance instead of
   as missing data, and it poisons every average downstream.
4. **The study profile is written by code, never by the model.** It updates deterministically when an
   attempt is graded. The agent reads it; the agent never writes it.
5. **The profile only moves on corrections we trust, and its signals never merge.** Multiple-choice and
   true-false always. Short answer only when the judge could grade it: a false negative sends the
   student to re-study something they already knew. Separately, what the student *marks* as important
   is its own signal, never added to observed difficulty, and exam-style penalties change the displayed
   score only. Merge any two of these into one number and the system can no longer answer why it asked
   a given question.
6. **New transport handlers do not use `Effect.orDie`.** Declare the error in `packages/shared` as part
   of the endpoint and map it. See invariant 3: a 500 that could have been "artifact not found" is a
   silent failure wearing a loud coat.
7. **Question ids are not unique across artifacts** (the authoring skill asks for `q1`, `q2`, `q3`).
   Any code that resolves an answer against a question must be certain it holds the right artifact. A
   mismatch does not throw: it grades against the wrong key and produces a plausible, wrong score.
8. **Indexed text is not the source of truth; the page is.** Where a page has no extractable text, its
   indexed content is the model's transcription. It makes work cheap, never true. Every citation points
   at the page and the reader can open the real rendering. Verifying model output against model output
   is not verification.
9. **The agent never receives context the user cannot see and remove.** When the interface sends
   something the user did not type (the open artifact, a selection, a named material), it is shown
   before sending and can be withdrawn. Silently attaching what is on screen is helpful exactly once
   and unexplainable forever after.
10. **New capabilities ride the existing `cli` tool.** Tool parameters are declared twice, once in the
    harness and once by hand in the model adapter, whose `switch` falls back to the demo agent's
    signature. A tool added without touching that switch is silently given the wrong schema, so
    capabilities are added as CLI commands instead.
11. **No implicit limits.** Everything the system processes (pages in a selection, characters in a
    message, messages per window, bytes rendered, agent steps, questions in an artifact) has a ceiling
    declared in `packages/shared/src/limits.ts` and checked before anything is spent. Crossing it is
    refused out loud, **never silently trimmed**: serving 20 pages of a 1000-page request without
    saying so is not a limit, it is a hallucination with permission, because the model then answers
    about 20 pages with the confidence of having read a thousand. Budgets are **per turn, not per
    call**: the agent can call a command once per step, so a per-call ceiling multiplies by
    `maxSteps`. The ceiling belongs where the user's decision is, not where the model's is.
