# Architecture

Perfect IPTV is a classic-script Tizen web app. There is no bundler, no ESM,
and no build step for runtime code. `scripts/package.sh` copies the runtime
files into a `.wgt` unchanged.

## Decision: stay on plain JavaScript

We are not migrating to TypeScript yet.

- The app is ~4,800 lines across a small number of files with one maintainer.
- TypeScript would require `import`/`export`, which means a bundler or native
  ESM. That is a packaging and Tizen-runtime risk, not only a compiler change.
- The maintainability problems are test quality, hidden coupling, and file size,
  not missing type annotations.

Use JSDoc where it clarifies a contract. Revisit TypeScript only if one of these
becomes true:

- a second regular contributor or external PRs
- JS grows past ~10k lines or gains several new modules
- code is shared with a web/PWA client
- repeated refactors of the core data flow
- recurring undefined/null/provider-shape bugs that types would have caught

Do not add a bundler without a decision record that supersedes this section.

## Script order

`index.html` loads every runtime script in dependency order. `js/app.js` must be
last; feature modules register themselves on `window.IPTV.App` without running.

```text
vendor/hls.min.js
js/lib/text.js        js/lib/format.js      js/lib/url.js
js/lib/async.js       js/lib/catalog.js     js/lib/history.js
js/lib/store.js       js/lib/xtream.js
js/core.js
js/ui.js
js/player.js
js/screens.js
js/app-live.js        js/app-vod.js         js/app-series.js
js/app-account.js     js/app-catalog.js
js/app.js
```

`scripts/check-manifest.js` enforces this. It verifies that every file under
`js/` appears exactly once, all `js/lib/*` scripts load before `core.js`, the
core chain keeps its order, and `app.js` is last. Add new runtime files to
`index.html` and, if they are part of the core chain, to the checker.

## Module map

| File | Responsibility |
| --- | --- |
| `js/lib/text.js` | `esc`, `icon`, `initials`, base64 text decoding |
| `js/lib/format.js` | time, duration, position, date, relative-time formatting |
| `js/lib/seek.js` | tap/hold seek acceleration curve and media clamping |
| `js/lib/url.js` | server normalization, pasted provider URLs, absolute art URLs, ids |
| `js/lib/async.js` | debounce, sleep, error text |
| `js/lib/catalog.js` | sort options, stable sorting, recent list, search filter |
| `js/lib/history.js` | history keys, sorting, continue-watching dedupe, trimming |
| `js/lib/store.js` | `localStorage` adapter and the `Store` singleton |
| `js/lib/xtream.js` | Xtream client, EPG normalization, URL builders |
| `js/core.js` | DOM helpers and the Tizen native downloader |
| `js/ui.js` | spatial D-pad focus, modals, toasts, remote keys |
| `js/player.js` | AVPlay first, HTML5/hls.js fallback, accelerated hold-to-seek, resume, next episode |
| `js/screens.js` | pure HTML templates for every view and detail modal |
| `js/app-live.js` | channel list, preview, EPG, zapping, catch-up |
| `js/app-vod.js` | movie list, detail, resume, playback |
| `js/app-series.js` | series list, seasons, episodes, next episode |
| `js/app-account.js` | login, saved accounts, settings actions, logout |
| `js/app-catalog.js` | section search and sorting |
| `js/app.js` | boot, routing, shared state, event wiring, back/exit |

`js/lib/*` must not touch the DOM or Tizen APIs. The only exception is
attaching exports to `window.IPTV`.

## Dependency headers

Every runtime file starts with a short comment:

```js
/* @requires: IPTV.esc, IPTV.Store
   @exports: IPTV.App.live */
```

The header documents intent and makes hidden coupling visible. The current
manifest checker validates order and file coverage; it does not parse these
headers yet. Keep them accurate when a module gains or loses a dependency.

## Shared state and feature contract

`IPTV.App` is the public controller object. It owns `state`, `cache`, `api`,
`account`, and `view`.

Shared helpers live in `IPTV.App.util` and are resolved at call time:

