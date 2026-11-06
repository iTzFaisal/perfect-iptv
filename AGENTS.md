# AGENTS.md

Samsung Tizen TV app (HTML/CSS/vanilla JS) for Xtream Codes. `README.md` is the
source for user/install docs. The APK in the repo root is Android reference
only; do not build or port it.

## Commands

- `npm install` once. Playwright is the only dev dependency.
- `npm run serve` — mock Xtream provider + static server at
  `http://localhost:4173`; log in with `demo` / `demo`. Required before browser
  tests.
- `npm run check` — L1 static gate: JS syntax, XML, version sync, script
  manifest, whitespace. Run after every edit.
- `npm run test:unit` — L2 `node:test` suite for `js/lib/*`.
- `npm run test:smoke` — L3 login, live, one playback, reload.
- `npm test` — L4 full Playwright UI flow. Uses installed Google Chrome
  (`channel: 'chrome'`) and writes `screenshots/`. `ONLY=step` selects one step
  plus dependencies; `SMOKE=1` is the same as `test:smoke`.
- `npm run test:native` — simulates a CORS-blocked provider and the Tizen
  `tizen.download` + `tizen.filesystem` fallback.
- `npm run test:real` — optional. Reads gitignored `iptv-auth.txt`; also needs
  `node proxy/server.js` on port 8787 and the mock server.
- `npm run verify` — L1 + L2 + L4 (full UI + native). Use before packaging or
  releasing.
- `npm run package` — builds only `dist/PerfectIPTV-<version>.wgt`; there is no
  `-latest` alias.
- `TIZEN_PROFILE=... npm run package` — optional signed build; needs Tizen
  Studio's `tizen` on PATH.
- No lint, typecheck, or formatter config. `npm run check` is the static gate.
- Tests are standalone scripts; there is no Playwright runner config, so run the
  npm scripts rather than `npx playwright test`.

## Architecture

- Classic scripts only; no bundler or ESM. Script order in `index.html` matters:
  lib/* → core → ui → player → screens → app-live → app-vod → app-series →
  app-account → app-catalog → app. Each attaches to global `IPTV`;
  `scripts/check-manifest.js` enforces the order.
- `js/lib/*` are pure modules (text, format, URL, async, catalog, history,
  Store, Xtream). They may only attach exports to `window.IPTV`; no DOM,
  timers in pure logic, or Tizen APIs. They use a UMD-lite wrapper so
  `node:test` can require them directly.
- `js/core.js` owns DOM helpers and the native downloader. Providers often omit
  CORS: `Xtream.request()` in `js/lib/xtream.js` tries `fetch`, then native
  `tizen.download` + `tizen.filesystem` (serial queue, `wgt-private-tmp`),
  then an optional proxy. Do not remove the native path; `test:native` covers
  it. The download and filesystem privileges in `config.xml` are required.
- `js/player.js` uses AVPlay first. Tizen requires
  `<object id="av-player" type="application/avplayer">` in `index.html`,
  `setDisplayRect(0,0,1920,1080)`, and transparent `html`/`body` while
  `body.playing`; do not make the root opaque or remove the object. HTML5/hls.js
  is fallback only.
- `js/app.js` is boot/routing/shared state/event wiring. Feature modules
  register on `IPTV.App` (`live`, `vod`, `series`, `catalog`, `auth`) and use
  `IPTV.App.util` for shared helpers. `App.account` is the active account
  object; the login module is `App.auth`. `js/screens.js` builds HTML;
  `js/ui.js` is spatial focus and modals. Escape provider data with `IPTV.esc`
  or `UI.img`; never inject raw names or URLs.
- `docs/architecture.md` is the detailed module map and validation ladder.
- UI is fixed at 1920×1080 (meta viewport and px CSS); test at that size.
  Remote keys: Back is 10009, focusable elements use `data-focusable`, and player
  keys are captured before the UI handler.
- `config.xml` identity is `iTzFaisal1.PerfectIPTV`; the package ID must be
  exactly 10 alphanumeric characters (`scripts/package.sh` enforces this).
  Changing it breaks updates and leaves old installs behind.

## Build and install

- `scripts/package.sh` packages only `config.xml index.html icon.png css js
  vendor`. Add new runtime files there.
- The build fails if `config.xml` and `package.json` versions differ. Tizen uses
  the `config.xml` version; `package.json` is only npm metadata.
- **Version bumps are patch-only:** always increase the last number
  (`1.0.4` → `1.0.5` → `1.0.6`). Do not bump the major or minor part unless the
  user explicitly asks. Keep `config.xml`, `package.json`, `package-lock.json`,
  `js/app.js` (`VERSION`), the Settings version fallback, and README/deploy
  examples in sync.
- Pushing a `v*` tag runs `.github/workflows/release.yml`: it verifies the tag
  matches `config.xml`, runs both Playwright suites, builds the WGT, and
  publishes the package and `.sha256` to GitHub Releases. The tag must be `v` +
  the `config.xml` version. Manual runs take an existing tag as input.
- The WGT is unsigned by design. Tizen Homebrew (recommended) or Tizen Studio
  signs it. `scripts/deploy.sh` installs only and never signs. There is no
  `tizen`/`sdb` in this environment, so on-device install cannot be verified
  here.
- `dist/`, `screenshots/`, and `iptv-auth.txt` are gitignored. Never commit them
  or print credentials.
- The test provider is large (13k+ live streams, 20k movies, 10k series) and
  currently returns no EPG (`get_short_epg` empty, `get_simple_data_table`
  `[]`). “No program information” is provider behavior, not necessarily a bug.
- Search downloads only the active section’s catalog once per session; “All
  channels” initially fetches ~13k streams. The UI renders in 120-item chunks.
  Mock data is much smaller than production.
- Continue watching is derived from `Store.history`: live channel rows,
  one row per movie, and one row per series (latest episode). Text size is a
  CSS `--text-scale` setting applied at boot and on change.
- A `$WEBAPIS` 404 in a desktop browser is expected; only Tizen injects AVPlay.
  `mock/` and `proxy/` are not packaged.

## Do not

- Build/port the APK or add Android/Gradle.
- Convert to ESM/bundler or reorder scripts without testing on a Tizen-style
  local origin.
- Replace the native downloader with fetch-only; CORS-less providers will fail.
- Commit generated artifacts or credentials.
