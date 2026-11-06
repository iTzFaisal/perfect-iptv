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
LATEST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
echo "config=$VERSION latest=${LATEST_TAG:-none}"
```

Build from the working tree as-is. Do not discard or revert changes you did not
make. If the tree contains unfamiliar changes, inspect them before packaging;
they will be included in the WGT.

Keep `dist/`, `screenshots/`, and `iptv-auth.txt` out of git.

## 2. Choose the version

The goal is a version that can be installed over the copy already on the TV.

- If there are no `v*` tags, keep the version in `config.xml`; it is the first
  release of the current line.
- If `config.xml` is **ahead of** the latest `v*` tag, keep it. A previous build
  already claimed this unreleased version.
- If `config.xml` **matches** the latest tag, bump the patch by one:
  `0.1.1` becomes `0.1.2`, never `0.2.0` unless the user asks.
- If `config.xml` is behind the latest tag, use the latest tag plus one.

The `1.x` line was retired at the `0.1.1` reset. Do not compare against or
recreate `v1.*` tags. If a TV still has a `1.x` build installed, it must be
uninstalled before the `0.1.x` package can replace it.

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

`npm run check` fails on a mismatch between the first four and warns about stale
examples.

Check for stale references:

```sh
rg "<old-version>" --glob '!node_modules/**' --glob '!dist/**'
rg "<new-version>" --glob '!node_modules/**' --glob '!dist/**'
```

After the `0.1.1` reset, no old-version hits are expected. Update any that
remain.

## 4. Verify

Run the fast gates first:

```sh
npm run check
npm run test:unit
```

`npm run check` verifies JS syntax, XML, version sync, script order, and
whitespace. It must pass before packaging.

Run the browser suites. The mock provider must be serving
`http://localhost:4173`:

```sh
npm run serve
```

In another shell:

```sh
npm run test:smoke
npm test
npm run test:native
```

`npm run verify` runs the static, unit, full UI, and native suites in one
command; it still needs the mock server. Stop the mock server when finished. If
a test fails, fix the code and rerun the failed suite; do not package or report a
broken build as successful.

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
