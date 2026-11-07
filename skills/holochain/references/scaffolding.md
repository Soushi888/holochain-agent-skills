# Holochain Scaffold

## Prerequisites

Holochain development requires Nix for a reproducible development environment. All tooling (Rust, hc CLI, holochain, lair-keystore) is managed through Holonix.

### Install Nix

```bash
# Official Nix installer (recommended)
sh <(curl -L https://nixos.org/nix/install) --no-daemon

# Or with Determinate Systems installer (more reliable, adds uninstaller)
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

Enable flakes (required for Holonix):
```
# Add to ~/.config/nix/nix.conf (or /etc/nix/nix.conf):
experimental-features = nix-command flakes
```

---

## Standard flake.nix (Holonix)

Pin to `main-0.7` for HDK 0.7.x stability. The template below matches what `hc scaffold web-app --setup-nix` generates: on top of holonix it adds `nodejs_24` (for the npm scripts and the UI) and `binaryen` (WASM optimisation). It does not add `bun`; the generated scripts call `npm`:

```nix
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
# hc, cargo, rustc, node, npm and all Holochain tooling are now available
```

**Why pin the branch?** Holonix `main` now tracks the 0.8 dev line. `main-0.7` pins all tooling to HDK 0.7.x compatibility. Mixing versions causes compilation failures.

---

## hc Scaffold Commands

The `hc scaffold` CLI generates boilerplate that follows Holochain conventions. Always use it before writing by hand.

### New hApp

```bash
# Create a complete new hApp project: hc scaffold web-app [name] [description]
hc scaffold web-app my-happ --setup-nix
# --setup-nix: write flake.nix without asking; -F / --disable-fast-track: skip the first DNA and zome pair
# Prompts for: template (svelte or headless, unless --template is given), then DNA name and coordinator zome name
# Generates: flake.nix, workdir/happ.yaml, dnas/<dna>/workdir/dna.yaml, Cargo workspace, first zome pair, ui/ (svelte template only)
```

### New DNA (for multi-DNA hApps)

```bash
# Add a new DNA to an existing hApp
hc scaffold dna
# Prompts for: DNA name (snake_case)
# Generates: dnas/<dna>/workdir/dna.yaml; add zomes afterwards with hc scaffold zome
```

### New Zome Pair

```bash
# Add a coordinator/integrity zome pair to an existing DNA
hc scaffold zome
# Prompts for: zome name, DNA to add it to
# Generates: integrity crate + coordinator crate with Cargo.toml
```

### Entry Type

```bash
# Add an entry type to an existing zome pair
hc scaffold entry-type my_entry       # the name must be snake_case
# Generates: entry struct in integrity, create/get/update/delete stubs in coordinator
# Also generates a Sweettest test in the coordinator crate's tests/ directory
```

### Link Type

```bash
# Add a link type: hc scaffold link-type [from] [to], each an entry type (snake_case),
# `agent` or `agent:<role>`; append `:EntryHash` to an entry type to link by entry hash
hc scaffold link-type agent my_entry
# Generates: link type variant in integrity, create/get/delete helpers in coordinator
```

### Collection

```bash
# Add a collection for an entry type: hc scaffold collection [global|by-author] [name] [entry_type]
hc scaffold collection global all_my_entries my_entry
# Prompts for any argument left out
```

---

## Verify Compilation

After any scaffold operation, always verify the project compiles:

```bash
# Compile the zomes to WASM and pack workdir/<app>.happ (generated package.json script)
npm run build:happ

