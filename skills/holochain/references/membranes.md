# Membranes: Gating Who Can Join a Network

A membrane is the check that runs when an agent joins a DNA's network, before that agent can write anything. It is the only mechanism Holochain gives you for "not everyone may participate", and it is enforced by validation like everything else.

Types read from `holochain_integrity_types 0.7.1` (`src/genesis.rs`, `src/action.rs`), `hdi 0.8.1` (`src/map_extern.rs`, `src/flat_op/flat_op_record.rs`), `hdk_derive 0.7.1`, and the published `@holochain/client 0.21.1` type declarations.

## The three places a membrane is enforced

| Place | Runs on | Can it see the network? | Blocks what |
|---|---|---|---|
| `genesis_self_check` callback | The joining agent's own machine, before joining | No. Deterministic, local only | A bad proof, early, with a clear error |
| Validation of the `AgentValidationPkg` op | Every validating authority | No. Same determinism rules as all validation | The join, for real |
| Conductor install flow (`membrane_proof` / `provideMemproofs`) | The installer | Yes, it is ordinary application code | Nothing. It supplies the proof |

Only the second one actually enforces anything against a hostile agent. The self-check is a courtesy to honest agents, and the install flow is plumbing. Design accordingly.

## What a membrane proof is

```rust
pub type MembraneProof = std::sync::Arc<SerializedBytes>;
```

Arbitrary bytes, chosen by you, carried in the second record of every agent's source chain:

```rust
/// Per-variant data for [`ActionType::AgentValidationPkg`].
pub struct AgentValidationPkgData {
    /// Optional membrane proof provided when joining the network.
    pub membrane_proof: Option<MembraneProof>,
}
```

`Option`, so "no membrane" is the default and a DNA that ignores membrane proofs is the normal case.

On the TypeScript side it is `Uint8Array`, keyed by role name:

```typescript
export type MembraneProof = Uint8Array;
export type MemproofMap = { [key: RoleName]: MembraneProof };
```

## `genesis_self_check`

The proof format is yours. This example uses an invite signed by the progenitor, which is the common shape, and it is written out in full because the signature check is the part you cannot derive from the type signatures.

```rust
use hdi::prelude::*;

/// The membrane proof payload. Yours to define; nothing in Holochain knows this type.
/// `SerializedBytes` is what lets it round-trip through `MembraneProof`.
#[derive(Serialize, Deserialize, Debug, SerializedBytes)]
pub struct InviteCode {
    /// The agent this invite was issued to. Must match the joining key.
    pub issued_to: AgentPubKey,
    /// The issuer's signature over `issued_to`.
    pub signature: Signature,
}

/// DNA properties carrying the key allowed to issue invites.
/// Same mechanism as `progenitor.md`; see there for deploy-time injection.
#[derive(Serialize, Deserialize, Debug, SerializedBytes)]
pub struct DnaProperties {
    pub progenitor_pubkey: Option<String>,
}

#[hdk_extern]
pub fn genesis_self_check(data: GenesisSelfCheckData) -> ExternResult<ValidateCallbackResult> {
    let Some(proof) = data.membrane_proof else {
        return Ok(ValidateCallbackResult::Invalid(
            "this network requires an invite code".into(),
        ));
    };

    let invite: InviteCode = SerializedBytes::from(proof.as_ref().clone())
        .try_into()
        .map_err(|e| wasm_error!(WasmErrorInner::Guest(
            format!("membrane proof is not an InviteCode: {e:?}")
        )))?;

    // The invite must name the agent presenting it, or it is someone else's.
    if invite.issued_to != data.agent_key {
        return Ok(ValidateCallbackResult::Invalid(
            "invite was issued to a different agent".into(),
        ));
    }

    // GenesisSelfCheckDataV2 drops dna_info, so read it here.
    let props: DnaProperties = dna_info()?
        .modifiers
        .properties
        .try_into()
        .map_err(|e| wasm_error!(WasmErrorInner::Guest(
            format!("failed to deserialize DnaProperties: {e:?}")
        )))?;

    let Some(issuer_b64) = props.progenitor_pubkey else {
        // No issuer configured: bootstrap or dev mode, nothing to check against.
        return Ok(ValidateCallbackResult::Valid);
    };
    let issuer = AgentPubKey::try_from(issuer_b64)
        .map_err(|e| wasm_error!(WasmErrorInner::Guest(format!("bad progenitor key: {e:?}"))))?;

    // Signature verification is deterministic, so it is legal here and in validate().
    if !verify_signature(issuer, invite.signature.clone(), invite.issued_to.clone())? {
        return Ok(ValidateCallbackResult::Invalid(
            "invite signature does not verify against the issuer".into(),
        ));
    }

    Ok(ValidateCallbackResult::Valid)
}
```

