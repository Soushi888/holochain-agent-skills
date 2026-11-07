# DNA Migration and Init Properties

Holochain 0.7 added the first piece of first-class DNA migration support: a way to seed a freshly installed chain with state carried over from a previous one.

Set expectations first. This is a building block, not a migration system. The developer experience around it is incomplete, and the surrounding pieces (getting data out of the old install, agent key continuity) are still the hard part.

---

## The 0.7 mechanism: `InitProperties`

A new `InitProperties` type can be set on `RoleSettings::Provisioned` at install time, through the `InstallApp` admin endpoint. The zome reads it back from the `init` callback with the `get_init_properties()` host function.

Its four defining properties, all of which matter:

1. **Opaque to the conductor.** The bytes mean nothing to Holochain; you define the encoding.
2. **Never written to the DHT.** They stay in the conductor database.
3. **Readable only from `init`.** No other callback or zome function can see them.
4. **Cleared once init succeeds**, or when the app is uninstalled.

The intended shape is: extract state from the old install, pass it at install time to the new DNA, and have `init` write it onto the new source chain as ordinary entries. From that point on it is normal DHT data.

---

## `init_properties` is not `modifiers.properties`

These are different mechanisms and confusing them produces a bug that passes every local test.

| | `modifiers.properties` | `init_properties` |
|---|---|---|
| Part of the DNA hash | Yes | No |
| Visible to other peers | Yes, every peer agrees on it | No, conductor-local |
| Readable from validation | Yes, via `dna_info()` | **No** |
| Readable from any zome fn | Yes | No, `init` only |
| Lifetime | Permanent | Cleared after init |
| Use for | Network-wide config: progenitor key, membrane settings | Per-install seed data for a migrated chain |

The trap: a progenitor check reads naturally as "configuration passed at install time", so `init_properties` looks like the modern replacement. It is not. Integrity validation runs on every peer against data that must be identical network-wide, and a validating peer cannot see your init properties. A check written against them passes for the installer and is unverifiable for everyone else.

Anything validation must agree on goes in `modifiers.properties`. See `progenitor.md`.

---

## What 0.7 does not give you

**There is no data migration path between 0.6 and 0.7 itself.** DNA hashes change even for otherwise-identical DNAs, because `ZomeDef` no longer uses its custom untagged serialization and the DNA hash derives from the serialized integrity zomes. Holochain's databases were also renamed, and existing conductor installs must have their data cleared. Every 0.7 network is a new network.

**Agent key continuity is not solved.** If your migration depends on users keeping their existing agent key, getting the private key out of Lair is not straightforward. Budget for this separately rather than assuming it.

**Your packaging tool may not expose the admin API.** Init properties are set through `InstallApp`. If you ship through Kangaroo or a similar wrapper, check that it lets you reach that call before designing around it.

---

## Same DNA, new node: source chain restore (0.7.1)

Everything above is about moving to a **new DNA**. Holochain 0.7.1 added the other case: the same agent, on the same DNA, resuming on a **new conductor** (a new device, a reinstall, a lost disk), by rebuilding its source chain from what the DHT already holds.

Install with the existing agent key and `restore_from_dht: true` (`InstallAppPayload`, `holochain_types-0.7.1/src/app.rs`). Genesis is skipped; each cell fetches the agent's prior chain from the DHT instead.

- `restore_from_dht` **requires `agent_key`**. You must already hold that key in this conductor's keystore, which is the agent key continuity problem above: restore rebuilds the chain, it does not move the key.
- While it runs, the app is in `AppStatus::AwaitingRestore` and zome calls are rejected (with `ConductorError::CellNotRunning`, whose reason says the cell is restoring).
- When every cell has restored, the app goes to `Disabled(NeverStarted)`: call `enable_app`, as after a normal install.
- If restore finds a validated chain integrity warrant against the agent (a proven fork, an invalid op), the app goes to `AppStatus::Unrecoverable(cell_id, reason)`. That state is terminal: there is no repair path, only uninstall.
- Restore needs peers that hold the chain. With none known yet it keeps retrying rather than failing, so a restore on an empty or brand-new network waits.

From TypeScript, `@holochain/client` 0.21.1 has neither the `restore_from_dht` field on `InstallAppRequest` nor the `awaiting_restore` and `unrecoverable` members of `AppStatus`. A launcher using those types must send the field untyped and handle status values its union does not name. The `hc client call install-app` CLI has no restore flag either; restore goes through the admin API.

Upstream design notes: `docs/design/source_chain_restore.md` in the holochain repository.

---

## Choosing what to carry across

Options, cheapest first:

| Approach | What it costs | When it fits |
|---|---|---|
| Clean restart | Nothing technical; users lose history | Pre-production, or data that is genuinely disposable |
| User-facing export / import | UI work in both versions, no admin API needed | Most apps. Often cheaper than the "proper" path and easier to explain to users |
| Hash pointers | Small payload; the old data must stay reachable somewhere | Archival references where content need not move |
| Notary-signed rollups | A trusted signer, and a scheme for it | Balances or aggregates where per-event history is not needed |
| Whole source chain | Largest payload; needs the most validation thought | Full-fidelity migration |

Before reaching for init properties, price the export/import route honestly. For many apps it is less work, needs no admin access, and gives users something they can understand and verify.

---

## Sequence

1. Decide what must survive, using the table above.
2. Extract it from the 0.6 install, while it still runs.
3. Encode it and pass it as `init_properties` on `RoleSettings::Provisioned` when installing the 0.7 app.
4. In `init`, read `get_init_properties()`, decode, and write entries to the new source chain.
5. Validate those entries like any others. Remember validation cannot see the init properties themselves, only the entries you wrote from them.

See `workflows/upgrade-holochain-0.7.md` for the code port, and `deployment.md` for where `roles_settings` is set in a packaged app.
