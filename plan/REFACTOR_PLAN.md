# Perfect IPTV — Validation & Maintainability Plan

Status: proposed
Date: 2026-11-06
Scope: developer workflow, tests, and internal structure. No user-facing behavior
change is intended.

## Decision

Stay on plain JavaScript. Do **not** migrate to TypeScript now.

Reasons:

- The app is ~4,450 lines of JS across 5 files with a single maintainer and a
  stable architecture (classic scripts, `window.IPTV`, explicit script order).
- TypeScript would force `import`/`export`, which means a bundler or native ESM.
  That is a packaging and Tizen-runtime risk, not just a compiler change.
- The real maintainability problems are test quality, hidden coupling, and
  `app.js` being a 1,588-line monolith — not missing type annotations.

Revisit TypeScript only if one of these becomes true:

- a second regular contributor or external PRs
- JS grows past ~10k lines or gains several new modules
- code is shared with a web/PWA client
- repeated refactors of the core data flow
- recurring undefined/null/provider-shape bugs that types would have caught

Until then, use plain JS plus JSDoc where it helps. No build step.

## Current state

| Item | Value |
| --- | --- |
| OpenCode | v2.2.5 — no LSP runtime, so checks must be explicit |
| App version | 1.0.6 (`config.xml`, `package.json`, `js/app.js`) |
| JS | `app.js` 1,588; `core.js` 877; `player.js` 682; `screens.js` 663; `ui.js` 390 |
| CSS | `css/app.css` 1,338 |
| Tests | `scripts/test-ui.js` 314; `test-native.js` 122; `test-real.js` 97 |
| CI | release only, on `v*` tags (`.github/workflows/release.yml`) |
| Dependencies | Playwright only |

### Critical finding

`scripts/test-ui.js` mostly logs values instead of asserting them:

```js
console.log('d-pad focus:', focusBefore, '->', focusAfter,
  focusBefore !== focusAfter ? 'ok' : 'FAILED');
```

It prints `FAILED` but exits 0. The `errors` array (page errors, console errors,
HTTP 4xx/5xx) is printed at the end but never checked. `npm test` currently fails
only on timeouts and thrown exceptions, not on wrong behavior.

This must be fixed before adding more checks. A test that cannot fail is worse
than no test because it creates false confidence.

## Goals

1. Make the existing UI suite actually assert, and fail on browser errors.
2. Give every change a fast (< 2 s) static gate and a 1–2 s unit gate.
3. Keep the full Playwright suites for behavior changes and releases.
4. Reduce `app.js` and `core.js` into small, single-purpose modules without a
   bundler.
5. Make dependencies explicit so script order cannot silently break.
6. Run the fast checks on every push/PR, not only at release time.

## Non-goals

- No TypeScript migration, bundler, or ESM conversion.
- No redesign of the UI or player.
- No change to the WGT format, package ID, or `scripts/package.sh` file list.
- No new runtime dependencies. Unit tests use `node:test`.
- No rewrite of `screens.js`; it is already mostly pure templates.

## Validation ladder

| Level | What it covers | Command | Target |
| --- | --- | --- | --- |
| L1 static | JS syntax, XML, version sync, script manifest, whitespace | `npm run check` | < 2 s |
| L2 unit | Pure logic: format, URL, catalog, history, normalization | `npm run test:unit` | < 2 s |
| L3 smoke | Login, nav, one live play, one detail open | `npm run test:smoke` | < 60 s |
| L4 full | `npm test` + `npm run test:native` | `npm test && npm run test:native` | current |
| L5 package | WGT build, version/hash verification, on-device install | `perfect-iptv-build` skill | minutes |

Use L1 after every edit. Use L2 when logic changes. Use L3 for UI changes. Use
L4/L5 before packaging or releasing.

---

## Phase 1 — Make the UI suite trustworthy

**Goal:** `npm test` fails when behavior is wrong, not only when the page
crashes.

### Tasks

- [ ] Add a tiny step runner to `scripts/test-ui.js`:

  ```js
  const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
  const ran = [];
  async function step(name, fn) {
    if (ONLY.length && !ONLY.includes(name)) return;
    ran.push(name);
    await fn();
  }
  ```

