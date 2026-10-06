# Holochain Deployment — Kangaroo-Electron

Reference for packaging and distributing Holochain hApps as standalone desktop applications using Kangaroo-Electron.

---

## What is Kangaroo-Electron

Kangaroo-Electron (`holochain/kangaroo-electron`) is Holochain's official framework for bundling a complete hApp into a standalone cross-platform desktop application. It packages together:

- The Holochain conductor
- lair-keystore (key management)
- Your hApp (`.webhapp` bundle with DNA + UI)
- An Electron shell

Users receive a single installer (`.exe` / `.dmg` / `.AppImage`) with no Holochain tooling required.

**Official repo:** https://github.com/holochain/kangaroo-electron

**Multi-branch strategy:** One branch per supported Holochain version. Always work from the branch matching your hApp's Holochain version.

**Platforms:** Windows, macOS, Linux

---

## Branch Selection

| Branch | Holochain version | Status | Use when |
|--------|-------------------|--------|----------|
| `main` | 0.7.0 (unchanged since 2026-07-31) | Not listed in the README | Behind `main-0.7`; do not assume it is the newest |
| `main-0.7` | 0.7.1 (since 2026-10-22) | "unstable" in Kangaroo's README | New 0.7 projects (this skill's line) |
| `main-0.6` | 0.6.3 | "stable" in Kangaroo's README | Existing 0.6.x apps not yet ported |
| `main-0.5` | 0.5.x | Listed, unlabelled | Old apps only |

**Default choice: `main-0.7`** unless you have a specific reason to use another. The version column moves without a Kangaroo release: read `holochainVersion` in the branch's `kangaroo.config.ts` before trusting it.

Pin to a versioned branch rather than `main`. `main` is not the newest line: it still pins 0.7.0 while `main-0.7` is on 0.7.1, and a versioned branch is the one Kangaroo's README points to for each Holochain line.

---

## Prerequisites

- Node.js and **Yarn 1** (classic): every Kangaroo script runs through `yarn`, and the repository ships a `yarn.lock` v1.
- Nothing to compile. The conductor and lair binaries are downloaded, not built, so no Rust toolchain is needed for packaging.

Kangaroo's README names no system packages for any platform. Platform-specific requirements come from `electron-builder` (for example macOS signing tools when `macOSCodeSigning` is on), not from Kangaroo itself.

---

## Repository Setup

```bash
# Use the repository as a template or fork it, then check out the right branch
git clone https://github.com/holochain/kangaroo-electron
cd kangaroo-electron
git checkout main-0.7

# First replace appId and productName in kangaroo.config.ts (see Configuration):
# yarn setup runs write:configs, which throws on the template placeholders
# Installs dependencies, downloads the conductor and lair binaries, fetches the
# webhapp if `webhapp` is set in kangaroo.config.ts, and writes the configs
yarn setup
```

**No manual compilation needed.** `yarn fetch:binaries` (run by `yarn setup`) downloads the `holochain` and `lair-keystore` binaries for `bins.holochainVersion` and checks each against the SHA256 listed per platform under `bins` in `kangaroo.config.ts`.

---

## Artifact Structure

### Production: `.webhapp` bundle in `pouch/`

A `.webhapp` is a single archive containing:
1. Your `.happ` (the DNA bundles and the hApp manifest)
2. Your UI assets (HTML/JS/CSS)

**Key distinction:** `.webhapp` ≠ `.happ`. The `.happ` is backend only. The `.webhapp` bundles both backend and frontend.

Your hApp build pipeline produces the `.webhapp` **outside** Kangaroo. Place the built file here:

```
pouch/
  your-app.webhapp     ← place your built bundle here
```

Kangaroo unpacks the first `.webhapp` it finds in `pouch/` (`scripts/unpack-pouch.js`). For CI, either commit the file (remove `pouch/*.webhapp` from `.gitignore`) or set `webhapp: { url, sha256 }` in `kangaroo.config.ts`, in which case `pouch/` must hold no `.webhapp`.

**UI icon:** Include `icon.png` (at least 256×256 px) at the root of the UI assets. Without it the icon step prints a warning, and the icon is required when `systray` is on.

### Development mode

`yarn dev` also needs the `.webhapp` in `pouch/`: it runs `pouch:unpack` before starting. `KangarooConfig` declares an optional `devConfig` (`{ happPath, uiPort }` or `{ webhappPath }`), but nothing in Kangaroo's `src/` or `scripts/` at `0498122` reads it, so do not rely on it.

---

## Configuration

Everything is in **`kangaroo.config.ts`** at the repository root, typed by `KangarooConfig` (`src/main/types.ts`). There is no `electron/config.ts`.

