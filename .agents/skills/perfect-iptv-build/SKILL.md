---
name: perfect-iptv-build
description: Build an installable local Perfect IPTV Tizen .wgt from the current working tree for on-device testing before a release. Use whenever the user asks to build, package, compile, make a test WGT, or test this app as a .wgt, especially before running perfect-iptv-release. This skill never commits, tags, pushes, or publishes.
compatibility: Requires git, Node.js/npm, xmllint, unzip, and Google Chrome for the Playwright tests.
---

# Perfect IPTV Test Build

Produce a local, unsigned `.wgt` for testing on the TV. This is the pre-release
path: verify the current working tree, build the package, and report the result
without changing git history or publishing anything.

Do not commit, tag, push, or create a GitHub release from this skill. Use
`perfect-iptv-release` when the build has been tested and is ready to ship.

## 1. Preflight

Inspect the working tree and determine the version to build:

```sh
git status --short
VERSION=$(xmllint --xpath 'string(/*[local-name()="widget"]/@version)' config.xml)
LATEST_TAG=$(git tag --sort=-v:refname | head -1)
echo "config=$VERSION latest=$LATEST_TAG"
```

Build from the working tree as-is. Do not discard or revert changes you did not
make. If the tree contains unfamiliar changes, inspect them before packaging;
they will be included in the WGT.

Keep `dist/`, `screenshots/`, and `iptv-auth.txt` out of git.

## 2. Choose the version

The goal is a version that can be installed over the copy already on the TV.

- If `config.xml` is **ahead of** the latest `v*` tag, keep it. A previous build
  already claimed this unreleased version.
- If `config.xml` **matches** the latest tag, bump the patch by one:
  `1.0.6` becomes `1.0.7`, never `1.1.0` unless the user asks.
- If `config.xml` is behind the latest tag, use the latest tag plus one.

If a WGT for the chosen version was already installed on the TV and the TV
refuses to reinstall it, bump the patch again so the package is a real upgrade.

## 3. Sync the version

When a new version was chosen, bump npm metadata first:

```sh
npm version <new-version> --no-git-tag-version
```

When reusing an existing unreleased version, skip `npm version` and just verify
the version files are already in sync.

Keep these files in sync:

- `config.xml` (`version` attribute)
- `package.json` and `package-lock.json` (handled by `npm version`)
- `js/app.js` (`VERSION`)
- `js/screens.js` (Settings version fallback)
- User-facing examples in `README.md`, `scripts/deploy.sh`, and
  `.github/workflows/release.yml`

Check for stale references:

```sh
rg "<old-version>" --glob '!node_modules/**' --glob '!dist/**'
rg "<new-version>" --glob '!node_modules/**' --glob '!dist/**'
```

The historical example in `AGENTS.md` is expected to keep older numbers.

## 4. Verify

Run syntax checks:

```sh
for f in js/*.js; do node --check "$f"; done
xmllint --noout config.xml
```

Run both UI suites. The mock provider must be serving
`http://localhost:4173`:

```sh
npm run serve
```

In another shell:

```sh
npm test
npm run test:native
```

Stop the mock server when finished. If a test fails, fix the code and rerun the
failed suite; do not package or report a broken build as successful.

## 5. Build the WGT

```sh
npm run package
```

Confirm the package exists and carries the expected version:

```sh
WGT="dist/PerfectIPTV-<new-version>.wgt"
ls -lh "$WGT"
unzip -p "$WGT" config.xml |
  xmllint --xpath 'string(/*[local-name()="widget"]/@version)' -
shasum -a 256 "$WGT"
```

The WGT is unsigned by design. Tizen Homebrew or Tizen Studio must sign it; do
not tell the user it can be installed on a retail TV as-is.

## 6. Report

Keep the report short and include:

```text
Version: <new-version>
Package: dist/PerfectIPTV-<new-version>.wgt
Size:    <size>
SHA256:  <sha256>
Tests:   npm test + npm run test:native passed
Status:  local uncommitted build; unsigned
```

Also note that the version files are now bumped and uncommitted, so
`perfect-iptv-release` should keep this version rather than bumping again.

## Failure handling

- **Syntax or test failure:** fix the code and rerun the checks. Never tag or
  publish a failing tree.
- **Packaging failure:** read `scripts/package.sh`; it owns the file list and
  version checks. Fix the script or the missing runtime file, then rerun.
- **Version mismatch:** correct every file listed in "Sync the version" before
  rebuilding.
- **TV refuses the package:** confirm it was signed for the TV and that the
  version is higher than the installed one; bump the patch and rebuild if
  needed.