Put this rule in a function both `genesis_self_check` and `validate_agent_joining` call, rather than writing it twice. The two callbacks receive the same two inputs, an `AgentPubKey` and an `Option<MembraneProof>`, precisely so the rule can be shared.

`verify_signature(key, signature, data)` serializes `data` canonically before verifying, so the issuer must have signed the `AgentPubKey` itself, not its bytes. Use `verify_signature_raw` if you signed raw bytes. See `cryptography.md`.

Three things worth knowing.

**The data struct is deliberately small.** The current version is V2, and it dropped the `dna_info` field the V1 version carried:

```rust
/// DnaInfo can be read with a call to `dna_info` within the self check
/// callback, it is elided here to minimise/stabilise the callback signature.
pub struct GenesisSelfCheckDataV2 {
    pub membrane_proof: Option<MembraneProof>,
    pub agent_key: AgentPubKey,
}
```

`GenesisSelfCheckData` is a type alias for V2. Call `dna_info()` inside the callback when you need DNA properties, which is the usual way to reach a progenitor key or a network policy. See `progenitor.md`.

**The extern name on the wire is `genesis_self_check_2`.** `hdi`'s `map_extern!` rewrites `genesis_self_check` to `genesis_self_check_2` for you. You write the plain name; do not hand-roll the mangled one.

**The return type is checked at compile time.** `hdk_derive 0.7.1` treats `genesis_self_check` exactly like `validate`: it must return `ExternResult<ValidateCallbackResult>`, or `ValidateCallbackResult` when marked `#[hdk_extern(infallible)]`. Any other return type aborts the macro expansion with an error naming the required type.

## Enforcing it in validation

The self-check runs on the joiner's own machine, so a modified conductor skips it. The check that binds runs in `validate()`, on other people's machines.

There are **two** places to put it, and a scaffolded project already has one of them wired.

### The generated hook, which you probably already have

`hc scaffold` emits a `validate_agent_joining` stub and calls it from the agent-activity arm. Look before you write a new one:

```rust
// Generated by hc scaffold, returning Valid until you fill it in.
pub fn validate_agent_joining(
    _agent_pub_key: AgentPubKey,
    _membrane_proof: &Option<MembraneProof>,
) -> ExternResult<ValidateCallbackResult> {
    Ok(ValidateCallbackResult::Valid)
}
```

and, inside `validate()`:

```rust
FlatOp::AgentActivity(OpActivity::CreateAgent { agent, action }) => {
    let prev = action
        .prev_action()
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("expected a prior action".into())))?
        .clone();
    let previous_action = must_get_action(prev)?;
    match &previous_action.action().data {
        ActionData::AgentValidationPkg(AgentValidationPkgData { membrane_proof, .. }) => {
            validate_agent_joining(agent, membrane_proof)
        }
        _ => Ok(ValidateCallbackResult::Invalid(
            "The previous action for a `CreateAgent` action must be an `AgentValidationPkg`".to_string(),
        )),
    }
}
```

This hangs the check on `CreateAgent`, the record that actually adds the agent key, and walks **backwards** one action with `must_get_action` to reach the proof. On a scaffolded project, filling in `validate_agent_joining` is the whole job.

### The direct hook

The `AgentValidationPkg` record itself carries the proof with no back-reference:

```rust
FlatOp::CreateRecord(OpRecord::AgentValidationPkg { membrane_proof, action }) => {
    validate_membrane(membrane_proof, action.author())
}
```

```rust
AgentValidationPkg {
    /// The membrane proof proving that the agent is allowed to participate in this DNA.
    membrane_proof: Option<MembraneProof>,
    action: TypedAction<AgentValidationPkgData>,
}
```

`TypedAction<D>` is declared at `hdi-0.8.1/src/flat_op/typed_action.rs:16` as
`{ header: ActionHeader, data: D }`, and re-exported by `hdi::flat_op` and so by the prelude. It is
`hdi`'s own type, not one borrowed from `holochain_integrity_types`. Four accessors read the header
directly: `author()`, `timestamp()`, `action_seq()` and `prev_action()`, so `action.author()` above
is `&AgentPubKey` and needs no unwrapping. `TypedAction<D>` also derefs to `D`, so the per-variant
fields are reachable without going through `.data`. The `AgentValidationPkg` variant itself is at
`hdi-0.8.1/src/flat_op/flat_op_record.rs:149`.