```typescript
export default defineConfig({
  appId: 'com.yourorg.yourapp',        // unique; defines where user data is stored
  productName: 'Your App Name',        // shown in the window bar
  version: '0.1.0',                    // overrides package.json; breaking changes here mean a new conductor
  passwordMode: 'password-optional',   // 'no-password' | 'password-optional' | 'password-required'
  macOSCodeSigning: false,
  windowsEVCodeSigning: false,
  fallbackToIndexHtml: true,           // for router-based UIs (SvelteKit, vue-router)
  autoUpdates: true,
  systray: true,
  bootstrapUrl: 'https://dev-test-bootstrap2.holochain.org/',
  relayUrl: 'https://dev-test-bootstrap2.holochain.org/',
  // networkSeed?, webhapp?: { url, sha256 }, author?
  bins: {
    holochainVersion: '0.7.1',         // match your branch
    holochain: { sha256: { /* per platform */ } },
    lair: { sha256: { /* per platform */ } },
  },
});
```

`yarn write:configs` refuses to build while `appId` or `productName` still hold the template placeholders, so two apps cannot ship under the default identity by accident. The default bootstrap and relay servers are for testing only; production apps run their own, and changing either URL after release can partition the network.

---

## Critical Versioning Semantics

Kangaroo uses a versioning convention that controls user data isolation:

| Version change | Data folder | Effect |
|----------------|-------------|--------|
| Patch (`0.1.0 → 0.1.1`) | **Shared** | User keeps data, **but the new `.happ` is not installed** (see below) |
| Patch on `0.0.x` (`0.0.1 → 0.0.2`) | **Isolated** | Every `0.0.x` patch is its own folder: user starts fresh |
| Minor below 1.0 (`0.1.0 → 0.2.0`) | **Isolated** | Breaking: user starts fresh, as a new agent |
| Minor or patch from 1.0 on (`1.0.0 → 1.1.0`) | **Shared** | Same as a patch: user keeps data, **but the new `.happ` is not installed** |
| Major (`0.1.0 → 1.0.0`, `1.2.0 → 2.0.0`) | **Isolated** | Breaking: user starts fresh, as a new agent |
| Pre-release tag | Keyed on `major.minor.patch-<first prerelease identifier>` | `0.2.0-beta.1 → 0.2.0-beta.2` shares a folder; a different base version or identifier does not |

The folder name comes from `breakingAppVersion()` in `src/main/filesystem.ts` on Kangaroo `main-0.7`: `0.0.<patch>` while major and minor are both 0, `0.<minor>.x` while major is 0, `<major>.x.x` after that.

**A patch release ships new UI on old zomes.** On launch, `installHappIfNecessary()` in `src/main/holochainManager.ts` returns early when an app with id `kangaroo.happ` (`HAPP_APP_ID` in `src/main/const.ts`) is already installed. A patch release (or a minor release from 1.0 on) reuses the same conductor, where that id is already installed, so the `.happ` bundled in the new build is never installed. The UI does come from the new build, so the result is new screens calling the previous release's zome functions, with no error at install time.

