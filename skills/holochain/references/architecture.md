# Holochain Architecture

## Coordinator vs. Integrity Zomes

Every domain in a Holochain hApp is split into two crates:

| Layer | Crate type | Role |
|-------|-----------|------|
| **Integrity** | `hdi` | Defines entry types, link types, and validation rules. Deterministic; the only reads available are `must_get_*`. |
| **Coordinator** | `hdk` | Implements CRUD functions, calls other zomes, emits signals. Can be updated post-deployment. |

**Why the split matters:**
- Integrity code is committed to the DNA hash — it cannot change without forking the network
- Coordinator code can be hot-swapped without breaking agent data
- Validation runs in integrity: deterministic, and the only reads available are the `must_get_*` family, which defers on an unresolved dependency rather than failing

### What belongs where

**Integrity crate only:**
- `#[hdk_entry_types]` enum
- `#[hdk_link_types]` enum
- `validate()` callback
- Entry structs with `#[hdk_entry_helper]`
- Status enums (e.g., `ListingStatus`)

**Coordinator crate only:**
- `create_*`, `get_*`, `update_*`, `delete_*` pub functions
- `recv_remote_signal` handler
- `post_commit` hook (signals)
- Cross-zome calls

---

## DNA Structure

Each domain = one pair: `{domain}_integrity` + `{domain}` (coordinator).

```
dnas/
└── my_dna/
    ├── dna.yaml
    └── zomes/
        ├── integrity/
        │   ├── my_domain_integrity/
        │   │   ├── Cargo.toml
        │   │   └── src/
        │   │       ├── lib.rs         # Entry types, link types, validate()
        │   │       └── types.rs       # Entry structs
        ├── coordinator/
        │   └── my_domain/
        │       ├── Cargo.toml
        │       └── src/
        │           ├── lib.rs         # pub extern "C" fn declarations
        │           └── my_entry.rs    # CRUD implementation
        └── utils/                     # Shared crate (optional)
            ├── Cargo.toml
            └── src/
                ├── lib.rs
                ├── errors.rs          # thiserror enums
                └── cross_zome.rs      # external_local_call helpers
```

---

## Cargo Workspace

Root `Cargo.toml` — always pin HDK/HDI with exact versions (`=`):

```toml
[workspace]
resolver = "2"
members = [
    "dnas/my_dna/zomes/integrity/my_domain_integrity",
    "dnas/my_dna/zomes/coordinator/my_domain",
    "dnas/my_dna/zomes/coordinator/utils",
]

[workspace.dependencies]
hdi = "=0.8.1"
hdk = "=0.7.1"
serde = { version = "1", features = ["derive"] }
thiserror = "1"
```

**Why exact pins?** Holochain zome compilation is extremely sensitive to minor version differences. Range deps (`^`) cause breakage when new patch releases change internal APIs.

Individual crate `Cargo.toml`:
```toml
[package]
name = "my_domain_integrity"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]
name = "my_domain_integrity"

[dependencies]
hdi = { workspace = true }
serde = { workspace = true }
```

---

## Nix Dev Environment

Standard `flake.nix` using holonix (pin to `main-0.7` branch for HDK 0.7.x):

```nix
{
  inputs = {
    holonix.url = "github:holochain/holonix?ref=main-0.7";
    nixpkgs.follows = "holonix/nixpkgs";
    flake-parts.follows = "holonix/flake-parts";
  };

  outputs = inputs: inputs.flake-parts.lib.mkFlake { inherit inputs; } {
    systems = builtins.attrNames inputs.holonix.devShells;
    perSystem = { inputs', ... }: {
      devShells.default = inputs'.holonix.devShells.default;
    };
  };
}
```

Enter dev shell: `nix develop`

---

## Manifest Files

### happ.yaml
```yaml
manifest_version: "0"
name: my_happ
description: "My hApp"
roles:
  - name: my_dna
    provisioning:
      strategy: create
      deferred: false
    dna:
      path: "./my_dna.dna"
      modifiers:
        network_seed: ~
        properties: ~
```