```js
IPTV.App.util.renderView()
IPTV.App.util.switchView('movies')
IPTV.App.util.focusFirstView()
IPTV.App.util.sectionState('vod')
```

Feature modules register one namespace and must not create globals:

```js
IPTV.App.live = { ensure, load, play, focus, item, preview, select, openEpg, playCatchup };
IPTV.App.vod = { ensure, load, item, open, play, resume, focus };
IPTV.App.series = { ensure, load, item, open, resume, showModal, episodes, playEpisode, focus };
IPTV.App.catalog = { openSearch, doSearch, openSort, setSort, ensure, recent, all, searchResult };
IPTV.App.auth = { show, connect, connectSaved, submit, setSetting, refreshAll, clearHistory, logout, deleteAccount };
```

`App.account` is the active account object, not the account feature module.
The module namespace is `App.auth`.

Feature files only define functions at load time. `boot()` in `app.js` calls them
after every script is present. Script order cannot be changed without updating
`check-manifest.js`.

## Data flow

- `js/lib/xtream.js` builds `player_api.php` URLs and normalizes responses.
  `request()` tries `fetch`, then the native downloader registered by
  `js/core.js`, then an optional proxy. Do not remove the native path.
- `js/core.js` owns `tizen.download` + `tizen.filesystem` (serial queue,
  `wgt-private-tmp`). The download and filesystem privileges in `config.xml`
  are required.
- `js/lib/store.js` keeps the `perfectiptv.v1.*` keys. Do not rename them:
  saved accounts, favorites, and resume positions must survive updates.
- `js/screens.js` renders strings only. Escape provider data with `IPTV.esc` or
  `UI.img`; never inject raw names or URLs.
- `js/player.js` uses AVPlay first. Keep
  `<object id="av-player" type="application/avplayer">`, the 1920×1080 display
  rect, and transparent `html`/`body` while `body.playing`. During a held seek
  only the HUD advances; the engine seek is committed once on release. Do not
  call `seekTo`/set `currentTime` on every repeat, or seeking will stutter.

## Validation ladder

| Level | Covers | Command | Target |
| --- | --- | --- | --- |
| L1 static | syntax, XML, versions, script manifest, whitespace | `npm run check` | < 2 s |
| L2 unit | format, seek, URL, catalog, history, Store, Xtream | `npm run test:unit` | < 2 s |
| L3 smoke | login, live, one playback, reload | `npm run test:smoke` | < 60 s |
| L4 full | full UI suite + native fallback | `npm test && npm run test:native` | minutes |
| L5 package | WGT build, version/hash check, on-device install | `perfect-iptv-build` skill | minutes |

Use L1 after every edit, L2 when logic changes, L3 for UI changes, and L4/L5
before packaging or releasing. `npm run verify` runs L1 + L2 + L4.

The mock provider must be running for L3/L4:

```sh
npm run serve
```

`ONLY=sort npm test` runs one UI step plus its dependencies. `SMOKE=1 npm test`
runs only the smoke steps. Every UI step asserts, console/page errors fail the
suite, and HTTP 4xx/5xx responses fail the suite.

There is no push/pull-request CI workflow. Run the ladder locally with
`npm run verify`. The release workflow (`.github/workflows/release.yml`) runs on
`v*` tags: it verifies the version, runs the static checks and both full
Playwright suites, builds the WGT, and publishes it.

## Versioning and packaging

- `config.xml` is the source of truth for the Tizen version.
- The project restarted at `0.1.1` on 2026-11-06. The `1.x` line is retired and
  its tags/releases were removed; do not recreate them.
- Keep `package.json`, `package-lock.json`, `js/app.js` (`VERSION`), and the
  Settings fallback in `js/screens.js` in sync. `npm run check` verifies them.
- Bump `0.x` patch versions only unless the user explicitly asks otherwise.
- `scripts/package.sh` packages `config.xml index.html icon.png css js vendor`.
  New runtime directories must be added there.
- The WGT is unsigned by design. Tizen Homebrew or Tizen Studio signs it.
