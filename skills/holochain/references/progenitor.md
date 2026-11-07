# Progenitor Pattern

The progenitor is a single agent whose public key is burned into the DNA at install time via DNA `modifiers.properties`. Every peer in the network can read the progenitor's identity deterministically, making admin authority immutable and cryptographically verifiable without a centralized registry.

> **Do not use `init_properties` for this.** Holochain 0.7 added an `InitProperties` type set on `RoleSettings::Provisioned` and read with `get_init_properties()`. It looks like a natural fit and is not one. Those bytes are **conductor-local**: opaque to the conductor, never written to the DHT, readable only from the `init` callback, and cleared once init succeeds or the app is uninstalled.
>
> The progenitor pattern needs the opposite properties. Integrity validation runs on **every peer**, deterministically, against data that must be identical network-wide. A validating peer cannot see another agent's init properties, so a check written against them would pass for the author and fail, or fail to be checkable, for everyone else.
>
> `modifiers.properties` is part of the DNA hash and therefore agreed by every member of the network. That is what makes it safe to validate against. Init properties are for seeding a freshly migrated chain with per-install state; see `migration.md`.

Two reference implementations inform this page (read from `happenings-community/requests-and-offers` at `dev` b7acda3 and `lightningrodlabs/moss` at `main` 83e3904; check them again before relying on a detail):
- **Requests & Offers**: coordinator-only enforcement (`zomes/integrity/administration/src/lib.rs` deliberately does not check the progenitor in validation), auto-registration inside `create_user` (`zomes/coordinator/users_organizations/src/user.rs`)
- **Moss**: opt-in at group creation, integrity-level enforcement in `validate()` (`dnas/group/zomes/integrity/group/src/steward_permission.rs`), progenitor key transported via invite-link

---

## 1. DnaProperties struct

Place this in a shared `utils` crate consumed by all integrity and coordinator zomes. The `SerializedBytes` derive is required — Holochain serializes YAML properties to MessagePack at install time, and `try_into()` decodes it:

```rust
// dnas/my_dna/utils/src/dna_properties.rs
use hdi::prelude::*;

#[derive(Serialize, Deserialize, SerializedBytes, Debug, Clone)]
pub struct DnaProperties {
    pub progenitor_pubkey: Option<String>,  // null = dev / bootstrap mode
}

impl DnaProperties {
    pub fn get() -> ExternResult<Self> {
        dna_info()?
            .modifiers
            .properties
            .try_into()
            .map_err(|e| wasm_error!(WasmErrorInner::Guest(
                format!("Failed to deserialize DnaProperties: {e}")
            )))
    }

    pub fn get_progenitor_pubkey() -> ExternResult<Option<AgentPubKey>> {
        match Self::get()?.progenitor_pubkey {
            None => Ok(None),
            Some(s) => AgentPubKey::try_from(s).map(Some).map_err(|e| {
                wasm_error!(WasmErrorInner::Guest(
                    format!("Invalid progenitor pubkey in DNA properties: {e}")
                ))
            }),
        }
    }
}
```

```rust
// dnas/my_dna/utils/src/lib.rs
pub fn check_if_progenitor() -> ExternResult<bool> {
    match DnaProperties::get_progenitor_pubkey()? {
        None => Ok(false),   // no progenitor configured → bootstrap mode
        Some(progenitor) => Ok(progenitor == agent_info()?.agent_initial_pubkey),
    }
}
```

`check_if_progenitor()` returns `false` when no progenitor is configured. Bootstrap logic (who becomes the first admin in that case) lives in your application code — see section 4.

> **Moss variant:** Moss uses `{ progenitor: AgentPubKeyB64 | null }` (field name `progenitor`, not `progenitor_pubkey`). Its Rust struct is `GroupDnaProperties { progenitor: Option<AgentPubKeyB64> }`, not `Option<String>`, so serde decodes the key and `AgentPubKey::from(b64)` converts it without a fallible parse; the `SerializedBytes` deserialization pattern is the same.

---

## 2. Coordinator guard

Expose `is_progenitor` as an `hdk_extern` for the UI, and guard admin functions with `check_if_progenitor()`:

