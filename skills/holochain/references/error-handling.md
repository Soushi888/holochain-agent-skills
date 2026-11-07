# Holochain Error Handling

## The Pattern: thiserror + WasmError

Every domain should have a typed error enum in the `utils` (or domain-specific) crate using `thiserror`. This prevents stringly-typed errors and gives callsites exhaustive match coverage.

---

## Error Enum Definition (utils/src/errors.rs)

```rust
use hdk::prelude::*;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum MyDomainError {
    #[error("Entry not found: {0}")]
    NotFound(String),

    #[error("Agent is not authorized to perform this action")]
    NotAuthorized,

    #[error("Cannot update entry with status: {0}")]
    CannotUpdateArchived(String),

    #[error("Cannot delete entry with status: {0}")]
    CannotDeleteNonActive(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Cross-zome call failed: {0}")]
    CrossZomeCallFailed(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

// THE critical conversion — maps your typed error to WasmError
impl From<MyDomainError> for WasmError {
    fn from(err: MyDomainError) -> WasmError {
        wasm_error!(WasmErrorInner::Guest(err.to_string()))
    }
}
```

---

## ExternResult and the ? Operator

All public zome functions return `ExternResult<T>`. The `?` operator works throughout because:
1. `From<MyDomainError> for WasmError` is implemented (above)
2. `ExternResult<T>` is an alias for `Result<T, WasmError>`, so `?` converts `MyDomainError` through that `From` impl

```rust
pub fn update_my_entry(
    original_hash: ActionHash,
    previous_hash: ActionHash,
    entry: MyEntry,
) -> ExternResult<Record> {
    // ? works on both MyDomainError and other ExternResult operations
    let record = get(original_hash.clone(), GetOptions::default())?
        .ok_or(MyDomainError::NotFound(original_hash.to_string()))?;

    let agent = agent_info()?.agent_initial_pubkey;
    if record.action().author() != &agent {
        return Err(MyDomainError::NotAuthorized.into());
    }

    let updated = update_entry(previous_hash, &EntryTypes::MyEntry(entry))?;
    let result = get(updated, GetOptions::default())?
        .ok_or(MyDomainError::NotFound("Updated entry".into()))?;

    Ok(result)
}
```

---

## Ad-Hoc Errors (without thiserror)

For simple one-off error cases, use `wasm_error!` directly:

```rust
// Simple guest error — no dedicated type needed
return Err(wasm_error!(WasmErrorInner::Guest("Expected app entry type".into())));

// Wrapping serialization failures
let entry: MyEntry = record.entry()
    .to_app_option()
    .map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("Deserialization failed: {e}"))))?
    .ok_or(wasm_error!(WasmErrorInner::Guest("Entry is not MyEntry type".into())))?;
```

**When to use ad-hoc vs. typed:**
- Ad-hoc: one-off cases in coordinators, unlikely to be matched by callers
- Typed enum: domain errors that cross-zome callers need to inspect or that validators need

---

## Common Error Variants Checklist

When defining a domain error enum, cover these cases:

| Variant | When to use |
|---------|-------------|
| `NotFound(String)` | DHT get returns `None` after expected create |
| `NotAuthorized` | Author check fails — agent is not the entry creator |
| `CannotUpdateArchived(String)` | Status guard on update — entry is archived/deleted |
| `CannotDeleteNonActive(String)` | Status guard on delete |
| `SerializationError(String)` | `to_app_option()` or `decode()` failure |
| `CrossZomeCallFailed(String)` | `external_local_call` returns error variant |
| `InvalidInput(String)` | Validation-style check in coordinator (before HDK calls) |
| `EntryTypeMismatch` | Retrieved entry is wrong type |

---

## Validation Error Handling (Integrity)

Validation functions return `ValidateCallbackResult`, not `ExternResult`:

```rust
fn validate_create_my_entry(entry: MyEntry) -> ExternResult<ValidateCallbackResult> {
    if entry.title.trim().is_empty() {
        // Invalid — data is rejected, not a runtime error
        return Ok(ValidateCallbackResult::Invalid(
            "MyEntry title cannot be empty".into()
        ));
    }

    if entry.title.len() > 200 {
        return Ok(ValidateCallbackResult::Invalid(
            "MyEntry title exceeds 200 characters".into()
        ));
    }

    Ok(ValidateCallbackResult::Valid)
}
```

---

## Cargo.toml Setup for thiserror

In `utils/Cargo.toml`:
```toml
[dependencies]
hdk = { workspace = true }
thiserror = { workspace = true }
```

In workspace `Cargo.toml`:
```toml
[workspace.dependencies]
thiserror = "2"
```
