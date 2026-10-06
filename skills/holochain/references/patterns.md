# Holochain Patterns

## Entry Types (Integrity Crate)

**What NOT to put in entry fields — already in action headers:**

Every committed action carries free metadata in its header. Never duplicate these as entry fields:

| Already in header | How to access (coordinator) |
|-------------------|-----------------------------|
| Author (agent pubkey) | `record.action().author()` |
| Timestamp | `record.action().timestamp()` |
| Entry hash | `record.action().entry_hash()` |
| Previous action hash | available on `Update`/`Delete` actions |

If you find yourself adding `created_by: AgentPubKey` or `created_at: Timestamp` to an entry struct, remove them — they're already there.

```rust
use hdi::prelude::*;

// Entry struct — always derive these
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct MyEntry {
    pub title: String,
    pub description: String,
    pub status: MyEntryStatus,
    // Use #[serde(default)] for fields added after initial deployment
    #[serde(default)]
    pub tags: Vec<String>,
    // DO NOT add: author, created_at, updated_at — those are in the action header
}

// Status enum for soft-delete pattern
#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub enum MyEntryStatus {
    Active,
    Archived,
    Deleted,
}

// Register all entry types in one enum (integrity crate)
#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    MyEntry(MyEntry),
    AnotherEntry(AnotherEntry),
}
```

---

## Link Types (Integrity Crate)

```rust
// Register all link types in one enum (integrity crate)
#[hdk_link_types]
pub enum LinkTypes {
    // Naming convention: BaseToTarget (PascalCase)
    AgentToMyEntry,
    PathToMyEntry,
    MyEntryUpdates,       // Update chain tracking
    MyEntryToRelated,     // Bidirectional: also RelatedToMyEntry
    RelatedToMyEntry,
}
```

**Naming convention:** `{Base}To{Target}` — always PascalCase, always directional.

---

## Implicit vs. Explicit Links

Holochain has two layers of navigable relationships. Understanding the distinction prevents over-engineering and redundant data.

### Implicit — action metadata and DHT metadata (no `create_link` needed)

**1. Action metadata** — fields baked into every action header:

| Field | Type | How to access |
|-------|------|---------------|
| `author` | `AgentPubKey` | `record.action().author()` |
| `timestamp` | `Timestamp` | `record.action().timestamp()` |
| `original_action_address` | `ActionHash` | only on `Action::Update` — the original creation action |
| `deletes_address` | `ActionHash` | only on `Action::Delete` — the action being deleted |

Walking **backward** through an update chain uses this — no links needed:
```rust
// From any update action hash → find the original
match record.action().clone() {
    Action::Update(u) => current_hash = u.original_action_address, // go back one step
    Action::Create(_) => return Ok(OriginalActionHash(current_hash)), // found it
    _ => ...
}
```

**2. DHT metadata** — aggregated by the DHT automatically, returned by `get_details`:

```rust
pub struct RecordDetails {
    pub record: Record,
    pub validation_status: ValidationStatus,
    pub updates: Vec<SignedHashed<Action>>, // all Update actions on this record
    pub deletes: Vec<SignedHashed<Action>>, // all Delete actions on this record
}

pub struct EntryDetails {
    pub entry: Entry,
    pub actions: Vec<SignedHashed<Action>>, // all Create/Update actions for this entry
    pub updates: Vec<SignedHashed<Action>>,
    pub deletes: Vec<SignedHashed<Action>>,
}
```

**3. Embedded ActionHash in entry fields** — a relationship baked INTO the entry content

```rust
#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct Offer {
    pub title: String,
    pub organization_hash: ActionHash, // embedded relationship — no create_link needed
}
```

**Critical tradeoff:** If `organization_hash` changes, the content changes → new entry hash → requires `update_entry`. Use embedded hashes when the reference is intrinsic to the entry's identity. Use explicit links when the relationship may change independently.

### Explicit links — you define, create, and query them

| Link type | Purpose |
|-----------|---------|
| `PathToMyEntry` | Global discovery — browse all entries from a known path string |
| `AgentToMyEntry` | Per-agent listing — "show me this agent's entries" |
| `MyEntryUpdates` | Forward traversal — original hash → latest version |
| `MyEntryToRelated` | Cross-domain relationship navigation |

### Decision rule