- [ ] Wrap each existing block in `step(...)` with stable names:
  `login`, `live`, `sort`, `epg`, `continue-empty`, `search`, `movies`,
  `recent`, `series`, `favorites`, `play-live`, `history`, `reload`,
  `logout`, `saved-account`.
- [ ] Replace every value check with `node:assert/strict`:

  ```js
  const assert = require('node:assert/strict');
  assert.notEqual(focusAfter, focusBefore, 'd-pad focus did not move');
  assert.ok(count > 0, 'expected channel cards');
  assert.equal(firstName, expected, 'A-Z sort order');
  ```

- [ ] Fail on browser errors at the end:

  ```js
  assert.deepEqual(errors, [], 'browser errors:\n' + errors.join('\n'));
  ```

- [ ] Prefer `page.waitForFunction(...)` / `waitForSelector(...)` over fixed
  `waitForTimeout(...)` for anything that can be awaited. Keep small timeouts
  only for animations.
- [ ] Add a `SMOKE=1` mode that runs only
  `login,live,play-live,reload` (L3). `ONLY=` selects arbitrary steps.
- [ ] Make `test-native.js` and `test-real.js` follow the same step conventions
  (they already exit non-zero on failure).

### Acceptance

- `ONLY=sort npm test` runs one block and fails if the order is wrong.
- A deliberately broken selector or sort order makes `npm test` exit 1.
- Console/page errors fail the suite.
- Full `npm test` still passes against the mock provider.

**Files:** `scripts/test-ui.js`, `scripts/test-native.js` (minor),
`scripts/test-real.js` (minor), `package.json` scripts.
**Effort:** 0.5–1 day.
**Risk:** Assertions may expose existing flaky checks. Triage each; fix or
document as a known issue — do not simply loosen the assertion.

---

## Phase 2 — Fast checks, hooks, and CI

**Goal:** Catch syntax, XML, version, and script-order mistakes in under two
seconds, locally and on every push.

### 2.1 `scripts/check.sh`

- [ ] Create `scripts/check.sh`:

  ```sh
  #!/usr/bin/env bash
  set -euo pipefail
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  cd "$ROOT"

  for f in js/*.js js/lib/*.js; do
    [ -e "$f" ] || continue
    node --check "$f"
  done

  xmllint --noout config.xml
  node scripts/check-version.js
  node scripts/check-manifest.js
  git diff --check
  ```

- [ ] `scripts/check-version.js` compares the version in:
  - `config.xml` (`widget@version`)
  - `package.json`
  - `js/app.js` (`var VERSION = '...'`)
  - `js/screens.js` Settings fallback

  Exit non-zero on mismatch, print all values. Optionally warn (not fail) on
  stale README/deploy examples.

- [ ] `scripts/check-manifest.js`:
  - parses `<script src="js/...">` from `index.html` in order
  - verifies every file in `js/` (including `js/lib/`) appears exactly once
  - verifies `js/core.js` is first and `js/app.js` is last
  - fails on missing, duplicate, or reordered entries

  Later: parse `@requires` / `@exports` headers and verify topological order.
  Start with the simple version.

- [ ] Add `js/lib` to the glob in `.github/workflows/release.yml` syntax step or
  call `npm run check` there instead of duplicating the loop.

### 2.2 npm scripts

- [ ] Update `package.json`:

  ```json
  "check": "bash scripts/check.sh",
  "test:unit": "node --test test/unit",
  "test:smoke": "SMOKE=1 node scripts/test-ui.js",
  "verify": "npm run check && npm run test:unit && npm test && npm run test:native"
  ```

  Keep `test`, `test:native`, `test:real`, `serve`, and `package` unchanged.

### 2.3 OpenCode hook

