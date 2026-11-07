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
| `main` | 0.7.0 (unchanged since 2026-07-31) | Development | Currently behind `main-0.7`; do not assume it is the newest |
| `main-0.7` | 0.7.1 (since 2026-10-22) | **Recommended** | New production projects |
| `main-0.6` | 0.6.3 | Legacy | Existing 0.6.x apps not yet ported |
| `main-0.5` | 0.5.x | Archived | Old apps only |

**Default choice: `main-0.7`** unless you have a specific reason to use another. The version column moves without a Kangaroo release: read `holochainVersion` in the branch's `kangaroo.config.ts` before trusting it.

Pin to a versioned branch rather than `main`. `main` follows whatever core is current, so a clone taken a month apart can produce two different conductors.

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

# Installs dependencies, downloads the conductor and lair binaries, fetches the
# webhapp if `webhapp` is set in kangaroo.config.ts, and writes the configs
yarn setup
```

**No manual compilation needed.** `yarn fetch:binaries` (run by `yarn setup`) downloads the `holochain` and `lair-keystore` binaries for `bins.holochainVersion` and checks each against the SHA256 listed per platform under `bins` in `kangaroo.config.ts`.

---

## Artifact Structure

### Production: `.webhapp` bundle in `pouch/`

A `.webhapp` is a single archive containing:
1. Your `.happ` (conductor + DNA + zomes)
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

For dev mode you don't need a `.webhapp`. Instead, the optional `devConfig` in `kangaroo.config.ts` takes either `{ happPath, uiPort }` (your `.happ` file and the port of your UI dev server) or `{ webhappPath }`.

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
  // networkSeed?, webhapp?: { url, sha256 }, devConfig?, author?
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
| Patch (`0.1.0 → 0.1.1`) | **Shared** | Safe upgrade — user keeps data |
| Minor (`0.1.0 → 0.2.0`) | **Isolated** | Breaking — user starts fresh |
| Major (`0.1.0 → 1.0.0`) | **Isolated** | Breaking — user starts fresh |
| Pre-release tag (any) | **Isolated** | Always isolated |

**Rule of thumb:** Only use patch bumps for backward-compatible updates. Reserve minor/major bumps for intentional breaking changes where data migration is not required (or is handled in-app).

---

## Network Transport (0.7)

Holochain 0.6 introduced **iroh** alongside tx5. **0.7 removed tx5 and WebRTC entirely** — iroh over QUIC is the only transport, and it is compiled in unconditionally, so the `transport-iroh` Cargo feature no longer exists.

Kangaroo writes the conductor config from `templates/conductor-config.yaml`, filling in `bootstrapUrl` and `relayUrl` from `kangaroo.config.ts`. It needs a `relayUrl` and must **not** carry `signalUrl` or `webrtcConfig`:

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

Kangaroo ships one workflow, `.github/workflows/release.yaml`, triggered by a push to the **`release`** branch. Signing is not a separate branch: it is switched on by `macOSCodeSigning` and `windowsEVCodeSigning` in `kangaroo.config.ts`.

1. Give CI the `.webhapp`: commit it in `pouch/`, or set `webhapp: { url, sha256 }`.
2. Create a draft GitHub release whose tag is `v` plus `version` from `kangaroo.config.ts` (for example `v0.1.0`). The workflow uploads the installers to it.
3. Merge `main` into `release` and push (`git checkout -b release` the first time).

**Secrets, only when the matching signing flag is on:**
- macOS (`macOSCodeSigning: true`): `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_DEV_IDENTITY`, `APPLE_ID_EMAIL`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`
- Windows (`windowsEVCodeSigning: true`, an EV certificate in Azure Key Vault signed with AzureSignTool): `AZURE_KEY_VAULT_URI`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_CERT_NAME`

---

## Auto-Update

Kangaroo uses `@matthme/electron-updater`, a fork of `electron-updater` whose update check returns the newest release on your app's own semver line rather than the newest release overall.

- Runs on startup only when `autoUpdates` is `true` and the app is packaged.
- Offers only updates with the same breaking version as the installed app and a higher version number. A breaking update is never offered, because it would be a different conductor.
- Never installs silently: the user gets an "Update Available" dialog with **Deny** and **Install and Restart**.
- Requires your GitHub repository to have releases with the installers attached, which the CI workflow produces.

---

## Other Deployment Options

| Option | Description | When to use |
|--------|-------------|-------------|
| **p2p Shipyard** | Community-maintained Tauri + Nix approach | Need Android support |
| **Moss** | Holochain groupware framework | App integrates into a shared workspace |

---

## What NOT to Use

| Tool | Reason |
|------|--------|
| **Holochain Launcher** | Officially deprecated; development paused. Do not build new projects for it. |
| **Kangaroo-Tauri** | Frozen at Holochain 0.3.2 (last update Aug 2024). Not maintained. |

---

## Troubleshooting

| Error / Symptom | Cause | Fix |
|-----------------|-------|-----|
| App won't start after version bump | Minor/major bump → new isolated data folder | Expected behavior. User data not migrated automatically — implement migration if needed. |
| Network connectivity fails | iroh relay not configured | Set `relayUrl` in `kangaroo.config.ts` |
| Conductor exits immediately on start | Config still sets `signal_url` / `webrtc_config` / `chc_url` / `db_sync_strategy` | Remove them. 0.7 rejects unknown `NetworkConfig` fields instead of ignoring them. `db_sync_strategy` is now `db_sync_level` (`Full`/`Normal`/`Off`) |
| Conductor can't read existing data after upgrade | 0.7 renamed its databases and changed DNA hashes | Expected. There is no migration path; clear conductor data (`hc sandbox clean`). You are joining a new network |
| Binary checksum mismatch | Corrupted download, or `bins.holochainVersion` changed without its hashes | `rm -rf resources/bins && yarn fetch:binaries`. After changing `holochainVersion`, run `yarn update:binary-hashes` first |

**Reference:** [developer.holochain.org/get-started/4-packaging-and-distribution/](https://developer.holochain.org/get-started/4-packaging-and-distribution/)