### dna.yaml
```yaml
manifest_version: "0"
name: my_dna
integrity:
  network_seed: ~
  properties: ~
  zomes:
    - name: my_domain_integrity
      path: "./zomes/integrity/my_domain_integrity.wasm"
coordinator:
  zomes:
    - name: my_domain
      path: "./zomes/coordinator/my_domain.wasm"
      dependencies:
        - name: my_domain_integrity
```

---

## Scaffolding Commands

```bash
# Generate entry type boilerplate (integrity + coordinator stubs); the name must be snake_case
hc scaffold entry-type my_entry

# Generate a link type: positional from- and to-referenceables (`agent` or an entry type)
hc scaffold link-type agent my_entry

# Build: compile the zomes, then pack the DNA and hApp bundles
RUSTFLAGS='--cfg getrandom_backend="custom"' cargo build --release --target wasm32-unknown-unknown
hc app pack workdir --recursive

# Run tests (Sweettest)
cargo test
```

---

## DNA Properties & Progenitor Pattern

DNA properties let you embed configuration into the DNA at deploy time. The **progenitor pattern** uses this to designate one agent as the permanent administrator of a DHT network — their pubkey is burned into the DNA at install time via `modifiers.properties`, making admin authority immutable and cryptographically verifiable.

Reading network info from DNA properties:

```rust
let info = dna_info()?;
let network_seed = info.modifiers.network_seed.to_string();
let dna_hash = info.hash;
```

For the full progenitor implementation — `DnaProperties` struct, `check_if_progenitor()`, coordinator guard, optional integrity enforcement, bootstrap auto-registration, deploy-time injection (dna.yaml / Sweettest / Kangaroo / Moss), and pitfalls — see **`progenitor.md`**.

**Cross-ref:** `access-control.md` for capability grants and delegated admin patterns.

---

## Private Entries

```rust
// In integrity crate — mark entry as private:
#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    #[entry_type(visibility = "private")]
    MyPrivateEntry(MyPrivateEntry),
    MyPublicEntry(MyPublicEntry),  // default is public
}
```

**Key semantics:**
- Private entries are stored on the **author's source chain only** — never published to the DHT
- Other agents can see the **action** (action hash, author, timestamp) but cannot retrieve the **entry content**
- Private ≠ encrypted — other agents simply cannot fetch the entry, but if the data were leaked, it would be readable
- Use encryption (e.g., `x_25519_x_salsa20_poly1305_encrypt`) if you need genuine confidentiality beyond network-level privacy

**When to use private entries:**
- Personal notes or drafts not meant for others
- Intermediate state that should not be globally visible
- Data that only the agent and explicitly authorized parties should read

---

## Multi-DNA Architecture

Most hApps can use a single DNA. When to consider multiple DNAs (roles):

| Pattern | When to use |
|---------|-------------|
| Single DNA | All agents share the same DHT network; simplest |
| Multiple roles | Separate concerns with different network boundaries (e.g., public + private data) |
| Clone cells | Partitioned data — separate instances per user, group, or time period |

### Bridge Calls Between Roles

```rust
// Call a function in a different role within the same hApp:
let response = call(
    CallTargetCell::OtherRole("other_role_name".into()),
    "other_zome",
    "function_name".into(),
    None,
    input,
)?;
```

### `happ.yaml` Multi-Role Structure

```yaml
manifest_version: "0"
name: my_happ
roles:
  - name: primary_role
    provisioning:
      strategy: create
      deferred: false
    dna:
      path: "./primary.dna"
  - name: secondary_role
    provisioning:
      strategy: create
      deferred: false         # provisioned on install, clonable at runtime
    dna:
      path: "./secondary.dna"
      modifiers:
        network_seed: ~
      clone_limit: 10         # allow up to 10 clones of this role
```

**`deferred`** — ignored by the conductor on install. `AppBundle::resolve_cell` destructures
`Create { .. }` without reading it, so a `create` role is always provisioned. Leave it `false`.
**`clone_limit`** — enables cell cloning for this role, and does not require an unprovisioned base
cell (see `cell-cloning.md`).