| Question | Tool |
|----------|------|
| "Who created this entry? When?" | `record.action().author()` / `.timestamp()` — no links |
| "Has this record been updated or deleted?" | `get_details(action_hash)` → `.updates` / `.deletes` |
| "What is the LATEST version of this entry?" | `get_links(original_hash, UpdatesLinkType)` → max timestamp |
| "Find entries without knowing any hash" | Explicit `PathTo*` or `AgentTo*` links |
| "Navigate from entry A to related entry B" | Explicit `AToB` link |
| "Link is intrinsic to entry identity?" | Embedded `ActionHash` field in entry struct |
| "Link may change independently of entry?" | Explicit link — keeps entry hash stable |

---

## Create Pattern

```rust
pub fn create_my_entry(my_entry: MyEntry) -> ExternResult<Record> {
    let my_entry_hash = create_entry(&EntryTypes::MyEntry(my_entry.clone()))?;

    // 1. Discovery anchor (path)
    let path = Path::from("entries.active");
    create_link(
        path.path_entry_hash()?,
        my_entry_hash.clone(),
        LinkTypes::PathToMyEntry,
        (),
    )?;

    // 2. Agent index
    let agent_info = agent_info()?;
    create_link(
        agent_info.agent_initial_pubkey,
        my_entry_hash.clone(),
        LinkTypes::AgentToMyEntry,
        (),
    )?;

    // 3. Get and return the full record
    let record = get(my_entry_hash.clone(), GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Entry not found after create".into())))?;

    Ok(record)
}
```

---

## Read Latest Pattern (Walking Update Chain)

```rust
pub fn get_latest_my_entry(original_action_hash: ActionHash) -> ExternResult<Option<Record>> {
    let links = get_links(
        LinkQuery::try_new(original_action_hash.clone(), LinkTypes::MyEntryUpdates)?,
        GetStrategy::default(),
    )?;

    let latest_link = links
        .into_iter()
        .max_by(|a, b| a.timestamp.cmp(&b.timestamp));

    let latest_hash = match latest_link {
        Some(link) => {
            link.target
                .into_action_hash()
                .ok_or(wasm_error!(WasmErrorInner::Guest("Invalid target hash".into())))?
        }
        None => original_action_hash, // No updates — original is latest
    };

    get(latest_hash, GetOptions::default())
}
```

---

## Read Collection Pattern

```rust
pub fn get_all_my_entries() -> ExternResult<Vec<Record>> {
    let path = Path::from("entries.active");
    let links = get_links(
        LinkQuery::try_new(path.path_entry_hash()?, LinkTypes::PathToMyEntry)?,
        GetStrategy::default(),
    )?;

    let get_inputs: Vec<GetInput> = links
        .into_iter()
        .filter_map(|link| link.target.into_action_hash())
        .map(|hash| GetInput::new(hash.into(), GetOptions::default()))
        .collect();

    let records = HDK.with(|hdk| hdk.borrow().get(get_inputs))?;
    Ok(records.into_iter().flatten().collect())
}
```

---

## Update Pattern

```rust
pub fn update_my_entry(
    original_action_hash: ActionHash,
    previous_action_hash: ActionHash,
    updated_entry: MyEntry,
) -> ExternResult<Record> {
    // 1. Author check
    let original_record = get(original_action_hash.clone(), GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Entry not found".into())))?;
    let action = original_record.action();
    let agent = agent_info()?.agent_initial_pubkey;
    if action.author() != &agent {
        return Err(wasm_error!(WasmErrorInner::Guest("Not authorized".into())));
    }

    // 2. Update entry
    let updated_action_hash = update_entry(previous_action_hash, &EntryTypes::MyEntry(updated_entry))?;

    // 3. Track update chain with link
    create_link(
        original_action_hash,
        updated_action_hash.clone(),
        LinkTypes::MyEntryUpdates,
        (),
    )?;

    let record = get(updated_action_hash, GetOptions::default())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Updated record not found".into())))?;
    Ok(record)
}
```

---

## Delete Pattern

```rust
pub fn delete_my_entry(original_action_hash: ActionHash) -> ExternResult<ActionHash> {
    let path = Path::from("entries.active");
    let path_links = get_links(
        LinkQuery::try_new(path.path_entry_hash()?, LinkTypes::PathToMyEntry)?,
        GetStrategy::default(),
    )?;
    for link in path_links {
        if let Some(hash) = link.target.into_action_hash() {
            if hash == original_action_hash {
                delete_link(link.create_link_hash, GetOptions::default())?;
            }
        }
    }
    delete_entry(original_action_hash)
}
```

