# Cell Cloning

## What Is Cell Cloning?

Cell cloning creates **new network instances** from the same DNA code by varying the DNA hash modifier (network seed or properties). Each clone is a separate DHT network — agents in clone A cannot directly see data in clone B even though they run identical code.

This is distinct from having multiple roles in a happ — cloning is for **partitioning data** within a single role.

## When to Use Cloning

| Use case | Pattern |
|----------|---------|
| Private group spaces (each group gets its own DHT) | Clone per group |
| Time-bounded archives (one clone per year) | Clone per time period |
| Community partitions (separate networks per community) | Clone per community |
| Single shared network for all users | No cloning — single provisioned cell |

## `happ.yaml` Setup

```yaml
roles:
  - name: group_spaces
    provisioning:
      strategy: create
      deferred: false      # provisioned on install; clones created on demand
    dna:
      path: "./group_spaces.dna"
      modifiers:
        network_seed: ~
      clone_limit: 50      # allow up to 50 clones of this role
```

`clone_limit` must be set to enable cloning. If `clone_limit: 0` (default), cloning is not permitted.

## TypeScript Client — Creating a Clone

```typescript
import { AppClient } from '@holochain/client';

// Create a new clone cell with a unique network seed:
const cloneCell = await appClient.createCloneCell({
  role_name: 'group_spaces',
  modifiers: {
    network_seed: `group-${groupId}`,  // unique seed = unique network
    properties: encode({ group_name: groupName }),
  },
  name: `Group: ${groupName}`,
});

const clonedCellId = cloneCell.cell_id;
```

## Addressing Clone Cells

Clone cells use a composite role name format: `"{role_name}.{clone_index}"`

```typescript
// First clone:   "group_spaces.0"
// Second clone:  "group_spaces.1"
// etc.

// Call a function on a specific clone:
const result = await appClient.callZome({
  cell_id: clonedCellId,   // or use role_name: "group_spaces.0"
  zome_name: 'group_spaces',
  fn_name: 'create_post',
  payload: { content: 'Hello group!' },
});
```

## Enabling / Disabling Clones

```typescript
// clone_cell_id is a CloneCellId, not a CellId: { type: "clone_id", value } or { type: "dna_hash", value }
// Disable a clone (data preserved, cell not running):
await appClient.disableCloneCell({
  clone_cell_id: { type: 'clone_id', value: cloneCell.clone_id },  // e.g. "group_spaces.0"
});

// Re-enable a previously disabled clone:
await appClient.enableCloneCell({
  clone_cell_id: { type: 'dna_hash', value: cloneCell.cell_id[0] },  // the clone's DNA hash also works
});
```

## Key Constraints

- The maximum number of clones is set by `clone_limit` in `happ.yaml` — plan capacity upfront
- Each clone's network seed must be unique — using the same seed creates the same network
- Cloned cells share the same WASM binary but have separate source chains and DHTs
- `deferred: true` is not required for clonable roles: a provisioned `strategy: create` role is cloneable whenever its `clone_limit` is above 0 (`resolve_cell` passes `clone_limit` straight into `CellProvisioningOp::CreateFromDnaFile`)
- `deferred` is in fact ignored on install. `AppBundle::resolve_cell` destructures `Create { .. }` without reading it, so the role is provisioned either way (`holochain_types-0.7.1/src/app/app_bundle.rs:115`)
- Avoid `strategy: clone_only`. It is the one setting that leaves a role unprovisioned, and assembling `AppInfo` then reaches `unimplemented!()` in `holochain_conductor_api-0.7.1/src/app_interface.rs` (line 597), panicking the conductor

**Reference:** [developer.holochain.org/build/cell-cloning/](https://developer.holochain.org/build/cell-cloning/)
