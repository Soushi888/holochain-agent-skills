# Countersigning

Two or more agents committing the same entry atomically, each to their own source chain. Every type and signature below is taken from the shipped `hdk 0.7.1` and `holochain_integrity_types 0.7.1` sources.

## Countersigning is still unstable in 0.7

It sits behind a Cargo feature that is **off by default**:

```toml
# in your coordinator zome
hdk = { version = "=0.7.1", features = ["unstable-countersigning"] }
```

The conductor must be built with it too. `holochain 0.7.1` declares:

```toml
unstable-countersigning = [
    "hdk/unstable-countersigning",
    "holochain_zome_types/unstable-countersigning",
    "holochain_conductor_api/unstable-countersigning",
]
```

Default features on `holochain 0.7.1` are `encryption`, `schema`, `wasmer-sys-cranelift`. Countersigning is not among them.

**What this means in practice.** A conductor built with the crate's default features does not have countersigning compiled in, so check how the binary you run (the one holonix installs, the one Kangaroo bundles) was built before relying on it. If your hApp needs it you are building and shipping your own conductor. Treat that as an architectural commitment, not a feature flag you flip late. Design an alternative first and reach for countersigning only when nothing else gives you the atomicity you need.

## The session shape

A countersigning session has one initiator and N signers. It runs in three beats.

1. The initiator builds a `PreflightRequest` and distributes it to every signer, usually by remote call.
2. Each signer calls `accept_countersigning_preflight_request`, which **freezes that signer's source chain** until the session ends. Each returns a `PreflightRequestAcceptance` to the initiator.
3. With every acceptance in hand, the initiator builds the entry and everyone commits it.

The chain freeze in step 2 is the whole point and the whole danger. Between accepting and resolving, that agent can commit nothing else.

## PreflightRequest

```rust
pub struct PreflightRequest {
    /// Hash of the app entry as if it were not countersigned.
    /// The final entry hash will include the countersigning session.
    pub app_entry_hash: EntryHash,
    /// The agents participating in this session.
    pub signing_agents: CounterSigningAgents,
    /// Optional additional M of N signers.
    pub optional_signing_agents: CounterSigningAgents,
    /// The M in M of N. Must be strictly greater than N / 2 and not larger than N.
    pub minimum_optional_signing_agents: u8,
    /// If true, the first signing agent (index 0) acts as an enzyme.
    pub enzymatic: bool,
    /// Bounds the session in time. All session actions share one timestamp.
    pub session_times: CounterSigningSessionTimes,
    /// Action information shared by all agents. Depends on the action type.
    pub action_base: ActionBase,
    /// Arbitrary application bytes carried through the preflight.
    pub preflight_bytes: PreflightBytes,
}
```

Build it with the fallible constructor, never by struct literal. `try_new` runs `check_integrity()` for you and returns `Result<Self, CounterSigningError>`. `CounterSigningError` has no `From` impl into `WasmError`, so map it before `?` in a zome function:

```rust
PreflightRequest::try_new(
    app_entry_hash,
    signing_agents,
    optional_signing_agents,
    minimum_optional_signing_agents,
    enzymatic,
    session_times,
    action_base,
    preflight_bytes,
)
.map_err(|e| wasm_error!(WasmErrorInner::Guest(e.to_string())))?
```

Two constraints the constructor checks and that are easy to get wrong:

- If there are optional signers, M must be at least half of N and not larger than N. The field's doc comment says M must be strictly greater than `N / 2`, but `check_agents_optional` only rejects `2 * M < N` and `M > N`, so M = N / 2 passes. Enforce a strict majority yourself if you need one.
- If there are optional signers, the **enzyme must be used**, and it must be the first agent in **both** `signing_agents` and `optional_signing_agents`.

## Session times

```rust
pub fn session_times_from_millis(ms: u64) -> ExternResult<CounterSigningSessionTimes>
```

Starts the session at the initiator's "now" and ends it `ms` milliseconds later. Every signer checks these times while accepting, so:

- System clocks across participants must be roughly aligned.
- The window must comfortably exceed the ambient network round trip for the whole group.

Too short and honest signers get `UnacceptableFutureStart` or simply miss the window. Too long and every participant's chain stays frozen for that long.

## Accepting

```rust
pub fn accept_countersigning_preflight_request(
    preflight_request: PreflightRequest,
) -> ExternResult<PreflightRequestAcceptance>
```

This must be called by **every** signer. How you distribute the request is up to you; concurrent remote calls are the simplest mechanism that fits inside a session timeout.

Handle all five outcomes:

```rust
pub enum PreflightRequestAcceptance {
    /// Accepted. Send the response back to the initiator.
    Accepted(PreflightResponse),
    /// Start time is too far in the future for this agent.
    UnacceptableFutureStart,
    /// The request does not include this agent.
    UnacceptableAgentNotFound,
    /// Not checked: another session is already in progress on this chain.
    AnotherSessionIsInProgress,
    /// Failed an integrity check.
    Invalid(String),
}
```

`AnotherSessionIsInProgress` is the one people forget. An agent can only be in one countersigning session at a time, so any design where a single agent is a hot spot, for example one marketplace operator countersigning every trade, will serialize and then fail under load.

## Failure surface

`ZomeCallResponse` carries a dedicated variant for this:

```rust
ZomeCallResponse::CountersigningSession(String)
```

Match it explicitly rather than folding it into a wildcard, since it means "the session failed to start", which is operationally different from a network error.

## Design checklist before you commit to countersigning

- [ ] Can the invariant be expressed as validation on two independent entries instead? That needs no feature flag and no chain freeze.
- [ ] Are you prepared to build and distribute a custom conductor with `unstable-countersigning` enabled?
- [ ] Is any single agent a participant in a high proportion of sessions? If so, `AnotherSessionIsInProgress` is your throughput ceiling.
- [ ] Is the session window long enough for your worst realistic latency and short enough that a stalled peer does not freeze chains for minutes?
- [ ] Does every signer handle all five `PreflightRequestAcceptance` variants, including the two that mean "retry later" rather than "fail"?
- [ ] If you use optional signers, does M satisfy the strict majority rule, and is the enzyme first in both agent lists?

## Related

- `access-control.md` for the cap grants the remote calls that distribute preflight requests will need.
- `patterns.md` for ordinary entry commit and validation, which is where most "atomic" requirements should land instead.