---

## Status Transition (Soft Delete)

Prefer updating status over deleting for data that other agents may reference:

```rust
pub fn archive_my_entry(original_action_hash: ActionHash, previous_action_hash: ActionHash)
    -> ExternResult<Record> {
    let mut record = get_latest_my_entry(original_action_hash.clone())?
        .ok_or(wasm_error!(WasmErrorInner::Guest("Entry not found".into())))?;

    let mut entry: MyEntry = record.entry().to_app_option()?.ok_or(
        wasm_error!(WasmErrorInner::Guest("Expected MyEntry".into()))
    )?;

    if entry.status == MyEntryStatus::Deleted {
        return Err(wasm_error!(WasmErrorInner::Guest("Cannot archive deleted entry".into())));
    }

    entry.status = MyEntryStatus::Archived;
    update_my_entry(original_action_hash, previous_action_hash, entry)
}
```

---

## Cross-Zome Calls

```rust
// In utils/src/cross_zome.rs
pub fn external_local_call<I, T>(zome_name: &str, fn_name: &str, input: I) -> ExternResult<T>
where
    I: serde::Serialize + std::fmt::Debug,
    T: serde::de::DeserializeOwned + std::fmt::Debug,
{
    let zome_call_response = call(
        CallTargetCell::Local,
        zome_name.into(),
        fn_name.into(),
        None,
        input,
    )?;

    match zome_call_response {
        ZomeCallResponse::Ok(result) => {
            let typed: T = result.decode().map_err(|e| {
                wasm_error!(WasmErrorInner::Guest(format!("Decode error: {:?}", e)))
            })?;
            Ok(typed)
        }
        ZomeCallResponse::Unauthorized(auth, _, zome, func) => Err(wasm_error!(
            WasmErrorInner::Guest(format!("Unauthorized: {zome}/{func} ({auth:?})"))
        )),
        ZomeCallResponse::AuthenticationFailed(_, agent) => Err(wasm_error!(
            WasmErrorInner::Guest(format!("Authentication failed for {agent:?}"))
        )),
        ZomeCallResponse::NetworkError(e) => Err(wasm_error!(WasmErrorInner::Guest(
            format!("Network error: {e}")
        ))),
        ZomeCallResponse::CountersigningSession(e) => Err(wasm_error!(WasmErrorInner::Guest(
            format!("Countersigning session failed to start: {e}")
        ))),
    }
}

// Usage:
let result: MyOtherEntry = external_local_call("other_zome", "get_entry", hash)?;
```

### `call_remote`: a refusal arrives as `NetworkError`

The same `ZomeCallResponse` match does not read the same way for `call_remote`. Locally, a callee that returns `Err` makes `call(...)` itself fail, so the `?` above propagates it. Across the network, `NetworkError` covers far more than "unreachable":

- When the remote function returns `Err`, or does not exist, the remote ribosome returns a `RibosomeError` (`holochain 0.7.0`, `src/core/ribosome.rs`). The remote cell's handler unwraps it with `??` and it leaves as a p2p failure (`src/conductor/cell.rs`, `handle_call_remote`), and so does a failed signature check on the remote side.
- The caller's host function turns every p2p failure into `Ok(ZomeCallResponse::NetworkError(e.to_string()))` (`src/core/ribosome/host_fn/call.rs`).
- A failed capability check is the exception: it comes back as its own `Unauthorized` variant.

So "the other agent refused" and "the other agent could not be reached" are the same variant, and only the string tells them apart: a guest error from the remote carries its message inside the text (one 0.7 hApp in the field tells them apart by looking for `Guest("` in it). Treat that as a heuristic, not a stable contract. When the difference matters to users, prefer making the remote function return `Ok` with a typed refusal in its output, and keep `Err` for genuine faults.

---

## Signals (post_commit)

```rust
#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum Signal {
    LinkCreated { action: SignedActionHashed, link_type: LinkTypes },
    LinkDeleted { action: SignedActionHashed, link_type: LinkTypes },
    EntryCreated { action: SignedActionHashed, app_entry: EntryTypes },
    EntryUpdated { action: SignedActionHashed, app_entry: EntryTypes, original_app_entry: EntryTypes },
    EntryDeleted { action: SignedActionHashed, original_app_entry: EntryTypes },
}

// NOTE: post_commit is infallible — use #[hdk_extern(infallible)] and log errors
#[hdk_extern(infallible)]
pub fn post_commit(committed_actions: Vec<SignedActionHashed>) {
    for action in committed_actions {
        if let Err(err) = signal_action(action) {
            error!("Error signaling new action: {:?}", err);
        }
    }
}
```

