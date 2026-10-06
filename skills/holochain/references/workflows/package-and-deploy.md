# Workflow: Package and Deploy a Holochain hApp

Guided 7-step workflow for packaging a Holochain hApp into a standalone desktop application using Kangaroo-Electron.

**Reference:** `../../deployment.md` for full details on any step.

---

## Step 1 — Verify Holochain Version Compatibility

Confirm your hApp targets a supported Kangaroo-Electron branch and that your conductor config is compatible.

**Check your Cargo.toml versions:**
```toml
hdk = "=0.7.0"
hdi = "=0.8.0"
```

**Check for iroh transport (required for 0.6+):**
Ensure your conductor config or app configuration includes a `relayUrl`. If your app was built for 0.5.x, you must add this before deploying on 0.6+.

**Checkpoint:** You know which Kangaroo branch to use (`main-0.7` for 0.7.x apps).

**Common mistake:** Using `main` for a production app. `main` follows the current line and moves without warning. Use `main-0.7` unless you explicitly need cutting-edge features.

---

## Step 2 — Set Up Kangaroo-Electron

Clone the repository and install dependencies.

```bash
git clone https://github.com/holochain/kangaroo-electron
cd kangaroo-electron
git checkout main-0.7
npm install
```

`npm install` automatically fetches and validates the conductor + lair-keystore binaries with SHA256 checksums. No manual compilation required.

**Checkpoint:** `node_modules/` is populated and `npm run start` doesn't error on missing binaries.

**Common mistake:** Forgetting to `git checkout main-0.7` after cloning (defaults to `main`, which tracks the latest line).

---

## Step 3 — Place Your Artifacts

Build your hApp outside Kangaroo and place the `.webhapp` bundle into `pouch/`.

```bash
# Build your webhapp (from your hApp project root)
hc app pack ./workdir --recursive
# or your build script:
bun run build:webhapp

# Copy the output into Kangaroo's pouch directory
cp path/to/your-app.webhapp /path/to/kangaroo-electron/pouch/
```

**What goes in `pouch/`:** A `.webhapp` file — a single bundle containing both your `.happ` (conductor + DNAs + zomes) **and** your UI assets. This is NOT the same as a `.happ` file, which is backend only.

**UI icon:** Ensure your UI assets include `icon.png` (≥ 256×256 px) at the UI root. This is required for desktop packaging.

**Checkpoint:** `pouch/your-app.webhapp` exists and has a non-zero file size.

---

## Step 4 — Configure Metadata

Update the configuration files with your app's identity.

**`package.json`** — name and version:
```json
{
  "name": "your-app-name",
  "version": "0.1.0"
}
```

**`electron/config.ts`** — product identity and paths:
```typescript
export const APP_ID = "com.yourorg.yourapp";         // reverse-domain, unique
export const PRODUCT_NAME = "Your App Name";          // Windows: alphanumeric + hyphens only
export const HAPP_PATH = "pouch/your-app.webhapp";
```

**Sync version across files:** Ensure `package.json` version and any version displayed in your UI match.

**Checkpoint:** `APP_ID` is unique to your app, `PRODUCT_NAME` contains no special characters, `HAPP_PATH` matches the file in `pouch/`.

**Common mistake:** Leaving `APP_ID` as the kangaroo template default — two apps with the same `APP_ID` will share data folders on user machines.

---

## Step 5 — Test Locally

Verify the app works before publishing.

```bash
# Development mode (hot reload, DevTools available)
npm run start

# Production build (all configured platforms)
npm run kangaroo
```

**Checkpoint:**
- `npm run start` launches the app without errors
- UI loads and basic zome calls succeed
- `npm run kangaroo` completes without errors
- Installer in `dist/` is present and installs cleanly

**Common mistake:** Testing only in dev mode. Production builds can fail due to code signing or asset path issues not present in dev.

---

## Step 6 — Publish via CI

Push to the appropriate branch to trigger automated cross-platform builds.

```bash
# Unsigned builds (development / beta releases)
git push origin HEAD:release

# Code-signed builds (production releases)
git push origin HEAD:release-codesigned
```

**GitHub Actions** will build installers for Windows (`.exe` / `.msi`), macOS (`.dmg`), and Linux (`.AppImage` / `.deb`).

**For code-signed builds**, the following secrets must be set in your GitHub repo settings before pushing to `release-codesigned`:
- macOS: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Windows: `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD`

**Checkpoint:** GitHub Actions run completes. Installers are attached to the GitHub release.

---

## Step 7 — Version Future Releases

Apply the correct version bump type for each future release.

| Change type | Version bump | User data |
|-------------|-------------|-----------|
| UI-only fix or enhancement | **Patch** (`0.1.0 → 0.1.1`) | Preserved |
| Coordinator zome fix | **Patch**, only if the app runs `UpdateCoordinators` on launch | Preserved |
| New features, integrity or schema changes | **Minor** below 1.0 (`0.1.0 → 0.2.0`), **Major** from 1.0 on (`1.2.0 → 2.0.0`) | Isolated (user starts fresh, with a new agent key) |
| Breaking architecture change | **Major** (`0.1.0 → 1.0.0`) | Isolated |
| Any minor from 1.0 on (`1.0.0 → 1.1.0`) | Treat as a patch | Preserved, and the new `.happ` is not installed |
| Pre-release tag | Any | Shared only between pre-releases of the same base version and identifier |

**Rule:** A patch release keeps the user's data but does **not** install the `.happ` it ships, so a zome change in a patch release reaches nobody unless the app swaps coordinators itself. From 1.0 on the same holds for a minor release, because the data folder is keyed on the major version alone. Start at `0.1.0`: on `0.0.x`, every patch gets a fresh data folder. Details and source references in `../deployment.md` § Critical Versioning Semantics.

---

## Quick Reference

```
Setup:   git checkout main-0.7  →  npm install
Dev:     npm run start
Build:   npm run kangaroo
Publish: git push origin HEAD:release
```

**See also:** `../../deployment.md` for troubleshooting, CI secrets reference, and alternative deployment options.
