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

Pin to `main-0.7` for HDK 0.7.x stability. The full template below matches what `hc scaffold happ` generates — it includes `bun`, `nodejs_24`, and `binaryen` which are needed for the JS test suite and WASM optimisation:

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
          bun
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
# hc, cargo, rustc, bun, and all Holochain tooling are now available
```

**Why pin the branch?** Holonix `main` now tracks the 0.8 dev line. `main-0.7` pins all tooling to HDK 0.7.x compatibility. Mixing versions causes compilation failures.

---

## hc Scaffold Commands

The `hc scaffold` CLI generates boilerplate that follows Holochain conventions. Always use it before writing by hand.

### New hApp

```bash
# Create a complete new hApp project
hc scaffold happ
# Prompts for: app name, DNA name, coordinator zome name
# Generates: flake.nix, happ.yaml, dna.yaml, Cargo workspace, first zome pair
```

### New DNA (for multi-DNA hApps)

```bash
# Add a new DNA to an existing hApp
hc scaffold dna
# Prompts for: DNA name
# Generates: dna.yaml, new zome pair stubs
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
hc scaffold entry-type MyEntry
# Generates: entry struct in integrity, create/get/update/delete stubs in coordinator
# Also generates a Sweettest test in the DNA's tests crate
```

### Link Type

```bash
# Add a link type
hc scaffold link-type AgentToMyEntry
# Generates: link type variant in integrity, create/get/delete helpers in coordinator
```

### Collection

```bash
# Add a collection (global path anchor) for an entry type
hc scaffold collection
# Prompts for: entry type to index, collection type (global or by-agent)
```

---

## Verify Compilation

After any scaffold operation, always verify the project compiles:

```bash
# Generate and verify WASM compilation
hc s sandbox generate workdir/

# Or using the build alias (if package.json scripts are set up)
bun run build
```

**First build is slow** (WASM compilation + wasm-opt). Subsequent builds use the Rust cache. Expect 2-5 minutes for a fresh build.

---

## Project Structure After Scaffolding

This is the exact tree `hc scaffold happ` + `hc scaffold entry-type` produces:

```
my-happ/
├── flake.nix                     # Nix dev environment (Holonix + bun + nodejs)
├── Cargo.toml                    # Workspace root — glob members, exact version pins
├── Cargo.lock
├── package.json                  # Root workspace: build:zomes, build:happ, test scripts
├── .gitignore
├── workdir/
│   └── happ.yaml                 # hApp manifest (roles, DNA paths)
├── dnas/
│   └── my_dna/
│       ├── workdir/
│       │   └── dna.yaml          # DNA manifest (zome WASM paths)
│       └── zomes/
│           ├── integrity/
│           │   └── my_zome_integrity/
│           │       ├── Cargo.toml
│           │       └── src/
│           │           ├── lib.rs        # EntryTypes enum, LinkTypes enum, validate()
│           │           └── my_entry.rs   # Entry struct + per-op validation fns
│           └── coordinator/
│               └── my_zome/
│                   ├── Cargo.toml
│                   └── src/
│                       ├── lib.rs        # init(), Signal enum, post_commit, signal_action
│                       └── my_entry.rs   # create/get/update/delete + revision history
├── tests/                        # Sweettest suite (Rust)
│   ├── package.json
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   └── src/my_dna/my_zome/
│       ├── common.ts
│       └── my_entry.test.ts
└── ui/                           # UI scaffold (svelte/vue/react depending on template)
```

---

## Cargo Workspace Version Pins

Root `Cargo.toml` — `hc scaffold happ` generates glob members so new zome crates are picked up automatically. Always use exact version pins (`=`):

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
path = "dnas/my_dna/zomes/integrity/my_zome_integrity"
```

**Why exact pins (`=`)?** Holochain zome compilation is extremely sensitive to minor version differences. Range deps (`^`) can silently pull in incompatible patch releases.

**Sweettest test crate** is NOT picked up by the glob — add it explicitly:
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
hc scaffold entry-type Profile
hc scaffold link-type AgentToProfile
hc scaffold link-type PathToProfile
hc scaffold link-type ProfileUpdates

# 4. Add the new crates to workspace Cargo.toml members list

# 5. Verify compilation
hc s sandbox generate workdir/
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