**Remote signals** — send signals to other agents:

```rust
// Sender:
// Signature is send_remote_signal(input, agents): payload FIRST, then a Vec of
// recipients. Passing a bare AgentPubKey, or the two the other way round, does
// not compile.
send_remote_signal(MySignal::Ping, vec![recipient_pubkey])?;

// Receiver callback:
#[hdk_extern]
pub fn recv_remote_signal(signal: SerializedBytes) -> ExternResult<()> {
    let sig: MySignal = signal.try_into()?;
    emit_signal(sig)?;
    Ok(())
}

// REQUIRED: cap grant in init() so any agent can call recv_remote_signal:
#[hdk_extern]
pub fn init(_: ()) -> ExternResult<InitCallbackResult> {
    let mut functions = HashSet::new();
    functions.insert((zome_info()?.name, "recv_remote_signal".into()));
    create_cap_grant(ZomeCallCapGrant {
        tag: "remote_signals".into(),
        access: CapAccess::Unrestricted,
        functions: GrantedFunctions::Listed(functions),
    })?;
    Ok(InitCallbackResult::Pass)
}
```

Note: `send_remote_signal` is fire-and-forget — it does not wait for confirmation and does not queue messages for offline agents.

---

## HDK 0.7 API Changes (Breaking)

The action model rewrite is covered under [Validation](#validation-integrity-crate). These are the rest.

### `get_agent_activity()` — takes a GetOptions, returns `AgentActivityStatus`

```rust
let activity: AgentActivityStatus = get_agent_activity(
    agent,
    ChainQueryFilter::new(),
    ActivityRequest::Full,
    GetOptions::default(),   // new fourth argument in 0.7
)?;
```

The return type was renamed from `AgentActivity` to resolve a collision with the unrelated `AgentActivity` op variant. It can now report `ChainStatus::Closed` when a source chain head is a `CloseChain` action, ranking above `Valid` but below `Forked` and `Invalid`. Match exhaustively and you need the new arm.

### `ChainFilter` — constructors, not a builder chain

Each limit condition has its own constructor taking the chain top, so a filter carries exactly one condition:

```rust
// 0.6: ChainFilter::new(chain_top).until_hash(oldest_hash)
let filter = ChainFilter::until_hash(chain_top, oldest_hash);

// 0.6: ChainFilter::new(chain_top).take(10)
let filter = ChainFilter::take(chain_top, 10);
```

`ChainFilter::new`, `until_timestamp` and the `include_cached_entries` builder method remain. A filter with `Take(0)` is now rejected as invalid input rather than returning an empty result.

`must_get_agent_activity` now walks down from the `chain_top` you give it, excludes forked actions, and reports more precisely when it cannot answer deterministically. If you match on `MustGetAgentActivityResponse`, handle `UntilHashMissing`, `UntilHashAfterChainHead`, `UntilTimestampIndeterminate` and `IncompleteChain`.

### `Record::new()` takes a `RecordEntry`

So that "there is no entry" and "the entry is hidden from you" are distinguishable:

```rust
Details::Entry(details) => Ok(Some(Record::new(
    details.actions[0].clone(),
    RecordEntry::Present(details.entry),   // 0.6 took Some(details.entry)
)))
```

### `block_agent()` and `unblock_agent()` are gone

Removed from the HDK entirely, host functions included. WASM that still references them fails to instantiate. Blocking is now a system-level behaviour driven by warrants, not something an application decides. Application-level blocking built on these needs redesigning rather than porting.

#### What replaced them: warrants and chain status

A **warrant** is a notice, issued by an authority that validated a DHT operation, that a specific action by a specific agent was invalid. Warrants propagate to the neighborhood holding that agent's activity. The system acts on them. Your zome reads them.

You get both the status and the warrants from one call:

```rust
let activity = get_agent_activity(
    agent.clone(),
    ChainQueryFilter::new(),
    ActivityRequest::Status,
    GetOptions::default(),
)?;

match activity.status {
    ChainStatus::Valid(head)   => { /* valid as far as THIS authority saw */ }
    ChainStatus::Forked(fork)  => { /* two conflicting actions at one sequence */ }
    ChainStatus::Invalid(head) => { /* invalid from this action forward */ }
    ChainStatus::Empty         => { /* this authority knows nothing yet */ }
    _ => {}
}

if !activity.warrants.is_empty() {
    // other authorities found invalidity that `status` does not reflect
}
```

Four things about this that catch people out, all stated in the 0.7 source:

1. **`ChainStatus::Valid` is one authority's opinion, not a verdict.** It means the authority you asked saw no invalid op. Another authority validating a *different* op for the same action may have found it invalid. Checking `status` without also checking `warrants` gives you a false clean bill of health.
2. **`warrants` is the field that carries the cross-authority picture.** `status`, `valid_activity` and `rejected_activity` are all scoped to the responding authority. `valid_activity` can list actions that other authorities have warranted.
3. **`Forked` wins over `Invalid`.** A chain that is both forked and has invalid records reports `Forked`. To see the invalid records too, read `warrants`, or re-query with `ActivityRequest::Full` and inspect `rejected_activity`.
4. **`Closed` wins over `Valid`.** A chain whose head is a `CloseChain` action reports `Closed`, not `Valid`. Treat it as "this agent will append nothing further", not as an error.

**Design consequence.** Since you can no longer block an agent from your zome, the honest pattern is: query activity before you act on an agent's data where the stakes justify a round trip, and let your own application logic decide to ignore, quarantine, or flag. That is a coordinator-side decision. It cannot live in `validate()`, which has no network access.

### `delete_link()` — requires GetOptions

```rust
// WRONG (pre-0.6):  legacy-ok
delete_link(link.create_link_hash)?;  // legacy-ok

// CORRECT (0.6+):
delete_link(link.create_link_hash, GetOptions::default())?;
```

### `LinkQuery::new()` + `GetStrategy`

```rust
let links = get_links(
    LinkQuery::try_new(original_action_hash.clone(), LinkTypes::MyEntryUpdates)?,
    GetStrategy::Local,
)?;
```

**`GetStrategy` decision rule:**

| Strategy | When to use |
|----------|-------------|
| `GetStrategy::Local` | Source chain only — use for `get_my_*` (own authored data, fast, no network) |
| `GetStrategy::Network` | DHT — use for `get_all_*` (data authored by others, default behavior) |

**Additional LinkQuery features:**

```rust
// Tag prefix filter:
let query = LinkQuery::try_new(base, LinkTypes::MyLink)?
    .tag_prefix(LinkTag::new(tag_bytes));

// Count without fetching records:
let count = count_links(query.clone())?;

// Include deleted links:
let details = get_links_details(query, GetStrategy::default())?;
```

### `HDK.with()` Batch Gets

More efficient than N individual `get()` calls:

```rust
let get_inputs: Vec<GetInput> = links
    .into_iter()
    .filter_map(|link| link.target.into_action_hash())
    .map(|hash| GetInput::new(hash.into(), GetOptions::default()))
    .collect();
let records = HDK.with(|hdk| hdk.borrow().get(get_inputs))?;
let records: Vec<Record> = records.into_iter().flatten().collect();
```

---

## `must_get_*` Family (Fail-Fast Gets)

Unlike `get()` which returns `Option`, these return an error immediately if the record is not found.

```rust
// In coordinator — authorship check before update:
let original_record = must_get_valid_record(input.original_action_hash.clone().into())?;
let author = original_record.action().author().clone();

// In integrity validation — authorship check:
let original_action_record = must_get_action(original_action_hash.clone())?;
if action.action().author() != original_action_record.action().author() {
    return Ok(ValidateCallbackResult::Invalid(
        "Only the original author can update this entry.".to_string(),
    ));
}
```

Full family:
- `must_get_valid_record(action_hash)` — record that passed validation
- `must_get_action(action_hash)` — raw action (use in validation)
- `must_get_entry(entry_hash)` — entry content
- `must_get_agent_activity(agent, filter)` — agent's source chain slice

---

## Validation (Integrity Crate)

The shape below is taken from `hc scaffold` 0.700.0 output on Holochain 0.7, trimmed to one entry type and one link type. `hc scaffold` generates the full dispatcher for you; hand-writing it is not the intended path.

```rust
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
        FlatOp::Update(update_entry) => match update_entry {
            OpUpdate::Entry { app_entry, action } => {
                let original_action = TypedAction::<EntryCreationData>::try_from_action(
                    must_get_action(action.data.original_action_address.clone())?
                        .action()
                        .to_owned(),
                )?;
                match app_entry {
                    EntryTypes::MyEntry(entry) => {
                        let original_record =
                            must_get_valid_record(action.data.original_action_address.clone())?;
                        let original_entry = MyEntry::try_from(original_record)
                            .map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{e:?}"))))?;
                        validate_update_my_entry(action, entry, original_action, original_entry)
                    }
                }
            }
            _ => Ok(ValidateCallbackResult::Valid),
        },
        FlatOp::Delete(OpDelete { action }) => {
            let original_record = must_get_valid_record(action.data.deletes_address.clone())?;
            // ... narrow the original action and dispatch to validate_delete_my_entry
            Ok(ValidateCallbackResult::Valid)
        }
        FlatOp::Link(OpLink::CreateLink { link_type, action }) => match link_type {
            LinkTypes::MyEntryUpdates => validate_create_link_my_entry_updates(action),
            LinkTypes::AgentToMyEntry => validate_create_link_agent_to_my_entry(action),
        },
        FlatOp::Link(OpLink::DeleteLink { link_type, original_action, action }) => match link_type {
            LinkTypes::MyEntryUpdates =>
                validate_delete_link_my_entry_updates(action, original_action),
            LinkTypes::AgentToMyEntry =>
                validate_delete_link_agent_to_my_entry(action, original_action),
        },
        // CreateRecord mirrors the above per-entry validation at record level
        FlatOp::CreateRecord(_) => Ok(ValidateCallbackResult::Valid),
        FlatOp::AgentActivity(_) => Ok(ValidateCallbackResult::Valid),
    }
}
```

The validation function signatures it dispatches to:

```rust
pub fn validate_create_my_entry(
    _action: TypedAction<EntryCreationData>,
    _entry: MyEntry,
) -> ExternResult<ValidateCallbackResult> { Ok(ValidateCallbackResult::Valid) }

pub fn validate_update_my_entry(
    _action: TypedAction<UpdateData>,
    _entry: MyEntry,
    _original_action: TypedAction<EntryCreationData>,
    _original_entry: MyEntry,
) -> ExternResult<ValidateCallbackResult> { Ok(ValidateCallbackResult::Valid) }

pub fn validate_delete_my_entry(
    _action: TypedAction<DeleteData>,
    _original_action: TypedAction<EntryCreationData>,
    _original_entry: MyEntry,
) -> ExternResult<ValidateCallbackResult> { Ok(ValidateCallbackResult::Valid) }

pub fn validate_create_link_agent_to_my_entry(
    action: TypedAction<CreateLinkData>,
) -> ExternResult<ValidateCallbackResult> {
    let action_hash = action
        .data
        .target_address
        .into_action_hash()
        .ok_or(wasm_error!(WasmErrorInner::Guest(
            "No action hash associated with link".to_string()
        )))?;
    let _record = must_get_valid_record(action_hash)?;
    Ok(ValidateCallbackResult::Valid)
}

pub fn validate_delete_link_agent_to_my_entry(
    _action: TypedAction<DeleteLinkData>,
    _original_action: TypedAction<CreateLinkData>,
) -> ExternResult<ValidateCallbackResult> { Ok(ValidateCallbackResult::Valid) }
```

### The 0.7 action model

An `Action` is no longer an enum of per-variant structs. It is a struct with two fields: a `header` carrying what every action shares, and a `data` enum carrying what is specific to the action type.

`ActionHeader` holds `author`, `timestamp`, `action_seq` and `prev_action`. Everything else lives on the `ActionData` variant, whose payload structs gained a `Data` suffix: `CreateData`, `UpdateData`, `DeleteData`, `CreateLinkData`, `DeleteLinkData`.

```rust
// Reading a common field: use the accessor, not the header directly.
// Both Action and TypedAction<D> have author(), timestamp(), action_seq(), prev_action().
if action.author() != record.action().author() {
    return Ok(ValidateCallbackResult::Invalid("Only the author may do this".into()));
}

// prev_action() is an Option: the genesis Dna action has no predecessor.
let prev = action
    .prev_action()
    .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("expected a prior action".into())))?
    .clone();
```

`FlatOp` sub-types (`OpEntry`, `OpUpdate`, `OpDelete`, `OpRecord`, `OpActivity`, `OpLink`) now carry a `TypedAction<D>`: the header paired with exactly the data payload the matched variant guarantees. `TypedAction<D>` derefs to its data, so read payload fields straight off it. You only need `.data` to move a field out by value, because you cannot move out of a deref:

```rust
action.target_address                      // borrow: fine
action.data.target_address.into_action_hash()   // move: needs .data
```

**FlatOp variant renames.** The enum now describes what happened rather than what the DHT does about it, and the two link variants folded into one:

| 0.6 | 0.7 |
|---|---|
| `FlatOp::StoreEntry(..)` | `FlatOp::CreateEntry(..)` |
| `FlatOp::StoreRecord(..)` | `FlatOp::CreateRecord(..)` |
| `FlatOp::RegisterUpdate(..)` | `FlatOp::Update(..)` |
| `FlatOp::RegisterDelete(..)` | `FlatOp::Delete(OpDelete { action })` |
| `FlatOp::RegisterCreateLink { .. }` | `FlatOp::Link(OpLink::CreateLink { link_type, action })` |
| `FlatOp::RegisterDeleteLink { .. }` | `FlatOp::Link(OpLink::DeleteLink { link_type, action, original_action })` |
| `FlatOp::RegisterAgentActivity(..)` | `FlatOp::AgentActivity(..)` |
| `EntryCreationAction` | `TypedAction<EntryCreationData>` |

**Widening and narrowing.** Two directions, two different calls. Getting them the wrong way round is the most common 0.7 validation mistake.

**Widening is infallible.** In a `CreateEntry` or `UpdateEntry` arm you already hold a `TypedAction<CreateData>` or `TypedAction<UpdateData>`, and a validation function shared with the update path takes `TypedAction<EntryCreationData>`. The variant you matched already proves the shape, so this is a plain `From`:

```rust
let create_action: TypedAction<EntryCreationData> = action.into();
```

**Narrowing a freshly-fetched action is fallible.** When you pull an `Action` back out of `must_get_action` or `must_get_valid_record`, its shape is not statically known, so it has to be checked:

```rust
let original_action = TypedAction::<EntryCreationData>::try_from_action(
    must_get_action(action.data.original_action_address.clone())?
        .action()
        .to_owned(),
)?;
```

`try_from_action` returns `ExternResult`, so it drops straight into a `?`-chain. There is also a `TryFrom<Action>` impl that yields `WrongActionError` instead, but it forces a `map_err(|e| wasm_error!(...))` at every call site. Prefer `try_from_action`.

**Propagate the failure, never return `Invalid`.** Sys validation already guarantees that the original of an update is a `Create` or `Update`, and that a `DeleteLink` points at a `CreateLink`. A narrowing failure means that guarantee was violated, which is a fault in how the op reached your code, not bad data from its author. `ValidateCallbackResult::Invalid` blames the author. The `?` is correct.

The same applies in a `DeleteLink` arm, where you need the `CreateLink` it deletes:

```rust
let create_link = TypedAction::<CreateLinkData>::try_from_action(record.action().clone())?;
```

Earlier 0.7 release candidates had no `try_from_action`, so generated code hand-rolled this as a `match &record.action().data { ActionData::CreateLink(..) => TypedAction { header, data }, _ => Invalid }`. If you inherit that shape from an rc-era scaffold, replace it: it is longer, and its fallback wrongly returns `Invalid`.

**Link validation signatures collapsed.** Base address, target address and tag are all reachable through the action, so they are no longer separate arguments:

```rust
pub fn validate_create_link_my_entry_updates(
    action: TypedAction<CreateLinkData>,
) -> ExternResult<ValidateCallbackResult> {
    let action_hash = action
        .data
        .target_address
        .into_action_hash()
        .ok_or(wasm_error!(WasmErrorInner::Guest(
            "No action hash associated with link".to_string()
        )))?;
    let _record = must_get_valid_record(action_hash)?;
    Ok(ValidateCallbackResult::Valid)
}
```

A `DeleteLink` action records only the link's base address and the hash of the `CreateLink` it deletes, so target address and tag are not on it. Under `FlatOp::Link` you do not have to chase that yourself: `OpLink` exposes `base_address()`, `target_address()` and `tag()` getters that read through to the `original_action`.

**Determinism rules for validation:**
- No `get()` or `get_links()`. Neither exists in `hdi` at all, so this is enforced by the crate rather than by discipline
- No `agent_info()` (can vary by context)
- No `sys_time()` comparisons against current time. Use the timestamp already on the action
- No `get_init_properties()`. Init properties are conductor-local and never reach the DHT, so validation cannot see them. See `progenitor.md`
- **DHT reads are allowed, through the `must_get_*` family only:** `must_get_entry`, `must_get_action`, `must_get_valid_record`, `must_get_agent_activity`. These are deterministic in the sense that matters: an unresolvable dependency makes the callback return early with `UnresolvedDependencies`, deferring the verdict rather than failing it, so every validator eventually agrees. The HDI describes them as "available in contexts such as validation where both determinism and network access is desirable"
- Everything else must come from the op itself and its embedded data

See `error-handling.md` for `wasm_error!` and `WasmErrorInner` patterns, and `testing.md` for exercising validation in Sweettest.

---

## Path Anchors

```rust
// Global discovery anchor
let path = Path::from("entries.active");
let path_hash = path.path_entry_hash()?;

// Hierarchical paths
let category_path = Path::from(format!("entries.{}.active", category));

// Ensure path exists (creates the path entry if not present)
path.ensure()?;
```

---

## `get_details()` + `Details::Record` Deserialization

```rust
pub fn get_original_record(hash: ActionHash) -> ExternResult<Option<Record>> {
    let Some(details) = get_details(hash, GetOptions::default())? else {
        return Ok(None);
    };
    match details {
        Details::Record(d) => Ok(Some(d.record)),
        _ => Err(wasm_error!(WasmErrorInner::Guest("Expected record".into()))),
    }
}
```

**In `post_commit` — extracting app entry type from a committed action:**

```rust
let (zome_index, entry_index) = match record.action().entry_type() {
    Some(EntryType::App(AppEntryDef { zome_index, entry_index, .. })) => (zome_index, entry_index),
    _ => return Ok(None),
};
EntryTypes::deserialize_from_type(*zome_index, *entry_index, entry)
```

---

## Update Chain Utilities

### `find_original_action_hash()` — traverse backward to the Create action

Given any action hash in an update chain, loop back to the original Create:

```rust
pub fn find_original_action_hash(action_hash: ActionHash) -> ExternResult<OriginalActionHash> {
    let mut current_hash = action_hash;
    loop {
        let record = get(current_hash.clone(), GetOptions::default())?
            .ok_or(wasm_error!(WasmErrorInner::Guest("Record not found".into())))?;
        match record.action().clone() {
            Action::Create(_) => return Ok(OriginalActionHash(current_hash)),
            Action::Update(u) => { current_hash = u.original_action_address; }
            _ => return Err(wasm_error!(WasmErrorInner::Guest("Unexpected action type".into()))),
        }
    }
}
```

### `get_all_revisions_for_entry()` — original + all updates chronologically

Use `LinkQuery::new()` + `GetStrategy::Local` over the `{Entry}Updates` link type, prepend the original record. Returns all versions in order from oldest to newest.

---

## Path Status Hierarchies

For status-filtered global collections, use hierarchical path strings rather than a single path + runtime filtering:

```rust
const PENDING_PATH: &str = "entries.status.pending";
const APPROVED_PATH: &str = "entries.status.approved";
const REJECTED_PATH: &str = "entries.status.rejected";

// On creation — add link to pending path:
let pending_hash = Path::from(PENDING_PATH).path_entry_hash()?;
create_link(pending_hash, entry_hash.clone(), LinkTypes::AllEntries, ())?;

// On approval — move from pending to approved:
let approved_hash = Path::from(APPROVED_PATH).path_entry_hash()?;
create_link(approved_hash, entry_hash, LinkTypes::AllEntries, ())?;
// (delete the pending link separately)
```

Enables `get_links` filtered by status without fetching all entries — queries only the relevant path.

---

## Type-Safe Hash Wrappers

Prevent passing wrong hash type to functions:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OriginalActionHash(pub ActionHash);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviousActionHash(pub ActionHash);

// Function signature is self-documenting and compile-time safe
pub fn update_my_entry(
    original: OriginalActionHash,
    previous: PreviousActionHash,
    entry: MyEntry,
) -> ExternResult<Record> { ... }
```
