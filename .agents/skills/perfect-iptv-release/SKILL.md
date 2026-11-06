---
name: perfect-iptv-release
description: Commit, push, version-bump, tag, and publish a new Perfect IPTV Tizen .wgt release to GitHub. Use whenever the user asks to commit, push, release, publish, ship, tag, or bump the version for this repository. Do not use for local test-only builds; use the perfect-iptv-build skill instead.
compatibility: Requires git, an authenticated GitHub CLI, Node.js/npm, xmllint, zip, and the repository's Playwright Google Chrome setup.
---

# Perfect IPTV GitHub Release

This repository ships Tizen `.wgt` packages through GitHub Actions. Pushing a
tag named `v<version>` runs `.github/workflows/release.yml`, which verifies the
version, runs both Playwright suites, builds `dist/PerfectIPTV-<version>.wgt`,
and creates or updates the GitHub release with the WGT and its `.sha256`.
Prefer that workflow over creating releases by hand.

## Decide the scope first

- **Commit or push only:** review and commit the requested work, then push. Do
  not bump the version, tag, or publish a release.
- **Local test build only:** use the `perfect-iptv-build` skill. Do not tag or publish.
- **Release / publish / ship:** do the full flow below, including the tag push
  that triggers the release workflow.
- If it is unclear whether the user wants a public release, ask one short
  question before pushing a tag. Tags and releases are public and hard to undo.

## Preflight

Check the repository before changing versions or publishing:

```sh
git status --short
git branch --show-current
git remote -v
git fetch origin
git log --oneline -5
git tag --list 'v*' --sort=-v:refname | head -10
gh auth status
```

Work on `main` unless the user says otherwise. Do not pull, rebase, amend, or
force-push over work you did not create. If the worktree contains changes you
did not make, inspect them and ask before including them in a release commit.

Never stage or commit `dist/`, `screenshots/`, `iptv-auth.txt`, or credentials.

## Bump the version

Versions are **patch-only within the current 0.x line** unless the user
explicitly asks for a major or minor bump: `0.1.1` becomes `0.1.2`, never
`0.2.0` on your own initiative.

Read the current version from `config.xml` and compare it with the latest `v*`
tag:

```sh
VERSION=$(xmllint --xpath 'string(/*[local-name()="widget"]/@version)' config.xml)
LATEST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
echo "config=$VERSION latest=${LATEST_TAG:-none}"
```

- If there are no `v*` tags, keep the version in `config.xml`; it is the first
  release of the current line.
- If `config.xml` is already ahead of the latest tag, keep it. A previous
  `perfect-iptv-build` skill run already claimed this unreleased version; skip
  the bump.
- If it matches the latest tag, bump the patch.
- If it is behind the latest tag, use the latest tag plus one.

The `1.x` line was retired at the `0.1.1` reset. Do not compare against or
recreate `v1.*` tags. If a TV still has a `1.x` build installed, it must be
uninstalled before the `0.1.x` package can replace it.

When a bump is needed, update npm metadata with:

```sh
npm version <new-version> --no-git-tag-version
```

When reusing an existing unreleased version, do not run `npm version` again;
just verify the version files are already in sync.

Keep these files in sync. `config.xml`, `package.json`, `package-lock.json`,
`js/app.js` (`VERSION`), and the Settings version fallback in
`js/screens.js` are required. Also update user-facing examples in `README.md`,
`scripts/deploy.sh`, and `.github/workflows/release.yml` when they contain the
old version.

Use a search to catch stale references:

```sh
rg "<old-version>" --glob '!node_modules/**' --glob '!dist/**'
rg "<new-version>" --glob '!node_modules/**' --glob '!dist/**'
```

After the `0.1.1` reset, no old-version hits are expected. Update any that
remain.

## Verify before committing

Run the fast gates from the repository root:

```sh
npm run check
npm run test:unit
```

`npm run check` verifies JS syntax, XML, version sync, script order, and
whitespace. Both fast gates must pass before committing.

The browser suites expect the mock provider at `http://localhost:4173`, so start
it in a separate shell:

```sh
npm run serve
```

Then run the full verification ladder:

```sh
npm run verify
```

`npm run verify` runs static checks, unit tests, the full UI suite, and the
native-downloader suite. Stop the mock server when finished. Fix failures before
committing or tagging; the release workflow runs the same suites and will reject
a broken tag.

## Build the package

```sh
npm run package
```

This creates `dist/PerfectIPTV-<version>.wgt`. Confirm the package exists and
contains the expected version:

```sh
unzip -p "dist/PerfectIPTV-<version>.wgt" config.xml |
  xmllint --xpath 'string(/*[local-name()="widget"]/@version)' -
```

The WGT is unsigned by design. Tizen Homebrew or Tizen Studio must re-sign it;
never tell the user it can be installed on a retail TV as-is.

## Commit and push

Review what will be committed, then stage only the intended files:

```sh
git status --short
git diff --stat
git add <intended-files>
git commit -m "<imperative summary>"
git push origin main
```

Use an imperative commit subject in the style of the existing history, for
example `Add search-as-you-type and default to Standard text size`. Keep the
version bump in the same commit as the change it releases unless the repository
history clearly uses separate commits.

Only push after the local checks pass.

## Tag and publish

The tag must be exactly `v` followed by the `config.xml` version. The workflow
rejects a mismatch between the tag, `config.xml`, and `package.json`.

```sh
git tag -a "v<version>" -m "Perfect IPTV <version>"
git push origin "v<version>"
```

Do not run `npm version` without `--no-git-tag-version`; it can create a tag
before the version files and tests are ready.

Watch the tag-triggered run:

```sh
gh run list --workflow Release --limit 3
gh run watch <run-id> --exit-status
```

A normal run takes about a minute. If the tag already exists, inspect it with
`git fetch --tags` and `git tag --list`. Do not force-move or delete a published
tag without explicit user approval; prefer fixing forward with a new patch
release.

## Verify the GitHub release

After the workflow succeeds, confirm the public release and both assets:

```sh
gh release view "v<version>" \
  --json tagName,name,url,isDraft,isPrerelease,assets \
  --jq '{tag:.tagName,name:.name,url:.url,draft:.isDraft,prerelease:.isPrerelease,assets:[.assets[]|{name:.name,size:.size}]}'
```

Expect `PerfectIPTV-<version>.wgt` and `PerfectIPTV-<version>.wgt.sha256`, with
`draft: false` and `prerelease: false` unless the user requested otherwise.

## Failure handling

- **Tag/version mismatch:** fix the version files, commit, and release with the
  next patch tag. Do not reuse the rejected tag.
- **Local tests fail:** fix the code before pushing the commit or tag.
- **Workflow tests or build fail:** read the failing job log with
  `gh run view <run-id> --log-failed`. Rerun failed jobs with
  `gh run rerun <run-id> --failed` when the failure was transient.
- **Release step fails after a successful build:** rerun the failed job first.
  If the artifact itself is wrong, fix forward with a new patch release.
- **Manual rerun of an existing tag:** use
  `gh workflow run Release -f tag=v<version>` only after confirming the tag and
  version still match.

## Report back

Keep the final report short and include:

```text
Commit:  <short-sha> <subject>
Branch:  main
Tag:     v<version>
Run:     <workflow-run-url> (success)
Release: <release-url>
Assets:  PerfectIPTV-<version>.wgt
         PerfectIPTV-<version>.wgt.sha256
```

Never print GitHub tokens or other credentials in a command, log, or report.
