# Workflow: Manual hApp Scaffold (Without the hc CLI)

Use this when `hc scaffold` is unavailable: an AI coding session with no Nix shell, a restricted environment, or a machine without the toolchain. The output is the same structure `hc scaffold` produces on Holochain 0.7.

**If `hc scaffold` IS available, use it instead.** See `scaffold.md`. Hand-writing the validation dispatcher is error-prone and the tool gets it right.

Templates live in `assets/templates/`. Copy each one to its destination and substitute the placeholders. Do not retype them from memory: they are this skill's reference shape for Holochain 0.7, and the file layout below is the one `hc scaffold` 0.700.1 writes (its templates live in `holochain/scaffolding` at `v0.700.1`, under `templates/generic/`).

---

## Placeholders

Every template uses the same five:

| Placeholder | Meaning | Example |
|---|---|---|
| `<APP_NAME>` | hApp name, snake_case | `my_forum` |
| `<DNA_NAME>` | DNA name, snake_case | `forum` |
| `<ZOME_NAME>` | Coordinator zome name; the integrity crate is `<ZOME_NAME>_integrity` | `posts` |
| `<EntryType>` | Entry struct name, PascalCase | `Post` |
| `<entry_type>` | Entry name, snake_case | `post` |

---

## Step 1 — Directory tree

```
<APP_NAME>/
├── flake.nix
├── Cargo.toml
├── package.json
├── .gitignore
├── workdir/
│   ├── happ.yaml
│   └── web-happ.yaml
└── dnas/<DNA_NAME>/
    ├── workdir/dna.yaml
    └── zomes/
        ├── integrity/<ZOME_NAME>/
        │   ├── Cargo.toml
        │   └── src/{lib.rs, <entry_type>.rs, agent_to_<entry_types>.rs}
        └── coordinator/<ZOME_NAME>/
            ├── Cargo.toml
            ├── src/{lib.rs, <entry_type>.rs, agent_to_<entry_types>.rs}
            └── tests/{common.rs, <entry-type>.rs, agent_to_<entry_types>.rs}
```

The scaffolder names the link-type file after the link type in snake_case, `AgentTo` plus the plural entry name, so `post` gives `agent_to_posts.rs` and `my_entry` gives `agent_to_my_entries.rs`. The entry-type test file is kebab-case, `tests/my-entry.rs` for `my_entry` (`tests/post.rs` for `post`), and the link-type test sits beside it under the link-type name.

Note the integrity crate directory is `<ZOME_NAME>` while its Cargo package name is `<ZOME_NAME>_integrity`. `hc scaffold` does this too, and the `--zome` flag expects the package name.

---

## Step 2 — Copy the templates

| Template | Destination |
|---|---|
| `flake.nix` | `flake.nix` |
| `Cargo.toml` | `Cargo.toml` |
| `package.json` | `package.json` |
| `gitignore` | `.gitignore` |
| `happ.yaml` | `workdir/happ.yaml` |
| `web-happ.yaml` | `workdir/web-happ.yaml` |
| `dna.yaml` | `dnas/<DNA_NAME>/workdir/dna.yaml` |
| `integrity-Cargo.toml` | `dnas/<DNA_NAME>/zomes/integrity/<ZOME_NAME>/Cargo.toml` |
| `integrity-lib.rs` | `.../integrity/<ZOME_NAME>/src/lib.rs` |
| `integrity-entry_type.rs` | `.../integrity/<ZOME_NAME>/src/<entry_type>.rs` |
| `integrity-link_type.rs` | `.../integrity/<ZOME_NAME>/src/agent_to_<entry_types>.rs` |
| `coordinator-Cargo.toml` | `dnas/<DNA_NAME>/zomes/coordinator/<ZOME_NAME>/Cargo.toml` |
| `coordinator-lib.rs` | `.../coordinator/<ZOME_NAME>/src/lib.rs` |
| `coordinator-entry_type.rs` | `.../coordinator/<ZOME_NAME>/src/<entry_type>.rs` |
| `coordinator-link_type.rs` | `.../coordinator/<ZOME_NAME>/src/agent_to_<entry_types>.rs` |
| `sweettest-common.rs` | `.../coordinator/<ZOME_NAME>/tests/common.rs` |
| `sweettest-entry_type.rs` | `.../coordinator/<ZOME_NAME>/tests/<entry-type>.rs` |

Substitute the five placeholders in every copied file.

---

## Step 3 — Things that are easy to get wrong

- **`manifest_version` is `'0'`**, quoted, in both `happ.yaml` and `dna.yaml`. Not `'1'`.
- **Pin holonix to `main-0.7`.** `main` tracks the 0.8 dev line. The template already does this, and so does `hc scaffold` 0.700.0 and 0.700.1 (`ref=main-0.7` in `src/scaffold/app/nix.rs`). Only `hc scaffold` 0.700.0-rc.0 emitted `ref=main`, so check the flake if you scaffolded with that rc.
- **`nodejs_24`**, not 22. Holochain 0.7 moved up.
- **Exact version pins.** `hdi = "=0.8.1"`, `hdk = "=0.7.1"`. The `=` matters; Holochain is sensitive to minor drift.
- **Output from the old `hc scaffold` 0.700.0-rc does not compile against the stable crates.** It is what a holonix locked before 2026-10-23 bundles (current holonix bundles 0.700.1). The rc generator emits `ref create @ OpActivity::CreateAgent { ref action }` with `create.agent()`, which matches the rc crates. Stable hdi (0.8.0, and 0.8.1 unchanged) carries `agent` as a plain field: `OpActivity::CreateAgent { agent, action }`. The template here is already corrected.
- **Building zomes needs a RUSTFLAGS setting**, see Step 4. Without it the build fails inside `getrandom` with a message about `wasm32-unknown-unknown` not being supported by default, which does not look like a Holochain problem at all.

---

## Step 4 — Build and verify

```bash
nix develop

# The RUSTFLAGS setting is REQUIRED. Without it the build fails in getrandom
# with "The wasm32-unknown-unknown targets are not supported by default".
RUSTFLAGS='--cfg getrandom_backend="custom"' \
  cargo build --release --target wasm32-unknown-unknown

# Pack the hApp
hc app pack workdir --recursive

# Run the Sweettest suite
cargo test
```

`package.json` wires these up as `npm run build:zomes`, `npm run build:happ` and `npm test`, with the RUSTFLAGS already set.

---

## Step 5 — Fill in the domain logic

The templates ship the structure with placeholder comments inside each validation function, exactly as `hc scaffold` generates them. Replace those comments with real rules.

Proceed to `implement-zome.md` for the CRUD and validation patterns, and `patterns.md` for the 0.7 action model those validation functions are written against.
