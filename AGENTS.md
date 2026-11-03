# AGENTS.md

Samsung Tizen TV app (HTML/CSS/vanilla JS) for Xtream Codes. `README.md` is the
source for user/install docs. The APK in the repo root is Android reference
only; do not build or port it.

## Commands

- `npm install` once. Playwright is the only dev dependency.
- `npm run serve` — mock Xtream provider + static server at
  `http://localhost:4173`; log in with `demo` / `demo`. Required before tests.
- `npm test` — Playwright UI flow. Uses installed Google Chrome
  (`channel: 'chrome'`) and writes `screenshots/`.
- `npm run test:native` — simulates a CORS-blocked provider and the Tizen
  `tizen.download` + `tizen.filesystem` fallback.
- `npm run test:real` — optional. Reads gitignored `iptv-auth.txt`; also needs
  `node proxy/server.js` on port 8787 and the mock server.
- `npm run package` — builds only `dist/PerfectIPTV-<version>.wgt`; there is no
  `-latest` alias.
- `TIZEN_PROFILE=... npm run package` — optional signed build; needs Tizen
  Studio's `tizen` on PATH.
- No lint, typecheck, or formatter config. Verify JS with
  `for f in js/*.js; do node --check "$f"; done` and XML with
  `xmllint --noout config.xml`.
- Tests are standalone scripts; there is no Playwright runner config, so run the
  npm scripts rather than `npx playwright test`.

## Architecture

- Classic scripts only; no bundler or ESM. Script order in `index.html` matters:
  hls → core → ui → player → screens → app. Each attaches to global `IPTV`.
- `js/core.js` owns Store/localStorage and `IPTV.Xtream`. Providers often omit
  CORS: `request()` tries `fetch`, then native `tizen.download` +
  `tizen.filesystem` (serial queue, `wgt-private-tmp`), then an optional proxy.
  Do not remove the native path; `test:native` covers it. The download and
  filesystem privileges in `config.xml` are required for it.
- `js/player.js` uses AVPlay first. Tizen requires
  `<object id="av-player" type="application/avplayer">` in `index.html`,
  `setDisplayRect(0,0,1920,1080)`, and transparent `html`/`body` while
  `body.playing`; do not make the root opaque or remove the object. HTML5/hls.js
  is fallback only.
- `js/app.js` is controller/routing; `js/screens.js` builds HTML;
  `js/ui.js` is spatial focus and modals. Escape provider data with `IPTV.esc`
  or `UI.img`; never inject raw names or URLs.
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
- Search downloads the full catalog once per session; “All channels” initially
  fetches ~13k streams. The UI renders in 120-item chunks. Mock data is much
  smaller than production.
- A `$WEBAPIS` 404 in a desktop browser is expected; only Tizen injects AVPlay.
  `mock/` and `proxy/` are not packaged.

## Do not

- Build/port the APK or add Android/Gradle.
- Convert to ESM/bundler or reorder scripts without testing on a Tizen-style
  local origin.
- Replace the native downloader with fetch-only; CORS-less providers will fail.
- Commit generated artifacts or credentials.