- [ ] Create `.opencode/plugins/checks/index.ts` (dev-only, not packaged):

  ```ts
  import { Plugin } from "@opencode/plugin"
  import { execFile } from "node:child_process"
  import { promisify } from "node:util"

  const run = promisify(execFile)

  type Part = { type: "text"; text: string }

  function parts(content: unknown): Part[] {
    if (typeof content === "string") return [{ type: "text", text: content }]
    if (Array.isArray(content)) return content as Part[]
    return []
  }

  async function check(cmd: string, args: string[]) {
    try {
      await run(cmd, args, { timeout: 5000 })
      return null
    } catch (err: any) {
      const text = String(err.stderr ?? err.message ?? err)
      return text.split("\n").slice(0, 40).join("\n")
    }
  }

  export default Plugin.define({
    id: "perfect-iptv-checks",
    async setup(ctx) {
      await ctx.tool.hook("execute.after", async (event) => {
        if (event.status !== "completed") return
        if (!["edit", "write", "patch"].includes(event.tool)) return

        const input = event.input as { path?: string; filePath?: string }
        const path = input.path ?? input.filePath
        if (!path) return

        let failure: string | null = null
        if (path.endsWith(".js")) {
          failure = await check("node", ["--check", path])
        } else if (path.endsWith("config.xml")) {
          failure = await check("xmllint", ["--noout", path])
        }
        if (!failure) return

        event.result = {
          ...event.result,
          content: [
            ...parts(event.result.content),
            { type: "text", text: `check failed for ${path}\n${failure}` },
          ],
        }
      })
    },
  })
  ```

  Keep output to the first ~40 lines. Never run Playwright from a hook.

- [ ] Confirm the hook does not fire for `read`, `grep`, or shell commands, and
  that it adds < 100 ms on a normal edit.

### 2.4 CI

- [ ] Add `.github/workflows/ci.yml`:
  - trigger: `push` and `pull_request`
  - job 1 (`static`): `npm ci`, `npm run check`, `npm run test:unit`
  - job 2 (`smoke`): start `npm run serve`, run `npm run test:smoke`
  - job 3 (optional, later): full `npm test` + `npm run test:native`

  Reuse the server-readiness loop from `release.yml`. Do not duplicate the
  release workflow; CI is the early gate.

### Acceptance

- `npm run check` fails on a syntax error, a version mismatch, and a missing
  script tag, each with a clear message.
- `npm run check` passes in under 2 seconds on a warm machine.
- The hook reports a syntax error in the same turn as the edit.
- CI runs on a branch push without a tag.

**Effort:** 0.5–1 day.

---

## Phase 3 — Unit tests and pure modules

**Goal:** Test the logic that breaks silently, without a browser, and make it
reusable.

### 3.1 Test harness

- [ ] Create `test/unit/` with `node:test` files:
  - `format.test.js`
  - `url.test.js`
  - `catalog.test.js`
  - `history.test.js`
  - `xtream.test.js`
- [ ] Add `test/unit/helpers/memory-storage.js` for the Store adapter.
- [ ] Add `test/unit/fixtures/` with recorded mock provider payloads:
  - live stream with and without `stream_icon`
  - VOD with string/number IDs
  - series with seasons/episodes
  - empty EPG list
  - malformed/partial response
- [ ] `npm run test:unit` runs `node --test test/unit`.

### 3.2 Extract pure modules into `js/lib/`

Use a UMD-lite wrapper so the same file runs in the browser and in Node:

```js
(function (root, factory) {
  var api = factory();
  root.IPTV = root.IPTV || {};
  Object.assign(root.IPTV, api);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  // pure functions only — no DOM, no timers, no network
  return { fmtDuration: fmtDuration };
});
```

Extraction order (low risk first):

| New file | Move from `core.js` | Tests |
| --- | --- | --- |
| `js/lib/text.js` | `esc`, `initials`, `icon` | escaping, initials |
| `js/lib/format.js` | `fmtTime`, `fmtClock`, `fmtDuration`, `fmtPosition`, `fmtDate`, `fmtAgo` | zero, >24h, negative, singular/plural |
| `js/lib/url.js` | `normalizeServer`, `parseProviderInput`, `absUrl`, `hash`, `uid` | URL/bare host/credentials/trailing slash |
| `js/lib/async.js` | `debounce`, `sleep`, `errorMessage` | timing with fake clock or short delays |
| `js/lib/catalog.js` | `applyCatalogSort`, `recentCatalog`, search filter | `default`, `name-asc`, `recent`; limit 200 |
| `js/lib/history.js` | continue-watching derivation | dedupe, latest-wins, one row per series |
| `js/lib/store.js` | `Store` internals | schema, round-trip, migration, corrupt JSON |
| `js/lib/xtream.js` | client + normalization | URL building, missing fields, numeric strings |

Rules:

- `js/lib/*` must not touch `document`, `window` (except attaching exports), or
  `tizen`/`avplay`.