```rust
#[hdk_extern]
pub fn is_progenitor(_: ()) -> ExternResult<bool> {
    check_if_progenitor()
}

#[hdk_extern]
pub fn add_administrator(input: EntityAgent) -> ExternResult<bool> {
    let is_prog = check_if_progenitor()?;
    let is_admin = check_if_agent_is_administrator(agent_info()?.agent_initial_pubkey)?;
    let progenitor_configured = DnaProperties::get_progenitor_pubkey()?.is_some();
    let is_bootstrap = !progenitor_configured
        && get_all_administrators_links(input.entity.clone())?.is_empty();

    if !is_prog && !is_admin && !is_bootstrap {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Only the progenitor or an existing administrator can add administrators".into()
        )));
    }
    register_administrator(input)?;
    Ok(true)
}
```

The `is_bootstrap` branch handles dev mode: when no progenitor is configured and no admins exist yet, the first caller of `add_administrator` is allowed through.

---

## 3. Integrity enforcement (Moss pattern — optional hardening)

R&O enforces the progenitor check only in the coordinator. Moss additionally enforces it in `validate()` so that a malicious peer cannot bypass the coordinator by calling zome functions directly:

```rust
// In integrity validate() — dna_info() is safe here: deterministic, reads own DNA metadata
fn validate_create_admin_entry(
    action: TypedAction<CreateData>,   // from FlatOp::CreateEntry(OpEntry::CreateEntry { action, .. })
    _entry: AdminEntry,
) -> ExternResult<ValidateCallbackResult> {
    match DnaProperties::get()?.progenitor_pubkey {
        None => Ok(ValidateCallbackResult::Valid),  // bootstrap mode: no restriction
        Some(progenitor_str) => {
            let progenitor = AgentPubKey::try_from(progenitor_str)
                .map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("{e}"))))?;
            if action.author() != &progenitor {
                return Ok(ValidateCallbackResult::Invalid(
                    "Only the progenitor can author this entry".into(),
                ));
            }
            Ok(ValidateCallbackResult::Valid)
        }
    }
}
```

**Rules for validation:**
- `dna_info()` is safe — reads the DNA's own metadata, fully deterministic
- Use `action.author()`: you are validating someone else's action, not checking yourself
- `get()` (DHT read) does not exist in `hdi`; besides the op itself, validation may only read through the deterministic `must_get_*` family (`must_get_entry`, `must_get_action`, `must_get_valid_record`, `must_get_agent_activity`)

**Tradeoff:** Coordinator-only (R&O) is simpler and sufficient for most apps. Integrity enforcement (Moss) is defense-in-depth for higher-security entries where you cannot trust peers to follow coordinator rules.

---

## 4. Bootstrap and auto-registration

`init()` does not run at install time: the conductor runs it lazily, once per cell, before the first zome call into that cell (`Cell::check_or_run_zome_init`, `holochain-0.7.1/src/conductor/cell.rs:781`). Nothing guarantees that the agent has synced any DHT state by then. It is NOT the place to auto-register the progenitor. Instead, put auto-registration inside your first entity creation function (e.g. `create_user`, `create_profile`):

```rust
// In coordinator create_user / create_profile — after creating the entry:
let is_prog = check_if_progenitor()?;
let progenitor_configured = DnaProperties::get_progenitor_pubkey()?.is_some();

let should_auto_register = if progenitor_configured {
    is_prog  // production: only the progenitor auto-gets admin
} else {
    // dev / bootstrap: first agent whose profile creation finds no existing admins
    // external_local_call is an app helper over hdk's call(), not part of the HDK:
    // define it as in patterns.md § Cross-Zome Calls (argument order: zome, then function)
    let existing_admins: Vec<Link> = external_local_call(
        "administration",
        "get_all_administrators_links",
        "network".to_string(),
    )?;
    existing_admins.is_empty()
};

if should_auto_register {
    let _: bool = external_local_call(
        "administration",
        "add_administrator",
        EntityActionHashAgents {
            entity: "network".to_string(),
            entity_original_action_hash: OriginalActionHash(profile_hash.clone()),
            agent_pubkeys: vec![agent_info()?.agent_initial_pubkey],
        },
    )?;
}
```

`init()` itself should only set up the unrestricted signal cap grant and return `Pass`:

```rust
#[hdk_extern]
pub fn init(_: ()) -> ExternResult<InitCallbackResult> {
    let mut functions = HashSet::new();
    functions.insert((zome_info()?.name, "recv_remote_signal".into()));
    create_cap_grant(CapGrant::new_zome_call_grant(
        "recv_remote_signal".into(),
        GrantConstraint::Unrestricted,
        GrantedFunctions::Listed(functions),
    ))?;
    Ok(InitCallbackResult::Pass)
}
```

