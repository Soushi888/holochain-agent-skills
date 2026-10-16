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
| `main-0.7` | 0.7.1-rc.2 (since 2026-10-14) | **Recommended** | New production projects |
| `main-0.6` | 0.6.3 | Legacy | Existing 0.6.x apps not yet ported |
| `main-0.5` | 0.5.x | Archived | Old apps only |

**Default choice: `main-0.7`** unless you have a specific reason to use another. The version column moves without a Kangaroo release: read `holochainVersion` in the branch's `kangaroo.config.ts` before trusting it, and expect `main-0.7` to reach the stable 0.7.1 conductor in a later commit.

Pin to a versioned branch rather than `main`. `main` follows whatever core is current, so a clone taken a month apart can produce two different conductors.

---

## Prerequisites

### All platforms
- Rust toolchain (stable)
- Node.js + npm

### Linux
- `webkit2gtk` (for Electron WebView)
- `libssl-dev`

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.1-dev libssl-dev
```

### macOS
- Xcode Command Line Tools

```bash
xcode-select --install
```

### Windows
- Visual Studio 2019+ with "Desktop development with C++" workload

---

## Repository Setup

```bash
# Clone and checkout the right branch
git clone https://github.com/holochain/kangaroo-electron
cd kangaroo-electron
git checkout main-0.7

# Install dependencies (auto-fetches conductor binaries with SHA256 validation)
npm install
```

**No manual compilation needed.** Binaries (conductor, lair-keystore) are automatically fetched and verified via SHA256 checksums during `npm install`.

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

**UI icon requirement:** Include `icon.png` (≥ 256×256 px) at the UI root. Missing icon will cause build warnings or failures on some platforms.

### Development mode

For dev mode you don't need a `.webhapp`. Instead, `kangaroo.config.ts` accepts:
- `happPath` — path to your `.happ` file
- `uiPort` — port where your UI dev server is running

---

## Configuration

**`package.json`**
```json
{
  "name": "your-app-name",
  "version": "0.1.0"
}
```

**`electron/config.ts`**
```typescript
export const HOLOCHAIN_VERSION = "holochain-0.7.0"; // match your branch
export const APP_ID = "com.yourorg.yourapp";             // reverse-domain identifier
export const PRODUCT_NAME = "Your App Name";              // alphanumeric + hyphens on Windows
export const HAPP_PATH = "pouch/your-app.webhapp";
```

> **Windows MSI warning:** `PRODUCT_NAME` must use only alphanumeric characters and hyphens. Spaces and special characters cause MSI packaging failures.

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

Your conductor config needs a `relayUrl` and must **not** carry `signalUrl` or `webrtcConfig`:

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
npm install           # install dependencies + auto-fetch conductor binaries
npm run start         # launch in development mode (hot reload, DevTools available)
npm run kangaroo      # production build for all configured platforms
```

---

## CI/CD via GitHub Actions

Kangaroo-Electron includes GitHub Actions workflows. Control builds via branch naming:

| Branch | Build type | Code signing |
|--------|-----------|--------------|
| `release` | Cross-platform executables | Unsigned |
| `release-codesigned` | Cross-platform executables | Signed (requires secrets) |

**Required secrets for code-signed builds:**
- macOS: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, etc.
- Windows: `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`

---

## Auto-Update

Kangaroo uses `@matthme/electron-updater` — a semver-aware fork of `electron-updater`.

- Checks GitHub releases on app startup
- Respects versioning semantics: patch updates install silently; minor/major present a breaking-change notice
- Requires your GitHub repo to have releases with attached installers (produced by CI)

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
| Network connectivity fails | iroh relay not configured | Add `relayUrl` to conductor config in `electron/config.ts` |
| Conductor exits immediately on start | Config still sets `signal_url` / `webrtc_config` / `chc_url` / `db_sync_strategy` | Remove them. 0.7 rejects unknown `NetworkConfig` fields instead of ignoring them. `db_sync_strategy` is now `db_sync_level` (`Full`/`Normal`/`Off`) |
| Conductor can't read existing data after upgrade | 0.7 renamed its databases and changed DNA hashes | Expected. There is no migration path; clear conductor data (`hc sandbox clean`). You are joining a new network |
| Binary checksum mismatch | Corrupted or incomplete download | `rm -rf node_modules/.cache && npm install` |
| Windows MSI build fails | Special characters in `PRODUCT_NAME` | Use only alphanumeric characters and hyphens in `PRODUCT_NAME` |

**Reference:** [developer.holochain.org/get-started/4-packaging-and-distribution/](https://developer.holochain.org/get-started/4-packaging-and-distribution/)