### Which to use

They are validated by **different authorities**, which is the whole difference:

| | Runs on | Reaching the proof |
|---|---|---|
| `AgentActivity(OpActivity::CreateAgent)` | The agent-activity authority for the joining agent | One `must_get_action` back to the previous action |
| `CreateRecord(OpRecord::AgentValidationPkg)` | The record authority for the validation-package action | Handed to you directly |

Default to the generated one. It is what the scaffolder wires, it is where reviewers will look, and the agent-activity authority is the one already tracking that agent's chain. Reach for the direct hook when you want the check to also run on the record authority, and put the shared rule in one function called from both rather than writing it twice.

**Do not fill in the direct hook while leaving `validate_agent_joining` returning `Valid`.** That reads like a membrane and is one enforcement point short of where a reviewer will look for it.

### "There *is* access to network calls": what the generated comment means

The scaffolder puts this directly above the stub, and read alone it sounds like validation can do anything:

```rust
// Validation the network performs when you try to join, you can't perform this
// validation yourself as you are not a member yet.
// There *is* access to network calls in this function
```

It is true, and it does not mean what it looks like. The contrast it is drawing is with `genesis_self_check`, which runs before the agent has joined and where nothing can be fetched, not with determinism.

The precise fact, checkable in one command: **`hdi 0.8.1` exports no `get()` and no `get_links()` at all.** The entire network surface available to an integrity crate is the `must_get_*` family: `must_get_entry`, `must_get_action`, `must_get_valid_record`, `must_get_agent_activity`. There is nothing non-deterministic to reach for, which is why the comment can promise network access without qualifying it.

Those functions are deterministic in the sense that matters, and the HDI says why in `must_get_entry`'s own documentation: it "is available in contexts such as validation where both determinism and network access is desirable", and when a dependency cannot be found, "callbacks will return early with `UnresolvedDependencies`". A missing dependency **defers** the validation rather than failing it. That is what makes a network read safe here: every validator eventually sees the same data and reaches the same verdict, or none of them decides yet.

So, concretely:

| Want to | Allowed |
|---|---|
| Verify a signature over the proof | Yes. Pure computation |
| Compare against a key in `dna_info().modifiers.properties` | Yes. Identical for every agent, part of the DNA hash |
| `must_get_valid_record` an invite the proof names by hash | Yes. This is the sanctioned way to reach DHT state |
| Check the proof against a list of issued codes you `get_links()` | **No.** The function does not exist in `hdi` |
| Expire an invite using `sys_time()` | **No.** Compare against the timestamp already in the action instead |

If you want revocable invites, the honest design is a signed capability with a short expiry, reissued out of band, not a lookup at genesis. Revocation by DHT state is the thing this model does not give you.

## Testing a membrane: the Sweettest wall

**Read this before you add a membrane requirement to a project that has tests.** The moment `validate_agent_joining` starts rejecting a `None` proof, every existing Sweettest that calls `setup_app` fails, and the obvious fix does not exist.

`SweetConductor::install_app` hardcodes the proof to `None`:

```rust
let dnas_with_proof: Vec<_> = dnas_with_roles.iter().map(|dr| (dr.to_owned(), None)).collect();
```

with an upstream comment sitting directly above it that says exactly what is missing:

```rust
// TODO: make this take a more flexible config for specifying things like
//       membrane proofs
```
 `install_app_with_manifest` does the same. The one function that accepts `Option<MembraneProof>`, `Conductor::install_app_minimal`, is `pub(crate)` and feature-gated, so a downstream test crate cannot call it. Searching the entire `sweettest` module of `holochain 0.7.1` for `MembraneProof` returns **nothing**.

So there is no direct way to hand a proof to `setup_app`. Two things that do work:

**1. Keep the rule in a plain function and unit-test that.** `validate_agent_joining` takes an `AgentPubKey` and an `Option<MembraneProof>` and returns an `ExternResult<ValidateCallbackResult>`. It needs no conductor. Most of the value is in testing that function directly with hand-built proofs, and it costs nothing.

**2. Deferred memproofs, for a genuine end-to-end test.** Every piece of this path is public in 0.7.1: `app_manifest_from_dnas(dnas, clone_limit, memproofs_deferred, network_seed)` is `pub`, `SweetConductor::raw_handle()` is `pub`, and `Conductor::provide_memproofs(installed_app_id, MemproofMap)` is `pub`. Build the manifest with deferred memproofs allowed, install it, then supply the map, then enable.

