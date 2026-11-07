# Workflow: Implement a Zome Pair

Use this workflow when implementing a new zome pair (integrity + coordinator) for a Holochain domain. Prerequisites: data model designed (see `design-data-model.md`).

---

## Step 1: Scaffold — Generate Boilerplate

Start from scaffold output to avoid blank-page overhead:

```bash
# Navigate to your DNA directory
cd dnas/my_dna

# Scaffold entry type (generates integrity + coordinator stubs); the name must be snake_case.
# It prompts for fields and CRUD, including whether to link each update from the original.
hc scaffold entry-type my_entry

# Scaffold a link type: positional from- and to-referenceables (`agent` or an entry type)
hc scaffold link-type agent my_entry

# Path-anchored "all entries" links come from a collection, not from link-type
hc scaffold collection global all_my_entries my_entry

# Verify compilation after scaffolding (from the hApp root)
cd ../../
RUSTFLAGS='--cfg getrandom_backend="custom"' cargo build --release --target wasm32-unknown-unknown
hc app pack workdir --recursive
```

**What scaffolding generates:**
- Integrity crate: entry type variant + link type variants + stub `validate()`
- Coordinator crate: stub `create_*`, `get_*`, `update_*`, `delete_*` functions
- Updated `happ.yaml` and `dna.yaml` (verify these are correct)

After scaffolding: READ the generated files before editing. Understand what's there.

---

## Step 2: Integrity Crate — Define Types and Validation

**File: `zomes/integrity/{domain}_integrity/src/lib.rs`**

```rust
use hdi::prelude::*;

// 1. Entry struct (from DesignDataModel output)
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct MyEntry {
    pub title: String,
    pub description: String,
    pub status: MyEntryStatus,
}

// 2. Status enum (if soft-delete pattern needed)
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub enum MyEntryStatus {
    Active,
    Archived,
    Deleted,
}

// 3. Entry types enum (register all entry types)
#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    MyEntry(MyEntry),
}

// 4. Link types enum (register all link types)
#[hdk_link_types]
pub enum LinkTypes {
    AgentToMyEntry,
    PathToMyEntry,
    MyEntryUpdates,
}

// 5. Validation callback — dispatches on the flattened op.
// This is an abridged shape. `hc scaffold` generates the full dispatcher,
// including the CreateRecord and AgentActivity arms; see patterns.md.
#[hdk_extern]
pub fn validate(op: Op) -> ExternResult<ValidateCallbackResult> {
    match op.flattened::<EntryTypes, LinkTypes>()? {
        FlatOp::CreateEntry(create_entry) => match create_entry {
            OpEntry::CreateEntry { app_entry, action } => {
                let create_action: TypedAction<EntryCreationData> = action.into();
                match app_entry {
                    EntryTypes::MyEntry(entry) => validate_create_my_entry(create_action, entry),
                }
            }
            _ => Ok(ValidateCallbackResult::Valid),
        },
        FlatOp::Link(OpLink::CreateLink { link_type, action }) => match link_type {
            LinkTypes::AgentToMyEntry => validate_create_link_agent_to_my_entry(action),
            _ => Ok(ValidateCallbackResult::Valid),
        },
        _ => Ok(ValidateCallbackResult::Valid),
    }
}

pub fn validate_create_my_entry(
    _action: TypedAction<EntryCreationData>,
    entry: MyEntry,
) -> ExternResult<ValidateCallbackResult> {
    if entry.title.trim().is_empty() {
        return Ok(ValidateCallbackResult::Invalid(
            "MyEntry title cannot be empty".into(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}

// Link validation takes the typed create-link action. Note the type parameter:
// `CreateLinkData` for a create, `DeleteLinkData` for a delete. See patterns.md
// for the body that resolves and checks the link target.
pub fn validate_create_link_agent_to_my_entry(
    _action: TypedAction<CreateLinkData>,
) -> ExternResult<ValidateCallbackResult> {
    Ok(ValidateCallbackResult::Valid)
}
```