---

## 5. Setting properties at deploy time

### Dev / CI — `dna.yaml`

Leave null for local development; the first-user bootstrap handles the admin seed:

```yaml
# workdir/dna.yaml
integrity:
  properties:
    progenitor_pubkey: null    # bootstrap mode; set a key for production tests
  zomes:
    - name: my_domain_integrity
      path: "./zomes/integrity/my_domain_integrity.wasm"
```

Get an agent pubkey from a running conductor (`hc sandbox call` is gone in 0.7; admin calls live under `hc client call`, and `hc sandbox admin-ports` prints the sandbox's admin port):

```bash
hc client call --port $ADMIN_PORT list-apps \
  | jq -r '.[] | select(.installed_app_id == "my-app") | .agent_pub_key'
```

### Sweettest

```rust
let props = DnaProperties { progenitor_pubkey: Some(alice_pubkey.to_string()) };
let props_bytes = SerializedBytes::try_from(props).unwrap();
let dna = SweetDnaFile::from_bundle_with_overrides(
    Path::new(DNA_PATH),
    DnaModifiersOpt::default().with_properties(props_bytes),
).await?;
```

### Kangaroo / custom Electron

Make the installing agent the progenitor at runtime:

```typescript
import { encode } from "@msgpack/msgpack";
import { encodeHashToBase64 } from "@holochain/client";

const agentPubKey = await adminWs.generateAgentPubKey();

await adminWs.installApp({
  installed_app_id: "my-app",
  agent_key: agentPubKey,
  // `source` is a tagged union: { type: "path", value } or { type: "bytes", value }.
  source: { type: "path", value: "./workdir/my-app.happ" },
  roles_settings: {
    my_dna: {
      type: "provisioned",
      value: {
        modifiers: {
          properties: encode({ progenitor_pubkey: encodeHashToBase64(agentPubKey) }),
        },
      },
    },
  },
});
```

Note `value` wraps `modifiers`: this is required by the client's `RoleSettings` type. See `client.md` for the full admin surface.

### Moss (group DNA)

Moss treats progenitor as an opt-in per-group choice via a `withProgenitor` boolean in the group creation UI. Joiners receive the creator's key via invite-link and install with it verbatim — they never substitute their own key, so all peers derive the same DNA hash:

```typescript
// Creator (src/main/index.ts in lightningrodlabs/moss)
const properties = withProgenitor
  ? { progenitor: encodeHashToBase64(agentPubKey) }
  : { progenitor: null };

await adminWebsocket.installApp({
  ...
  roles_settings: {
    group: {
      type: "provisioned",
      value: { modifiers: { properties } },
    },
  },
});

// Joiner: properties come verbatim from the invite-link (&progenitor=uhCAk... or "null")
// Joiners NEVER substitute their own key — DNA hashes must converge across all peers
```

**Moss-specific conventions:**
- Field name is `progenitor` (not `progenitor_pubkey`)
- Progenitor injection is only for the `group` DNA — Moss applets must inject their own if needed
- The invite-link carries `networkSeed` + `progenitor` together; validation confirms the key starts with `uhCAk` and decodes to 39 bytes

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Registering progenitor as admin inside `init()` | Put auto-registration in your first entity creation fn (e.g. `create_user`) |
| Coordinator-only guard for high-security entries | Add integrity enforcement (Moss pattern) if peers must not bypass the coordinator |
| `agent_info()?.agent_initial_pubkey` used in `validate()` | Use `action.author()`: you are checking the action author, not yourself |
| `get()` (DHT read) inside `validate()` | Not available in `hdi`: use `dna_info()`, `zome_info()`, the op itself, and the deterministic `must_get_*` family |
| Missing `SerializedBytes` derive on `DnaProperties` | The `.try_into()` deserialization will fail at runtime without it |
| Missing `value` wrapper in `roles_settings` TypeScript | `{ type: "provisioned", value: { modifiers: { ... } } }` — `value` is required |
| Joiner substituting their own key as progenitor | Copy the creator's key verbatim (invite-link / config); joiners must match DNA hash |
| Hardcoding a pubkey in source | Always read from `dna_info().modifiers.properties` |
| Progenitor key rotation | The pattern does not support it — use role-based access (`access-control.md`) for delegatable authority |

---

**Cross-ref:** `access-control.md` — delegating admin authority beyond the progenitor | `workflows/design-access-control.md` — choosing the right access model for your app
