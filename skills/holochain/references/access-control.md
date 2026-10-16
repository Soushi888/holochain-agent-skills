# Holochain Access Control

## Why Capability Grants Exist

Holochain zome functions are not open by default. When agent A wants to call a zome function on agent B's cell (a "remote call"), B's cell must have an explicit **capability grant** authorizing that call. Without a grant, the call is rejected.

This applies to:
- `call_remote()` — calling a zome function on another agent's cell
- `send_remote_signal` → `recv_remote_signal` — the receiver needs a grant so the signal handler can be invoked

Calls from the **same hApp's UI** (same agent, same cell) do not need grants.

---

## Three `GrantConstraint` Tiers

A capability grant is a `CapGrant { tag, constraint, capability }`. The `constraint` says who may use the grant and the `capability` says what it lets them do. In Holochain 0.7.1 the zome-call constructor is `CapGrant::new_zome_call_grant(tag, constraint, functions)`. The 0.7.0 shape (`ZomeCallCapGrant { tag, access, functions }` with a `CapAccess` enum) no longer exists, see [0.7.0 to 0.7.1](#070-to-071).

### 1. `GrantConstraint::Unrestricted`: any agent may call

```rust
#[hdk_extern]
pub fn init(_: ()) -> ExternResult<InitCallbackResult> {
    let mut functions = HashSet::new();
    functions.insert((zome_info()?.name, "recv_remote_signal".into()));

    create_cap_grant(CapGrant::new_zome_call_grant(
        "open_to_all".into(),
        GrantConstraint::Unrestricted,
        GrantedFunctions::Listed(functions),
    ))?;

    Ok(InitCallbackResult::Pass)
}
```

Use when: the function should be callable by any agent (e.g., `recv_remote_signal`). The same grant compiles in `example-happ/dnas/forum/zomes/coordinator/posts/src/lib.rs`.

### 2. `GrantConstraint::Transferable { secret }`: any agent with the secret may call

```rust
let secret = generate_cap_secret()?;

create_cap_grant(CapGrant::new_zome_call_grant(
    "transferable_grant".into(),
    GrantConstraint::Transferable { secret },
    GrantedFunctions::Listed(functions),
))?;

// Share `secret` with the grantee out-of-band (e.g., via a private entry or direct message)
```

Use when: you want to delegate access to anyone who holds the secret, like a token.

### 3. `GrantConstraint::Assigned { secret, assignees }`: only specific agents with the secret

```rust
let secret = generate_cap_secret()?;
let mut assignees = BTreeSet::new();
assignees.insert(grantee_pubkey.clone());

create_cap_grant(CapGrant::new_zome_call_grant(
    "assigned_grant".into(),
    GrantConstraint::Assigned { secret, assignees },
    GrantedFunctions::Listed(functions),
))?;
```

Use when: access is explicitly scoped to one or more named agents.

### The `capability` half: zome calls versus direct signals

The constructor above fills `capability` with `Capability::ZomeCall(ZomeCallGrant { functions })`. The other variant is `Capability::DirectSignal`, built with `CapGrant::new_direct_signal_grant(tag, constraint)`. It authorises a peer to deliver a direct signal (`SendDirectSignal`) to this cell, and it carries no function list:

```rust
create_cap_grant(CapGrant::new_direct_signal_grant(
    "direct_signals".into(),
    GrantConstraint::Unrestricted,
))?;
```

A cell receives direct signals only if it holds an explicit `Capability::DirectSignal` grant, even for signals the authoring agent sends itself. A zome-call grant does not cover it. From outside the conductor, the admin API has `GrantDirectSignalCapability` (`admin.grantDirectSignalCapability` in `@holochain/client`), and `GrantZomeCallCapability` takes `{ cell_id, cap_grant: { tag, constraint, grant: { functions } } }`.

---

## Grant Lifecycle

```
Grantor side:                              Grantee side:
─────────────────────────────────          ──────────────────────────────────
1. generate_cap_secret()?              →   (receive secret out-of-band)
2. create_cap_grant(CapGrant::new_     →   3. create_cap_claim(CapClaim {
      zome_call_grant(tag, constraint,         tag, grantor, secret,
      functions))
                                            })?
                                       →   4. call_remote(
                                               grantor_pubkey,
                                               zome_name,
                                               fn_name,
                                               Some(secret),
                                               payload,
                                           )?
```

**Step-by-step:**
1. Grantor generates a secret: `let secret = generate_cap_secret()?;`
2. Grantor creates grant on their source chain (stored locally, not DHT)
3. Grantee receives the secret via private entry, signal, or other channel
4. Grantee stores it as a cap claim: `create_cap_claim(CapClaim { tag, grantor, secret })?;`
5. Grantee calls with secret: `call_remote(grantor, zome, fn_name, Some(secret), payload)?;`

---

## Decision Table

| Scenario | Pattern |
|----------|---------|
| `recv_remote_signal` open to all agents | `GrantConstraint::Unrestricted` in `init()` |
| Delegate a specific function to one agent | `GrantConstraint::Assigned` + share secret via private entry |
| UI calling own zome (same agent, same cell) | No grant needed |
| Admin-only zome function | Progenitor check in coordinator (see `architecture.md` § DNA Properties) |
| Public API any agent can call | `GrantConstraint::Unrestricted` in `init()` for that function |

---

## Notes

- Cap grants are stored on the **grantor's source chain** — they are private, not shared to the DHT
- Cap claims are stored on the **grantee's source chain**
- Revoking a grant: use `delete_cap_grant(grant_action_hash)?;`
- `GrantedFunctions::All` grants access to ALL functions in the zome — use with extreme caution

**Reference:** [developer.holochain.org/build/capabilities/](https://developer.holochain.org/build/capabilities/)

---

## 0.7.0 to 0.7.1

0.7.1 renamed the capability types and moved the function list inside a `capability` field. These 0.7.0 names are gone:

| 0.7.0 | 0.7.1 |
|---|---|
| `ZomeCallCapGrant { tag, access, functions }` | `CapGrant { tag, constraint, capability }`, built with `CapGrant::new_zome_call_grant(tag, constraint, functions)` |
| `CapAccess` (`Unrestricted`, `Transferable`, `Assigned`) | `GrantConstraint` (same three variants) |
| `CapGrant` (enum `ChainAuthor` / `RemoteAgent`) | `CapAccess` |
| `DesensitizedZomeCallCapGrant` | `DesensitizedCapGrant` |
| `CapAccessInfo` | `GrantConstraintInfo` |

Grants already committed to a chain under 0.7.0 must be re-issued: create them again with the new shape. The 0.7.1 changelog says only that the old grants cannot be read by 0.7.1; whether `delete_cap_grant` can still remove them is unverified. `CapGrantEntry` is an alias of `CapGrant`, so `create_cap_grant` takes either spelling.