---

## Step 3: Coordinator Crate — Implement CRUD

**File: `zomes/coordinator/{domain}/src/my_entry.rs`**

Implement in this order: create → get_latest → get_all → update → delete

```rust
use hdk::prelude::*;
use {domain}_integrity::*;

// CREATE
#[hdk_extern]
pub fn create_my_entry(my_entry: MyEntry) -> ExternResult<Record> {
    let hash = create_entry(&EntryTypes::MyEntry(my_entry.clone()))?;

    // Path anchor
    let path = Path::from("entries.active");
    create_link(path.path_entry_hash()?, hash.clone(), LinkTypes::PathToMyEntry, ())?;

    // Agent index
    create_link(
        agent_info()?.agent_initial_pubkey,
        hash.clone(),
        LinkTypes::AgentToMyEntry,
        (),
    )?;

    get(hash, GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Record not found after create".into())))
}

// GET LATEST (walks update chain)
#[hdk_extern]
pub fn get_latest_my_entry(original_action_hash: ActionHash) -> ExternResult<Option<Record>> {
    let links = get_links(
        LinkQuery::try_new(original_action_hash.clone(), LinkTypes::MyEntryUpdates)?,
        GetStrategy::default(),
    )?;
    let latest_hash = links
        .into_iter()
        .max_by(|a, b| a.timestamp.cmp(&b.timestamp))
        .and_then(|l| l.target.into_action_hash())
        .unwrap_or(original_action_hash);
    get(latest_hash, GetOptions::default())
}

// GET ALL (from path anchor)
#[hdk_extern]
pub fn get_all_my_entries(_: ()) -> ExternResult<Vec<Record>> {
    let path = Path::from("entries.active");
    let links = get_links(
        LinkQuery::try_new(path.path_entry_hash()?, LinkTypes::PathToMyEntry)?,
        GetStrategy::default(),
    )?;
    let inputs: Vec<GetInput> = links
        .into_iter()
        .filter_map(|l| l.target.into_action_hash())
        .map(|h| GetInput::new(h.into(), GetOptions::default()))
        .collect();
    let records = HDK.with(|hdk| hdk.borrow().get(inputs))?;
    Ok(records.into_iter().flatten().collect())
}

// UPDATE
#[hdk_extern]
pub fn update_my_entry(input: UpdateMyEntryInput) -> ExternResult<Record> {
    let original = get(input.original_action_hash.clone(), GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Original not found".into())))?;
    if original.action().author() != &agent_info()?.agent_initial_pubkey {
        return Err(wasm_error!(WasmErrorInner::Guest("Not authorized".into())));
    }
    let updated = update_entry(input.previous_action_hash, &EntryTypes::MyEntry(input.updated_entry))?;
    create_link(input.original_action_hash, updated.clone(), LinkTypes::MyEntryUpdates, ())?;
    get(updated, GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Record not found after update".into())))
}

// DELETE
// Decision point: clean up BOTH index links (path + agent) for a full remove,
// or only the path link and leave the agent link as a historical tombstone.
// Most apps clean both. Only keep the agent link if you need "all entries ever
// created by this agent including deleted ones" semantics.
#[hdk_extern]
pub fn delete_my_entry(original_action_hash: ActionHash) -> ExternResult<ActionHash> {
    let original = get(original_action_hash.clone(), GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Entry not found".into())))?;
    if original.action().author() != &agent_info()?.agent_initial_pubkey {
        return Err(wasm_error!(WasmErrorInner::Guest("Not authorized".into())));
    }

    // Clean path index (global browse)
    let path = Path::from("entries.active");
    for link in get_links(
        LinkQuery::try_new(path.path_entry_hash()?, LinkTypes::PathToMyEntry)?,
        GetStrategy::default(),
    )? {
        if link.target.into_action_hash() == Some(original_action_hash.clone()) {
            delete_link(link.create_link_hash, GetOptions::default())?;
        }
    }

    // Clean agent index (per-author listing) — omit if you want historical tombstones
    for link in get_links(
        LinkQuery::try_new(
            agent_info()?.agent_initial_pubkey,
            LinkTypes::AgentToMyEntry,
        )?,
        GetStrategy::default(),
    )? {
        if link.target.into_action_hash() == Some(original_action_hash.clone()) {
            delete_link(link.create_link_hash, GetOptions::default())?;
        }
    }

    delete_entry(original_action_hash)
}

// Input type for update (needed since update takes 3 params)
#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateMyEntryInput {
    pub original_action_hash: ActionHash,
    pub previous_action_hash: ActionHash,
    pub updated_entry: MyEntry,
}
```