- **Coordinator-only changes** can still ship in a patch release if the app does the swap itself: on launch, when the app id is already installed, read the coordinator zomes out of the bundled `.happ` and send the admin `UpdateCoordinators` request (`adminWebsocket.updateCoordinators()` in `@holochain/client`) for every cell, clones included, since each `UpdateCoordinatorsPayload` names one `cell_id`. This is a patch to Kangaroo's main process, not a setting. One worked example: [Hearth's `desktop-patches/`](https://github.com/topeuph-ai/hearth/tree/main/desktop-patches).
- **Integrity changes** cannot go that way. They change the DNA hash, so they need a new app id or a bump that changes the data folder (a minor bump below 1.0, a major bump from 1.0 on), plus whatever in-app migration carries the data across (see `migration.md`).

**An isolated bump also changes who the user is.** The same `installHappIfNecessary()` calls `generateAgentPubKey()` for every fresh install, so after any bump that changes the data folder the user is a new agent to every peer who knew them, not just someone with an empty database.

**Rule of thumb:** Use a bump that keeps the data folder (a patch, or a minor from 1.0 on) only for changes that need no new `.happ` (UI-only), or for coordinator changes when the app runs the `UpdateCoordinators` step above. Start real releases at `0.1.0`, not `0.0.x`. Reserve folder-changing bumps (minor below 1.0, major from 1.0) for intentional breaking changes where data migration is not required (or is handled in-app).

---

## Network Transport (0.7)

Holochain 0.6 introduced **iroh** alongside tx5. **0.7 removed tx5 and WebRTC entirely** — iroh over QUIC is the only transport, and it is compiled in unconditionally, so the `transport-iroh` Cargo feature no longer exists.

On every launch Kangaroo writes the app's `conductor-config.yaml` from its template and sets `network.bootstrap_url` and `network.relay_url` from `kangaroo.config.ts` (`src/main/holochainManager.ts`). It needs a `relayUrl` and must **not** carry `signalUrl` or `webrtcConfig`:

```typescript
// kangaroo.config.ts on main-0.7
bootstrapUrl: 'https://dev-test-bootstrap2.holochain.org/',
relayUrl: 'https://dev-test-bootstrap2.holochain.org/',
// signalUrl: removed in 0.7 — see below
```

This is not a field that gets ignored. `NetworkConfig` rejects unknown fields, so a config left over from 0.6 that still sets `signal_url` or `webrtc_config` makes the conductor **fail to start** rather than warn.

---

## CLI Commands

```bash
yarn setup             # install dependencies, fetch binaries (and the webhapp if configured), write configs
yarn dev               # launch in development mode
yarn build:linux       # production build for this platform: AppImage and .deb
yarn build:mac-arm64   # Apple Silicon .dmg (yarn build:mac-x64 for Intel)
yarn build:win         # Windows NSIS installer (*-setup.exe)
```

Script names are from `package.json`. Kangaroo's README writes `yarn build:windows`, but the script is `build:win`.

---

## CI/CD via GitHub Actions

Kangaroo ships one workflow, `.github/workflows/release.yaml`, triggered by a push to the **`release`** branch. Signing is not a separate branch: it is switched on by `macOSCodeSigning` and `windowsEVCodeSigning` in `kangaroo.config.ts`. macOS notarization also needs the `afterSign: scripts/notarize.js` line uncommented in `templates/electron-builder-template.yml`.

1. Give CI the `.webhapp`: commit it in `pouch/`, or set `webhapp: { url, sha256 }`.
2. Create a draft GitHub release whose tag is `v` plus `version` from `kangaroo.config.ts` (for example `v0.1.0`). The workflow uploads the installers to it.
3. Merge `main` into `release` and push (`git checkout -b release` the first time).

**Secrets, only when the matching signing flag is on:**
- macOS (`macOSCodeSigning: true`): `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_DEV_IDENTITY`, `APPLE_ID_EMAIL`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`
- Windows (`windowsEVCodeSigning: true`, an EV certificate in Azure Key Vault signed with AzureSignTool): `AZURE_KEY_VAULT_URI`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_CERT_NAME`

---

## Auto-Update

Kangaroo uses `@matthme/electron-updater`. A comment in `src/main/index.ts` says the updater comes from a patched fork (`holochain/electron-builder`) so that `checkForUpdates()` returns the newest semver-compatible release rather than the newest release overall; Kangaroo then checks compatibility itself.

- Runs on startup only when `autoUpdates` is `true` and the app is packaged.
- Offers only updates with the same breaking version as the installed app and a higher version number. A breaking update is never offered, because it would be a different conductor.
- Never installs silently: the user gets an "Update Available" dialog with **Deny** and **Install and Restart**.
- Requires your GitHub repository to have releases with the installers attached, which the CI workflow produces.

---

## Other Deployment Options

| Option | Description | When to use |
|--------|-------------|-------------|
| **p2p Shipyard** | darksoil.studio's Tauri-based suite for desktop and mobile, distributed under a single-tier licence ([pricing](https://darksoil.studio/p2p-shipyard/pricing)) | Need mobile builds |
| **Moss** | Holochain groupware framework | App integrates into a shared workspace |

---

## What NOT to Use

| Tool | Reason |
|------|--------|
| **Holochain Launcher** | Its README: "not being actively maintained", usable with Holochain 0.4, "support for Holochain 0.5+ should not be expected", and it recommends Kangaroo for distribution |
| **Kangaroo-Tauri** | Frozen at Holochain 0.3.2 (last update Aug 2024). Not maintained. |

---

## Troubleshooting

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| App won't start after version bump | Bump changed the breaking version (minor below 1.0, major from 1.0) → new isolated data folder | Expected behavior. User data is not migrated automatically; implement migration if needed. |
| `yarn build` fails its typecheck on the config | `relayUrl` (or another required field) missing from `kangaroo.config.ts` | `relayUrl` is a required `KangarooConfig` field; set it |
| Conductor exits immediately on start | Config still sets `signal_url` / `webrtc_config` (0.6 `NetworkConfig` fields) or `chc_url` / `db_sync_strategy` (0.6 `ConductorConfig` fields) | Remove them. Both structs are `deny_unknown_fields`, so 0.7 rejects them instead of ignoring them. `db_sync_strategy` is now `db_sync_level` (`Full`/`Normal`/`Off`) |
| Conductor can't read existing data after upgrade | 0.7 renamed its databases and changed DNA hashes | Expected. There is no migration path. For a Kangaroo app, delete its `userData` directory, whose path Kangaroo logs at startup as the one to delete for a factory reset; `hc sandbox clean` only removes `hc sandbox` sandboxes |
| Binary checksum mismatch | Corrupted download, or `bins.holochainVersion` changed without its hashes | `rm -rf resources/bins && yarn fetch:binaries`. After changing `holochainVersion`, run `yarn update:binary-hashes` first |

**Reference:** [developer.holochain.org/get-started/4-packaging-and-distribution/](https://developer.holochain.org/get-started/4-packaging-and-distribution/)