- `core.js` keeps DOM helpers (`$`, `$$`) and becomes wiring plus the few
  browser-only pieces.
- All existing `IPTV.*` public names stay identical. No call site changes.
- Load `js/lib/*.js` before `js/core.js` in `index.html`, or have `core.js`
  depend on them explicitly. Update `check-manifest.js` expectations.

### 3.3 First unit cases (minimum)

- [ ] `fmtDuration(0)`, `fmtDuration(65)`, `fmtDuration(3725)`, `fmtDuration(-1)`
- [ ] `parseProviderInput` for full Xtream URL, host only, host with port,
  trailing slash, embedded credentials
- [ ] `normalizeServer` idempotence
- [ ] `esc` for `& < > " '` and provider names with quotes/unicode
- [ ] catalog sort stability and recent-limit truncation
- [ ] continue-watching: live row, one movie row, one series row, latest wins
- [ ] Store: save/load, corrupt JSON returns default, schema key prefix
- [ ] Xtream normalization: missing icon, numeric IDs, empty categories,
  no EPG

### Acceptance

- `npm run test:unit` runs in under 2 seconds.
- At least 25 assertions across the files above.
- Extracted functions behave identically in the browser (full suite still green).
- `core.js` shrinks by at least 40% without changing any `IPTV.*` API.

**Effort:** 2–3 days.
**Risk:** Store and Xtream are stateful; refactor behind the existing API and
keep the singleton. Do not change `localStorage` keys (`perfectiptv.v1.*`).

---

## Phase 4 — Modularize `app.js`

**Goal:** Replace the 1,588-line controller with feature modules that share an
explicit state contract.

Do this only after Phase 1 and Phase 3 are green. One module per change.

### Target structure

| File | Responsibility | Approx. lines |
| --- | --- | --- |
| `js/app.js` | boot, lifecycle, routing, shared state, event binding | ≤ 600 |
| `js/app-live.js` | channel list, preview, EPG, zap, catch-up | ~350 |
| `js/app-vod.js` | movies, detail, resume, playback | ~250 |
| `js/app-series.js` | series list, seasons, episodes | ~200 |
| `js/app-account.js` | login, saved accounts, settings actions | ~250 |

### Contract

- `IPTV.App` remains the public object and owns `state`, `cache`, `api`,
  `account`, and `view`.
- Feature modules register on it and do not create globals:

  ```js
  IPTV.App.live = {
    ensure: ensureLive,
    load: loadLive,
    play: playLive,
    focus: focusLive
  };
  ```

- Shared helpers (`renderView`, `switchView`, `focusInView`, `sectionState`)
  stay in `app.js` and are exposed as `IPTV.App.util.*` for feature modules.
- Feature files only register functions at load time; they must not execute.
  `boot()` in `app.js` calls them after all files are loaded.
- Script order in `index.html`: `core`, `ui`, `player`, `screens`,
  `app-live`, `app-vod`, `app-series`, `app-account`, `app`.

### Tasks

- [ ] Add the boot-time dependency guard in `app.js`:

  ```js
  ['Store', 'Xtream', 'UI', 'Screens', 'Player'].forEach(function (k) {
    if (!IPTV[k]) throw new Error('Missing IPTV.' + k + ' — check script order in index.html');
  });
  ```

- [ ] Add `@requires` / `@exports` headers to every JS file.
- [ ] Extract `app-account.js` first (login/saved accounts is the most isolated).
- [ ] Extract `app-live.js` (largest, but has clear boundaries).
- [ ] Extract `app-vod.js`.
- [ ] Extract `app-series.js`.
- [ ] Run `npm run test:smoke` after each extraction; full suite at the end.

### Acceptance

- `app.js` ≤ 600 lines; no feature file > 400 lines.
- No new globals beyond `window.IPTV`.
- `index.html` order passes `check-manifest.js`.
- All tests green; no behavior change on the TV.

**Effort:** 3–5 days.
**Risk:** Highest of all phases. Shared closures and state make this easy to get
wrong. Mitigate by extracting one feature at a time, with the smoke test after
each step, and by keeping every change independently revertible.

---

## Phase 5 — Documentation and skills

- [ ] Add `docs/architecture.md` (or extend `AGENTS.md`) with:
  - module map and script order
  - `@requires` / `@exports` convention
  - validation ladder and commands
  - "do not add a bundler without a decision record"