**lib.rs: declare the module (complete example):**
```rust
pub mod my_entry;

use hdk::prelude::*;
use {domain}_integrity::*;

// init, recv_remote_signal and post_commit live here; the CRUD externs stay in my_entry.rs
```

Note: each function in `my_entry.rs` already has `#[hdk_extern]`, which exports it as an unmangled `extern "C"` symbol. Do not re-declare `#[hdk_extern]` wrappers with the same names in `lib.rs`: two exports named `create_my_entry` are duplicate symbols and the zome fails to build. The scaffold keeps the externs in their modules and `lib.rs` only declares `pub mod my_entry;`, as in `../example-happ/dnas/forum/zomes/coordinator/posts/src/lib.rs`.

---

## Step 4: Utils Crate (if cross-zome calls needed)

Add to `utils/src/errors.rs`:
```rust
// (see ../error-handling.md for full pattern)
```

Add to `utils/src/cross_zome.rs`:
```rust
// (see ../patterns.md for external_local_call helper)
```

Update workspace `Cargo.toml` to include utils crate.

---

## Step 5: Tests

Write tests in this order using **Sweettest** (Rust, `cargo test`) — the primary testing framework for this skill. See `../testing.md` for full patterns.

**Foundation (single-agent):**
```
1. Create an entry — assert record returned
2. Get latest — assert matches created entry
3. Get all — assert list contains created entry
4. Update — assert updated fields reflected
5. Delete — assert entry gone from list
```

**Integration (two agents):**
```
1. Alice creates → await_consistency → Bob reads — assert cross-agent read works
2. Alice creates → await_consistency → Bob gets all — assert entry in collection
3. Alice creates → updates → await_consistency → Bob gets latest — assert latest version
```

**Sweettest commands:**
```bash
cargo test --package my_dna_tests
cargo test --package my_dna_tests two_agents  # single test
```

See `../testing.md` for full code patterns including `await_consistency` placement (60 s budget; `await_consistency_s(timeout, cells)` for another one), `SweetConductorBatch` setup, and inline-zome shortcuts.

---

## Step 6: Build and Verify

```bash
# Full build: compile the zomes, then pack the bundles (the example hApp's `build:happ` script)
RUSTFLAGS='--cfg getrandom_backend="custom"' cargo build --release --target wasm32-unknown-unknown
hc app pack workdir --recursive

# If build succeeds, run the Sweettest suite (foundation tests first, then integration)
cargo test --package my_dna_tests
```

**Common build errors:**

| Error | Cause | Fix |
|-------|-------|-----|
| `cannot find type EntryTypes` | Missing import | Add `use {domain}_integrity::*;` |
| `no method named to_type` | `Op::to_type` was removed in hdi 0.5 | Replace with `op.flattened::<EntryTypes, LinkTypes>()?` |
| `expected ExternResult, found ValidateCallbackResult` | Wrong return | Use `Ok(ValidateCallbackResult::Valid)` |
| Link type not found | Unregistered link | Add to `#[hdk_link_types]` enum in integrity |
| `wasm-opt` timeout | Build too slow | Normal for first build; subsequent builds cache |