**`provide_memproofs` does not start the app.** It runs genesis and then sets the status to `Disabled(NotStartedAfterProvidingMemproofs)`, verified at `holochain-0.7.1/src/conductor/conductor.rs:1673`. So the sequence is install, provide, **then enable**. Skip the enable and you get an installed app with a genesised chain that never runs, and the status is the only thing that tells you why.

> **Verified at the type level, not compiled.** The three visibilities and signatures above were read from `holochain 0.7.1` sources. The exact call sequence for wiring them together has not been compiled in this skill's example hApp, unlike every other Rust example here. Treat it as a starting point and expect to adjust, and prefer approach 1 for routine coverage.

This gap is the reason to decide early whether a DNA has a membrane. Retrofitting one onto a project with an established test suite costs more than the validation rule suggests.

## Supplying the proof at install time

Two routes, both from the admin API.

**Straight away, per role.** `InstallAppRequest.roles_settings` takes a `RoleSettingsMap`:

```typescript
await admin.installApp({
  source: { type: "path", value: "./my-app.happ" },
  installed_app_id: "my-app",
  roles_settings: {
    my_role: {
      type: "provisioned",
      value: {
        membrane_proof: myProofBytes,   // Uint8Array
        modifiers: { network_seed: "cohort-2026" },
      },
    },
  },
});
```

`RoleSettings` is a two-variant union: `{ type: "provisioned", value: { membrane_proof?, modifiers? } }` or `{ type: "use_existing", value: { cell_id } }`.

**Deferred, after install.** Install without proofs, then let the UI collect them. The app sits in a distinct status until it gets them:

```typescript
export type AppStatus =
  | { type: "disabled"; value: DisabledAppReason }
  | { type: "enabled" }
  | { type: "awaiting_memproofs" };
```

and the app websocket takes them:

```typescript
await appClient.provideMemproofs({ my_role: proofBytes });
```

**Then enable it.** `provideMemproofs` genesises the cells and then **disables the app**, every time, by design. It is not an error path. `Conductor::provide_memproofs` sets `AppStatus::Disabled(DisabledAppReason::NotStartedAfterProvidingMemproofs)` unconditionally (`holochain-0.7.1/src/conductor/conductor.rs:1673`), and waits for an explicit enable:

```typescript
await appClient.provideMemproofs({ my_role: proofBytes });
await admin.enableApp({ installed_app_id: "my-app" });   // required, not optional
```

The name `not_started_after_providing_memproofs` reads like a failure, and it is the **normal** outcome. It is distinct from `{ type: "user" }` and `{ type: "never_started" }`, and all three are worth distinguishing in a launcher UI, but only this one means "the conductor did its part and is waiting for you".

From the command line (0.7.1), `hc client` does both routes against a running conductor's admin port. Each `--membrane-proof ROLE=PATH` reads raw proof bytes from a file and may be repeated per role:

```bash
# Straight away
hc client call --port $ADMIN_PORT install-app ./my-app.happ --app-id my-app --membrane-proof my_role=./proof.bin

# Deferred: the app is already installed and awaiting proofs
hc client provide-memproofs --port $ADMIN_PORT --membrane-proof my_role=./proof.bin my-app
```

`provide-memproofs` also takes `--membrane-proofs <YAML>`, a role-to-bytes map. Enable the app afterwards, for the reason above.

0.7.1 also added two app statuses for source chain restore, `awaiting_restore` and `unrecoverable`, which `@holochain/client` 0.21.1 does not type yet; see `migration.md` § Same DNA, new node.

`ignore_genesis_failure` on `InstallAppRequest` leaves an app installed with empty cells when genesis fails, instead of uninstalling it immediately. That is a diagnostic tool for exactly this class of bug, not a production setting.

## Membranes are not access control

A membrane decides who may join the network at all. Once inside, every agent can read everything they are an authority for and write anything validation allows. Per-function permissions are capability grants, a different mechanism entirely: see `access-control.md`.

Nor is a membrane a secret. The proof is written to the joiner's public source chain, where every validating authority reads it. Never put a shared secret in a membrane proof and expect it to stay secret.

## Related

- `progenitor.md` for putting the issuing key in DNA properties
- `access-control.md` for capability grants, which govern calls rather than joins
- `client.md` for the admin API surface used above
- `patterns.md` for the `FlatOp` and `TypedAction<D>` model these examples use