- [ ] Update `.agents/skills/perfect-iptv-build/SKILL.md` to call
  `npm run check` and `npm run test:unit` before the Playwright suites.
- [ ] Update `.agents/skills/perfect-iptv-release/SKILL.md` to run
  `npm run verify` before tagging.
- [ ] Add a short "Testing" section to `README.md` for contributors:
  `check` → `test:unit` → `test:smoke` → full suite → package.
- [ ] Record the TypeScript decision and its revisit triggers in
  `docs/architecture.md`.

**Effort:** 0.5–1 day.

---

## Sequencing and milestones

| Milestone | Phases | Outcome |
| --- | --- | --- |
| M1 | 1 + 2 | Tests assert; `npm run check` and CI catch the cheap failures |
| M2 | 3 | Unit layer and pure modules; `core.js` shrinks |
| M3 | 4 | `app.js` split by feature |
| M4 | 5 | Docs and skills match the workflow |

Suggested order: Phase 1 → Phase 2 → Phase 3 → Phase 5 (docs can land early) →
Phase 4.

Do not start Phase 4 before M2. The unit tests are what make the `app.js` split
safe.

## Success metrics

- `npm test` exits non-zero for a wrong sort order, wrong count, or focus
  failure.
- `npm run check` < 2 s and catches syntax, XML, version, and script-order
  errors.
- `npm run test:unit` < 2 s with 25+ assertions, growing to 40+.
- `js/app.js` ≤ 600 lines; `js/core.js` ≤ 400 lines after extraction.
- CI runs on every push/PR.
- No increase in release failures or on-device regressions.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| New assertions expose existing bugs | Triage and fix; if a check is genuinely flaky, document it and mark it skipped explicitly — never silently loosen it |
| Fixed sleeps make tests flaky | Replace with `waitForSelector` / `waitForFunction` where possible |
| Script-order breakage during extraction | `check-manifest.js` + boot guard + one module per commit |
| Store/Xtream refactor changes behavior | Keep `IPTV.*` API and `localStorage` keys; test against fixtures |
| Hook adds latency or noisy output | Syntax/XML only, 5 s timeout, cap output at 40 lines |
| CI Playwright is slow/flaky | Start CI with static + unit + smoke; add full suites once stable |
| Over-refactoring | Phase 4 is opt-in per feature; stop if the smoke test is not green |

## Rollback

- Phases 1, 2, and 5 are tooling/docs only: revert the commit, no runtime
  impact.
- Phase 3 keeps the public `IPTV.*` API; revert `js/lib/*` and restore the
  original functions in `core.js` if needed.
- Phase 4 lands one feature module per commit; revert the specific module and
  its script tag without touching the others.

No phase requires a version bump. A runtime change (Phase 3 or 4) gets the
normal patch bump at the next `perfect-iptv-build` / `perfect-iptv-release` run.

## Appendix — command reference

```sh
npm run serve        # mock provider + static server on :4173
npm run check        # L1: syntax, XML, versions, manifest
npm run test:unit    # L2: node:test
npm run test:smoke   # L3: login, live, play, reload
npm test             # L4: full UI suite
npm run test:native  # L4: native downloader fallback
npm run verify       # L1 + L2 + L4
npm run package      # L5: build WGT
```

## Appendix — file inventory after completion

```text
.github/workflows/ci.yml          new
.opencode/plugins/checks/index.ts new (dev-only, not packaged)
docs/architecture.md              new
js/app.js                         reduced to boot/routing/shared
js/app-live.js                    new
js/app-vod.js                     new
js/app-series.js                  new
js/app-account.js                 new
js/core.js                        reduced to wiring + DOM helpers
js/lib/text.js                    new
js/lib/format.js                  new
js/lib/url.js                     new
js/lib/async.js                   new
js/lib/catalog.js                 new
js/lib/history.js                 new
js/lib/store.js                   new
js/lib/xtream.js                  new
scripts/check.sh                  new
scripts/check-version.js          new
scripts/check-manifest.js         new
scripts/test-ui.js                step runner + assertions
test/unit/*.test.js               new
test/unit/fixtures/*              new
package.json                      check/test:unit/test:smoke/verify
```
