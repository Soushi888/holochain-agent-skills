# Workflow: Package and Deploy a Holochain hApp

Guided 7-step workflow for packaging a Holochain hApp into a standalone desktop application using Kangaroo-Electron.

**Reference:** `../deployment.md` for full details on any step.

---

## Step 1 — Verify Holochain Version Compatibility

Confirm your hApp targets a supported Kangaroo-Electron branch and that your conductor config is compatible.

**Check your Cargo.toml versions:**
```toml
hdk = "=0.7.1"
hdi = "=0.8.1"
```

**Check for iroh transport (required for 0.6+):**
Ensure `relayUrl` is set in `kangaroo.config.ts` (Kangaroo writes it into the conductor config). If your app was built for 0.5.x, you must add this before deploying on 0.6+.

**Checkpoint:** You know which Kangaroo branch to use (`main-0.7` for 0.7.x apps).

**Common mistake:** Using `main` for a production app. `main` is not the newest line: it still pins Holochain 0.7.0 while `main-0.7` is on 0.7.1. Use `main-0.7` for a 0.7 app.

---

## Step 2 — Set Up Kangaroo-Electron

Clone the repository and install dependencies.

```bash
git clone https://github.com/holochain/kangaroo-electron
cd kangaroo-electron
git checkout main-0.7
# Replace appId and productName in kangaroo.config.ts first (Step 4):
# yarn setup throws on the template placeholders
yarn setup
```

`yarn setup` installs dependencies, downloads the conductor and lair-keystore binaries into `resources/bins/` and checks them against the SHA256 hashes in `kangaroo.config.ts`. No manual compilation required. Use the repository as a template or a fork for your own app.

**Checkpoint:** `resources/bins/` holds both binaries.

**Common mistake:** Forgetting to `git checkout main-0.7` after cloning (defaults to `main`, which still pins 0.7.0).

---

## Step 3 — Place Your Artifacts

Build your hApp outside Kangaroo and place the `.webhapp` bundle into `pouch/`.

```bash
# Build your webhapp (from your hApp project root)
hc web-app pack ./workdir --recursive   # reads web-happ.yaml; hc app pack makes only the .happ
# or your build script:
bun run build:webhapp

# Copy the output into Kangaroo's pouch directory
cp path/to/your-app.webhapp /path/to/kangaroo-electron/pouch/
```

**What goes in `pouch/`:** A `.webhapp` file — a single bundle containing both your `.happ` (the DNA bundles and the hApp manifest) **and** your UI assets. This is NOT the same as a `.happ` file, which is backend only.

**UI icon:** Include `icon.png` (at least 256×256 px) at the UI root. Without it the build only warns, but the icon is required when `systray` is on.

**Checkpoint:** `pouch/your-app.webhapp` exists and has a non-zero file size.

---

## Step 4 — Configure Metadata

Set your app's identity in **`kangaroo.config.ts`**, the only config file (there is no `electron/config.ts`):

```typescript
appId: 'com.yourorg.yourapp',   // reverse-domain, unique: it defines where user data is stored
productName: 'Your App Name',
version: '0.1.0',               // overrides package.json; read Step 7 before choosing it
```

**Checkpoint:** `appId` and `productName` are your own. `yarn write:configs` (run by every build) refuses the template placeholders.

**Common mistake:** Reusing another app's `appId`. Two apps with the same `appId` share data folders on user machines.

---

## Step 5 — Test Locally

Verify the app works before publishing.

```bash
# Development mode
yarn dev

# Production build for this platform
yarn build:linux        # or yarn build:mac-arm64, yarn build:mac-x64, yarn build:win
```

**Checkpoint:**
- `yarn dev` launches the app without errors
- UI loads and basic zome calls succeed
- the `yarn build:<platform>` command completes without errors
- Installer in `dist/` is present and installs cleanly

**Common mistake:** Testing only in dev mode. Production builds can fail due to code signing or asset path issues not present in dev.

---

## Step 6 — Publish via CI

Kangaroo's single workflow (`.github/workflows/release.yaml`) builds on a push to the `release` branch. First create a draft GitHub release tagged `v` plus your `version` (for example `v0.1.0`); the workflow uploads the installers to it.

```bash
git checkout -b release   # first time only; afterwards: git checkout release
git merge main
git push --set-upstream origin release
```

**GitHub Actions** builds a Windows NSIS installer (`*-setup.exe`), macOS `.dmg` files (Apple Silicon and Intel), and Linux `.AppImage` and `.deb`.

**Code signing** is switched on in `kangaroo.config.ts`, not by a branch, and each flag needs its secrets. macOS notarization also needs `afterSign: scripts/notarize.js` uncommented in `templates/electron-builder-template.yml`.
- `macOSCodeSigning: true`: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_DEV_IDENTITY`, `APPLE_ID_EMAIL`, `APPLE_ID_PASSWORD`, `APPLE_TEAM_ID`
- `windowsEVCodeSigning: true`: `AZURE_KEY_VAULT_URI`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_CERT_NAME`

**Checkpoint:** GitHub Actions run completes. Installers are attached to the GitHub release.

---

## Step 7 — Version Future Releases

Apply the correct version bump type for each future release.

| Change type | Version bump | User data |
|-------------|-------------|-----------|
| UI-only fix or enhancement | **Patch** (`0.1.0 → 0.1.1`), or from 1.0 on a **minor** (`1.0.0 → 1.1.0`), which Kangaroo treats the same way | Preserved, and the new `.happ` is not installed |
| Coordinator zome fix | **Patch**, only if the app runs `UpdateCoordinators` on launch | Preserved |
| New features, integrity or schema changes | **Minor** below 1.0 (`0.1.0 → 0.2.0`), **Major** from 1.0 on (`1.2.0 → 2.0.0`) | Isolated (user starts fresh, with a new agent key) |
| Breaking architecture change | **Major** (`0.1.0 → 1.0.0`) | Isolated |
| Pre-release tag | Any | Shared only between pre-releases of the same base version and identifier |

**Rule:** A patch release keeps the user's data but does **not** install the `.happ` it ships, so a zome change in a patch release reaches nobody unless the app swaps coordinators itself. From 1.0 on the same holds for a minor release, because the data folder is keyed on the major version alone. Start at `0.1.0`: on `0.0.x`, every patch gets a fresh data folder. Details and source references in `../deployment.md` § Critical Versioning Semantics.

---

## Quick Reference

```
Setup:   git checkout main-0.7  →  yarn setup
Dev:     yarn dev
Build:   yarn build:linux | build:mac-arm64 | build:mac-x64 | build:win
Publish: draft release v<version>, then merge main into release and push
```

**See also:** `../deployment.md` for troubleshooting, CI secrets reference, and alternative deployment options.
