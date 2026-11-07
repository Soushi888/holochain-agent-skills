# Workflow: Scaffold a Holochain Project

Use this workflow to set up a new Holochain project from scratch, or to add a new domain to an existing hApp.

**Architecture guarantee:** both paths below (CLI and manual) produce the same standard hc scaffold project structure. When `hc scaffold` CLI is available use Path A. When not available (e.g., AI coding session without a running Nix shell), use `manual-scaffold.md` — it writes every file explicitly to produce an identical result.

**Reference:** `../scaffolding.md` for full details on any step.

---

## Path A: New hApp From Scratch

### Step 1 — Install Nix and Holonix

```bash
# Install Nix (Determinate Systems installer — recommended)
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

# Enable flakes (add to ~/.config/nix/nix.conf)
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
```

Restart your shell after installation. Verify: `nix --version`

**Checkpoint:** `nix --version` returns a version number.

---

### Step 2 — Bootstrap a Nix Shell

To run `hc scaffold`, you need a Nix dev shell first. Create a bootstrap `flake.nix` in any temporary directory:

```bash
mkdir bootstrap-holonix && cd bootstrap-holonix
```

```nix
# flake.nix: bootstrap only; hc scaffold web-app --setup-nix will generate the real one
{
  description = "Flake for Holochain app development";

  inputs = {
    holonix.url = "github:holochain/holonix?ref=main-0.7";
    nixpkgs.follows = "holonix/nixpkgs";
    flake-parts.follows = "holonix/flake-parts";
  };

  outputs = inputs@{ flake-parts, ... }: flake-parts.lib.mkFlake { inherit inputs; } {
    systems = builtins.attrNames inputs.holonix.devShells;
    perSystem = { inputs', pkgs, ... }: {
      formatter = pkgs.nixpkgs-fmt;
      devShells.default = pkgs.mkShell {
        inputsFrom = [ inputs'.holonix.devShells.default ];
        packages = (with pkgs; [
          nodejs_24
          binaryen
        ]);
        shellHook = ''
          export PS1='\[\033[1;34m\][holonix:\w]\$\[\033[0m\] '
        '';
      };
    };
  };
}
```

Enter the dev shell:
```bash
nix develop
```

**Checkpoint:** `hc --version` returns a version number inside `nix develop`.

> **No CLI available?** If `hc scaffold` is not accessible (e.g., in an AI coding session), use `manual-scaffold.md` instead — it provides complete file templates for every generated file.

---

### Step 3 — Scaffold the hApp

```bash
# From the parent directory (not inside the bootstrap dir), inside nix develop:
hc scaffold web-app my-community-app --setup-nix
# usage: hc scaffold web-app [name] [description] [--setup-nix] [-F | --disable-fast-track]
```

The CLI will prompt for:
- **Template**: `svelte` or `headless` (no UI), unless `--template` is passed
- **DNA name**: e.g., `community` (the first domain, snake_case)
- **Coordinator zome name**: e.g., `posts` (first feature; the integrity zome becomes `posts_integrity`)

`-F` skips the DNA and zome prompts, leaving you to run `hc scaffold dna` and `hc scaffold zome` yourself. `hc scaffold web-app` creates the full project directory with all root files: `flake.nix`, `Cargo.toml`, `happ.yaml` (inside `workdir/`), `package.json`, `.gitignore`, `dnas/` and, with the svelte template, a `ui/` scaffold. Sweettest tests go in each coordinator crate's `tests/` directory; there is no root `tests/`. It also initialises a git repository and stages the files.

```bash
cd <your-app-name>
nix develop  # enter the project's own dev shell
```

**Checkpoint:** `ls` shows `Cargo.toml`, `flake.nix`, `package.json`, `workdir/`, and `dnas/` directory.

---

### Step 4 — Verify Cargo Workspace

Check `Cargo.toml` at the root uses exact version pins:

```toml
[workspace.dependencies]
hdi = "=0.8.1"
hdk = "=0.7.1"
serde = { version = "1", features = ["derive"] }
```

If the scaffold generated range versions (`^`), replace them with exact pins (`=`). `hc scaffold` 0.700.1, the one holonix `main-0.7` bundles since 2026-10-23, already emits `hdi =0.8.1`, `hdk =0.7.1`, `holochain 0.7.1` and `@holochain/client ^0.21.1`. The older stable `v0.700.0` emits `hdi =0.8.0`, `hdk =0.7.0`, `holochain 0.7.0` and `@holochain/client ^0.21.0`: if `hc scaffold --version` says 0.700.0, raise them to `=0.8.1`, `=0.7.1`, `0.7.1` and `^0.21.1`, because a fresh lockfile already resolves the 0.7.1 type crates under the old pins and the capability API changed between the two.

