# ReviewZome Workflow

Review existing zome code against Holochain best practices, HDK 0.7 patterns, and the project's established conventions. Run proactively before implementing any zome changes, or explicitly when asked to audit code.

---

## Step 1 — Load context files

Always load both:
- `../architecture.md` — coordinator/integrity split, DNA roles, cross-DNA patterns
- `../patterns.md` — HDK 0.7 API, entry types, link types, CRUD, validation rules

---

## Step 2 — Identify files in scope

If invoked proactively (PLAN phase), scope = files identified in the task plan.
If invoked explicitly, scope = files provided or the current PR diff.

For each file determine: integrity zome, coordinator zome, shared types, tests.

---

## Step 3 — Run the checklist

Work through each category. Flag every issue with severity: **BLOCK** (must fix before merge), **WARN** (should fix), **NOTE** (informational).

### Entry Schema
- [ ] New fields on existing entry structs have `#[serde(default)]` — required for schema evolution, prevents deserialization failures on existing entries
- [ ] No `agent_pub_key`, `created_at`, or `updated_at` fields on entry structs (those are in the action header — access via `record.action().author()` / `.timestamp()`)
- [ ] Status enums use a dedicated enum type, not a raw `String`

### Integrity / Validation
- [ ] `validate()` uses `op.flattened::<EntryTypes, LinkTypes>()?` not `op.to_type()`, which was removed in hdi 0.5 and no longer compiles
- [ ] No non-deterministic reads inside `validate()` — no `get()`, `get_links()`, `agent_info()`, `sys_time()`. `must_get_*` is allowed and is the only sanctioned way to reach DHT state
- [ ] New entry types are registered in the `#[hdk_entry_types]` enum
- [ ] New link types are registered in the `#[hdk_link_types]` enum

### Coordinator: HDK 0.7 API
- [ ] `delete_link(hash, GetOptions::default())`, not the older single-argument form
- [ ] `LinkQuery::try_new()` used for link queries (not old `GetLinksInputBuilder` unless specifically needed)
- [ ] `GetStrategy::Local` for own-data queries; `GetStrategy::Network` for DHT queries
- [ ] `must_get_valid_record()` used for fail-fast gets in update/delete authorship checks

### Cross-Zome / Cross-DNA Calls
- [ ] `CallTargetCell::OtherRole("hrea")` role name matches `workdir/happ.yaml` exactly
- [ ] `ZomeName(...)` matches the coordinator zome's `name` in `dna.yaml` (the manifest name is the zome name; the crate name in `Cargo.toml` plays no part)
- [ ] `ZomeCallResponse` match is exhaustive (5 variants in 0.7: `Ok`, `Unauthorized`, `AuthenticationFailed`, `NetworkError`, `CountersigningSession`. `Unauthorized` carries no `AgentPubKey` in 0.7)
- [ ] No direct Cargo dependency on the remote DNA's crate — use local mirror structs for serialization
- [ ] If using shared utility crates: verify intra-DNA and cross-DNA call helpers match the project's established patterns (e.g., wrapper functions in a `utils` crate rather than raw `call()` everywhere)

### Error Handling
- [ ] All fallible operations use `ExternResult<T>`; no `.unwrap()` or `.expect()` in zome functions
- [ ] `wasm_error!(WasmErrorInner::Guest(...))` used for domain errors (not `WasmErrorInner::Host`)
- [ ] Custom error types implement `From<MyError> for WasmError`

### Tests (Sweettest)
- [ ] `await_consistency([&cell_a, &cell_b]).await` called before any cross-agent read
- [ ] Tests use `#[tokio::test(flavor = "multi_thread")]` and `holochain` dev-dependency with `test_utils` feature
- [ ] New `#[hdk_extern]` functions have at least one Sweettest test

---

## Step 4 — Output findings

Group by severity:

```
## ReviewZome: {scope}

### BLOCK (must fix before merge)
- [ ] {file}:{issue} — {explanation}

### WARN (should fix)
- [ ] {file}:{issue} — {explanation}

### NOTE (informational)
- {file}:{observation}

### PASS
- {category}: no issues found
```

If no issues: "All checks pass. Ready to implement / merge."

---

## Step 5 — Offer to fix

If BLOCK items were found: "I can fix these now. Say 'fix' to proceed."
If only WARN/NOTE: "No blockers found. Suggestions above are optional improvements."