# Build, then run the Sweettest suite
npm test
```

**First build is slow** (WASM compilation + wasm-opt). Subsequent builds use the Rust cache. Expect 2-5 minutes for a fresh build.

---

## Project Structure After Scaffolding

This is the tree `hc scaffold web-app` (with its first DNA and zome pair) + `hc scaffold entry-type` produces:

```
my-happ/
├── flake.nix                     # Nix dev environment (Holonix + nodejs_24 + binaryen)
├── Cargo.toml                    # Workspace root — glob members, exact version pins
├── Cargo.lock
├── package.json                  # Root workspace: start, network, test, build:zomes, build:happ, package
├── .gitignore
├── workdir/
│   └── happ.yaml                 # hApp manifest (roles, DNA paths)
├── dnas/
│   └── my_dna/
│       ├── workdir/
│       │   └── dna.yaml          # DNA manifest (zome WASM paths)
│       └── zomes/
│           ├── integrity/
│           │   └── my_zome/          # crate my_zome_integrity, folder without the suffix
│           │       ├── Cargo.toml
│           │       └── src/
│           │           ├── lib.rs        # EntryTypes enum, LinkTypes enum, validate()
│           │           └── my_entry.rs   # Entry struct + per-op validation fns
│           └── coordinator/
│               └── my_zome/
│                   ├── Cargo.toml
│                   ├── src/
│                   │   ├── lib.rs        # init(), Signal enum, post_commit, signal_action
│                   │   └── my_entry.rs   # create/get/update/delete + revision history
│                   └── tests/            # Sweettest suite (Rust), run by cargo test
│                       ├── common.rs
│                       └── my-entry.rs
└── ui/                           # UI scaffold (svelte template; absent with headless)
```

---

## Cargo Workspace Version Pins

Root `Cargo.toml`: `hc scaffold web-app` generates glob members so new zome crates are picked up automatically. Always use exact version pins (`=`):

```toml
[profile.dev]
opt-level = "z"

[profile.release]
opt-level = "z"

[workspace]
members = ["dnas/*/zomes/coordinator/*", "dnas/*/zomes/integrity/*"]
resolver = "2"

[workspace.dependencies]
hdi = "=0.8.1"
hdk = "=0.7.1"
holochain_serialized_bytes = "*"
serde = "1.0"

# Per-crate workspace deps (one pair per zome):
[workspace.dependencies.my_zome]
path = "dnas/my_dna/zomes/coordinator/my_zome"

[workspace.dependencies.my_zome_integrity]
path = "dnas/my_dna/zomes/integrity/my_zome"
```

**Why exact pins (`=`)?** Holochain zome compilation is extremely sensitive to minor version differences. Range deps (`^`) can silently pull in incompatible patch releases.

**Sweettest tests need no crate of their own**: the scaffolder writes them into each coordinator crate's `tests/`, which the glob already covers. Only a separate test crate you add by hand, outside the globbed paths, needs an explicit member:
```toml
[workspace]
members = [
    "dnas/*/zomes/coordinator/*",
    "dnas/*/zomes/integrity/*",
    "dnas/my_dna/tests",   # ← explicit
]
```

---

## Add Domain to Existing Project

When adding a new feature domain to an existing hApp:

```bash
# 1. Enter Nix dev shell if not already in it
nix develop

# 2. Scaffold a new zome pair
hc scaffold zome
# Enter: domain name (e.g., "profiles"), select existing DNA

# 3. Scaffold entry types for the domain
# entry-type writes the ProfileUpdates link when you answer yes to --link-from-original-to-each-update
hc scaffold entry-type profile
hc scaffold link-type agent profile
hc scaffold collection global all_profiles profile

# 4. Nothing to register: the workspace members glob picks up the new crates

# 5. Verify compilation
npm run build:happ
```

Proceed to `workflows/implement-zome.md` to fill in the implementation.

---

## Common Setup Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `nix: command not found` | Nix not installed or not in PATH | Restart shell after install; check `~/.nix-profile/bin` in PATH |
| `flakes not enabled` | Missing experimental-features config | Add `experimental-features = nix-command flakes` to `~/.config/nix/nix.conf` |
| `hc: command not found` inside nix develop | Wrong holonix branch | Check `flake.nix` ref — must be `main-0.7`, not `main` |
| `wasm32 target not found` | Rust toolchain outside Nix | Use `nix develop`; don't use system Rust for Holochain builds |
| First build hangs at `wasm-opt` | wasm-opt is slow on first run | Normal — wait 5-10 min; subsequent builds are fast |

**Reference:** [developer.holochain.org/get-started/](https://developer.holochain.org/get-started/)