**Why:** Holochain is sensitive to minor version differences. Range deps can silently break compilation.

---

### Step 5 — Add Entry Types

For each data type in your domain, replace `my_entry` with your actual domain noun in snake_case (e.g., `profile`, `post`, `listing`):

```bash
# Inside nix develop, from project root
# Answer yes to "link from original to each update" to get the MyEntryUpdates link
hc scaffold entry-type my_entry

# Then add links and collections: link-type takes [from] [to] (an entry type, or agent)
hc scaffold link-type agent my_entry
hc scaffold collection global all_my_entries my_entry
```

---

### Step 6 — Verify Compilation

```bash
npm run build:happ    # cargo build --release --target wasm32-unknown-unknown, then hc app pack workdir
```

**Expected:** Build succeeds (may take 5-10 minutes on first run due to WASM compilation).

**Common issues:**
- `wasm32 target not found` — you're outside `nix develop`; run `nix develop` first
- Slow first build — normal; wait for `wasm-opt` to complete

---

### Step 7 — Set Up Tests

**Sweettest (Rust) is the primary testing layer.** It runs in-process, is faster, and has first-class HDK 0.7 support. See `../testing.md` for full two-agent patterns.

The scaffolder already writes Sweettest tests into the coordinator crate's `tests/` directory (`dnas/<dna_name>/zomes/coordinator/<zome>/tests/`), and `npm test` runs `build:happ` then `cargo test`. Nothing more is needed to start. A separate test crate is optional; if you want one, add it to your Cargo workspace:

```bash
mkdir -p dnas/<dna_name>/tests/src
```

`dnas/<dna_name>/tests/Cargo.toml`:
```toml
[package]
name = "<dna_name>_tests"
version = "0.1.0"
edition = "2021"

[dev-dependencies]
holochain = { version = "=0.7.1", default-features = false, features = ["encryption", "wasmer-sys-cranelift", "test_utils"] }
tokio     = { version = "1", features = ["full"] }
```

The workspace `members` glob (`"dnas/*/zomes/coordinator/*"` etc.) does not pick up the test crate — add it explicitly:
```toml
[workspace]
members = [
    "dnas/*/zomes/coordinator/*",
    "dnas/*/zomes/integrity/*",
    "dnas/<dna_name>/tests",
]
```

Run with:
```bash
cargo test --package <dna_name>_tests
```

**Checkpoint:** `cargo test --package <dna_name>_tests` compiles (no tests yet is fine).

---

### Step 8 — Initial Commit

```bash
git init

# Create .gitignore to exclude build artifacts
cat > .gitignore << 'EOF'
/target
/workdir
/.cargo
node_modules
dist
EOF

git add .
git commit -m "feat: scaffold initial happ structure"
```

Proceed to `design-data-model.md` to design your first domain's data model, then `implement-zome.md` to implement.

---

## Path B: Add Domain to Existing hApp

Use this path when your hApp already exists and you need to add a new feature domain.

### Step 1 — Enter Dev Shell

```bash
nix develop
```

### Step 2 — Scaffold New Zome Pair

```bash
hc scaffold zome
# Enter: domain name (e.g., "profiles")
# Select: existing DNA to add it to
```

### Step 3 — Scaffold Entry Types

```bash
hc scaffold entry-type profile
hc scaffold link-type agent profile
hc scaffold collection global all_profiles profile
```

### Step 4 — Cargo Workspace

Nothing to add. The generated `members = ["dnas/*/zomes/coordinator/*", "dnas/*/zomes/integrity/*"]` glob already covers the new `dnas/my_dna/zomes/coordinator/profiles` and `dnas/my_dna/zomes/integrity/profiles` crates (the integrity crate is named `profiles_integrity`; its folder drops the suffix). `hc scaffold zome` adds both to `[workspace.dependencies]`.

### Step 5 — Verify Compilation

```bash
npm run build:happ
```

### Step 6 — Commit

```bash
git add .
git commit -m "feat(profiles): scaffold profiles zome pair"
```

Proceed to `implement-zome.md` to implement the domain.

---

## Quick Reference

```bash
# Enter dev environment
nix develop

# New project
hc scaffold web-app my-app --setup-nix

# New domain
hc scaffold zome
hc scaffold entry-type my_entry
hc scaffold link-type agent my_entry

# Verify build
npm run build:happ

# Run tests (build:happ, then cargo test)
npm test
```

**Reference:** `../scaffolding.md` for full setup details, troubleshooting, and workspace structure.
