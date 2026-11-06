---
name: perfect-iptv-install
description: Install or update Perfect IPTV on the Samsung Tizen TV through Tizen Homebrew at port 8091, using a locally built or downloaded .wgt. Use whenever the user asks to install, deploy, sideload, push, put on the TV, or update Perfect IPTV or a .wgt on the TV, including "try the new build on the TV", after perfect-iptv-build, or after a release. Do not use for building or packaging (perfect-iptv-build) or committing, tagging, or publishing (perfect-iptv-release).
compatibility: Requires Node.js with the repo's Playwright dependency, Google Chrome, unzip, and network access to the TV's Tizen Homebrew page. The TV must be running Tizen Homebrew and showing its 6-digit pairing PIN.
---

# Perfect IPTV Install (Tizen Homebrew)

Install a packaged `.wgt` on the Samsung TV running **Tizen Homebrew**. The
Homebrew channel serves a small web app from the TV itself at
`http://<TV-IP>:8091`; it re-signs the unsigned package for that TV and installs
it, so no Tizen Studio or `sdb` is needed.

This is the fast path from a build to real hardware. Install only: leave version
files and git alone, and never build, tag, or publish here.

## Boundaries

- The WGT may be unsigned; Homebrew re-signs it. Never tell the user the WGT is
  installable on a retail TV without Homebrew or Tizen Studio signing.
- Never guess the pairing PIN and never retry a rejected PIN. Failed attempts
  can lock pairing until the Homebrew channel restarts. Ask for the current PIN.
- Keep the PIN out of committed files, screenshots, and the final report.
- Do not commit `screenshots/` or `dist/`.

## 1. Find the package

By default the script installs
`dist/PerfectIPTV-<config.xml version>.wgt` from the repository root. If that
file is missing, build it first with `perfect-iptv-build`; do not silently
install a stale `dist/` file from another version.

To install a published release instead of a local build:

```sh
gh release download v<version> --pattern '*.wgt' --dir dist
```

The script validates the package identity (`iTzFaisal1.PerfectIPTV`), reads its
version, and prints its SHA-256 before touching the TV.

## 2. Reach the TV

The TV's LAN address is assigned by DHCP and can change after a router reboot,
lease renewal, or the TV reconnecting. Read the current address from the
**Tizen Homebrew** screen on the TV; the same screen shows the PIN. The last
known address is `http://192.168.1.133:8091`, but treat it as a hint, not a
constant.

Check the page and the package without pairing:

```sh
node .agents/skills/perfect-iptv-install/scripts/install.js \
  --url http://192.168.1.133:8091 --dry-run
```

If this cannot find Tizen Homebrew, ask the user for the address shown on the TV.
Do not probe random addresses.

## 3. Ask for the PIN

Ask the user for the **6-digit PIN currently shown on the TV**. It changes every
time the Homebrew channel restarts, so an old PIN is useless. Wait for the
answer before launching the install; do not try a guessed or remembered PIN.

## 4. Install

Run from the repository root, passing the PIN through the environment so it does
not appear in the script's output:

```sh
HB_PIN='<pin>' node .agents/skills/perfect-iptv-install/scripts/install.js \
  --url http://<tv-ip>:8091
```

Use `--wgt <path>` to install a downloaded release asset or a specific build.

The script makes exactly one pairing attempt, uploads the WGT, waits up to five
minutes for re-signing and install, prints the Homebrew outcome, and saves
`screenshots/homebrew-install-<version>.png`. Exit codes: `0` installed, `1`
preflight problem, `2` the TV rejected the package, `3` pairing failed, `4`
timeout.

## 5. Confirm

Report success only when the output contains `INSTALLED` and the expected
version. Tell the user to open Perfect IPTV from the TV's home row and check
**Settings → About** (version, Developer, GitHub Repo). Include the installed
version and screenshot path.

If the TV already has the same version and refuses the install, build a higher
patch with `perfect-iptv-build`; do not force or downgrade.

## Failure handling

- **Pairing rejected** ("Enter the PIN shown on the TV first", wrong PIN, or "Too
  many incorrect PINs"): the PIN is stale or pairing is locked. Ask the user to
  restart Tizen Homebrew on the TV and provide the new PIN. Do not loop attempts.
- **Developer Mode is off**: enable it on the TV via Apps → 12345 → Developer
  Mode, then restart the TV.
- **No sdb route / debug IP wrong**: set Host PC IP to `127.0.0.1` in Apps →
  12345 → Settings and restart the TV; that value is only read at startup.
- **A different build of this app is already installed**: an older 1.x or
  differently signed build is present. Uninstall Perfect IPTV on the TV, then
  install again.
- **The TV rejected the install**: usually the installed version is equal or
  higher, or the signature is wrong. Build the next patch with
  `perfect-iptv-build`, or uninstall the existing copy first.
- **Certificate rejected**: Homebrew clears the certificate; run the install
  once more so it re-signs with a fresh one.
- **Certificate missing**: the TV needs a Samsung certificate before it will
  accept packages. Reopen the Tizen Homebrew installer on the TV/computer,
  complete the Samsung account step, then retry.
- **Privilege too high / security error**: the TV refused a requested privilege
  or the package before reading it. This app should not hit these; inspect
  `config.xml` and the build before retrying.
- **Connection dropped or timeout**: the TV address changed or the channel
  closed. Recheck the address; if Homebrew restarted, ask for the new PIN.

## Do not

- Do not use `tizen` or `sdb`; neither is available in this environment.
- Do not bump versions, commit, tag, or publish from this skill.
- Do not install a build that failed `npm run verify`; the build skill owns that
  gate.
