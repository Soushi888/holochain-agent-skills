# Workflow: Design Access Control

Use this workflow when you need to design who can call what zome functions, how remote signals are authorized, or how admin operations are gated.

## Step 1: Identify Callers

Map every zome function to its caller type:

| Function | Caller | Notes |
|----------|--------|-------|
| `create_post` | UI (same agent) | No grant needed |
| `recv_remote_signal` | Any remote agent | Needs Unrestricted grant |
| `update_admin_status` | Admin agent only | Progenitor check |
| `get_shared_resource` | Specific partner agent | Assigned grant |

Questions to answer:
- Is the caller the same agent as the cell owner? (No grant needed)
- Can any agent call this function? (Unrestricted)
- Can only a specific agent call this? (Assigned)
- Can anyone with a token call this? (Transferable)

## Step 2: Choose Pattern per Function

| Caller scope | Pattern | Where |
|--------------|---------|-------|
| Same agent (UI) | No grant | N/A |
| Any agent | `GrantConstraint::Unrestricted` in `init()` | `init()` callback |
| Named agent(s) | `GrantConstraint::Assigned` | On-demand grant creation |
| Token holder | `GrantConstraint::Transferable` | On-demand grant creation |
| Admin-only | Progenitor check in coordinator | Coordinator function body |
| Receive direct signals (`SendDirectSignal`) | `CapGrant::new_direct_signal_grant` with a `GrantConstraint` | `init()` callback, or `GrantDirectSignalCapability` from the admin API |

## Step 3: Design Cap Grants

For each function requiring a grant:

```
Function: recv_remote_signal
Grantor: self (init)
Grantee: all
Constraint: Unrestricted
Grant timing: init() on first run
```

```
Function: approve_member
Grantor: progenitor cell
Grantee: specific delegate agent
Constraint: Assigned { secret, assignees: [delegate_pubkey] }
Grant timing: progenitor creates grant on delegation
Secret distribution: progenitor sends via private entry to delegate
```

## Step 4: Write the `init()` Function

For every Unrestricted grant, add to `init()`:

```rust
#[hdk_extern]
pub fn init(_: ()) -> ExternResult<InitCallbackResult> {
    let mut functions = HashSet::new();

    // Add each function that needs an unrestricted grant:
    functions.insert((zome_info()?.name, "recv_remote_signal".into()));
    // functions.insert((zome_info()?.name, "another_open_fn".into()));

    create_cap_grant(CapGrant::new_zome_call_grant(
        "open_functions".into(),
        GrantConstraint::Unrestricted,
        GrantedFunctions::Listed(functions),
    ))?;

    Ok(InitCallbackResult::Pass)
}
```

## Step 5: Write Validation Constraints

For admin operations, the coordinator check is the enforcement point:

```rust
pub fn admin_only_function(input: AdminInput) -> ExternResult<ActionHash> {
    // Always check first — before any state mutation
    if !check_if_progenitor()? {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "This function is restricted to the network progenitor.".into()
        )));
    }

    // Proceed with admin logic
}
```

For update/delete operations, also validate in the **integrity zome** using `must_get_action()`:

```rust
// In integrity validate() for update ops:
let original = must_get_action(original_action_hash)?;
if action.author() != original.action().author() {
    return Ok(ValidateCallbackResult::Invalid("Not the original author".into()));
}
```

## Reference

- Cap grant patterns: `../access-control.md`
- Progenitor setup: `../architecture.md` § DNA Properties
- `must_get_*` authorship checks: `../patterns.md` § must_get
