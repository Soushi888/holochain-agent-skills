# Holochain TypeScript Client

## Package Version

```
@holochain/client   ^0.21.1   (Holochain 0.7 / hdk 0.7.x / hdi 0.8.x)
```

Holochain 0.7 apps use the `@holochain/client` 0.21.x line, and the current release on that line is 0.21.1 (paired with holochain 0.7.1). Always install it with an explicit range (`^0.21.1`), never `@latest`.

**Do not install 0.22.x for a 0.7 conductor.** `@holochain/client` 0.22.0 (npm, 2026-10-07) is built against a Holochain that has no tagged release yet: its release notes say the wire types come from a commit "not in a tagged release yet", and it renames wire types (`InstallAppPayload` where 0.21.x has `InstallAppRequest`). <!-- legacy-ok --> Check what you have with `npm ls @holochain/client`; a 0.22.x result in a 0.7 project is the mismatch.

Holochain 0.7 changed the client surface. If you are porting from 0.20.x, read [Migrating from 0.20.x](#migrating-from-020x) first.

---

## Connection Setup

```typescript
import { AppWebsocket, AdminWebsocket } from "@holochain/client";

// App connection. The client is bound to the app it connects to, so there is
// no installed-app-id argument and no separate agent-aware class.
const client = await AppWebsocket.connect();

// Explicit URL and token, e.g. when the conductor is not discovered from env:
const client = await AppWebsocket.connect({
  url: new URL(`ws://localhost:${process.env.HC_PORT}`),
  token: authToken,
});

// Admin connection (test harnesses, installers, tooling — not app code):
const admin = await AdminWebsocket.connect({
  url: new URL(`ws://localhost:${process.env.HC_ADMIN_PORT}`),
});
```

> `AppAgentWebsocket` no longer exists. It was merged into `AppWebsocket`, which now carries the cell context itself.

---

## App Authentication Tokens

A conductor does not hand out app connections to whoever asks. An app websocket connection is authenticated with a token that the **admin** interface issues, so the flow has two steps and two sockets.

```typescript
import { AdminWebsocket, AppWebsocket } from "@holochain/client";

const admin = await AdminWebsocket.connect({
  url: new URL(`ws://localhost:${adminPort}`),
});

// 1. Mint a token for one installed app.
const { token } = await admin.issueAppAuthenticationToken({
  installed_app_id: "my-app",
  expiry_seconds: 30,   // optional; omit for the conductor default
  single_use: true,     // optional; a token good for exactly one connection
});

// 2. Connect the app socket with it.
const client = await AppWebsocket.connect({
  url: new URL(`ws://localhost:${appPort}`),
  token,
});
```

The types:

```typescript
export type AppAuthenticationToken = number[];

export interface IssueAppAuthenticationTokenRequest {
  installed_app_id: InstalledAppId;
  expiry_seconds?: number;
  single_use?: boolean;
}

export interface IssueAppAuthenticationTokenResponse {
  token: AppAuthenticationToken;
  expires_at?: Timestamp;
}
```

`single_use: true` plus a short `expiry_seconds` is the right default for a launcher handing a token to a browser window: the token is spent on connection and useless if it leaks afterwards.

In a dev sandbox where the environment already provides a connection, `AppWebsocket.connect()` with no arguments discovers what it needs and you never see a token. In a packaged app you are the launcher, so you issue it yourself. Kangaroo does this for you; see `deployment.md`.

### Attaching an app interface

A token is useless without a port to spend it on. Admin attaches app interfaces:

```typescript
const { port } = await admin.attachAppInterface({
  allowed_origins: "*",              // required, not defaulted
  installed_app_id: "my-app",        // optional: restrict this interface to one app
});
```

`allowed_origins` takes a comma separated list or `*`. A browser UI silently failing to connect is usually an origin rejection, not a port problem.

Passing `installed_app_id` binds the interface: only tokens issued for that same app may connect to it. That is the isolation boundary when one conductor runs several apps.

---

## Admin API: Install and Manage

App code should never touch the admin socket. Test harnesses, launchers and installers do.

```typescript
// Install
await admin.installApp({
  source: { type: "path", value: "./workdir/my-app.happ" },
  installed_app_id: "my-app",
  network_seed: "my-network",        // optional, overrides every DNA in the bundle
  roles_settings: { /* see membranes.md */ },
});

await admin.enableApp({ installed_app_id: "my-app" });
```

`agent_key` is optional on install; omit it and the conductor generates one. `ignore_genesis_failure: true` leaves a failed app installed with empty cells instead of uninstalling it, which is a diagnostic setting rather than a production one.

### Signing credentials for direct zome calls

An admin-driven client that calls zome functions without going through an app interface needs its own capability grant:

```typescript
await admin.authorizeSigningCredentials(cellId);

// or narrow it. `GrantedFunctions` is a tagged union in 0.21, not the old
// `{ [GrantedFunctionsType.Listed]: ... }` object:
await admin.authorizeSigningCredentials(cellId, {
  type: "listed",
  value: [["my_zome", "my_fn"]],
});
```

This is what Playwright E2E setups and test harnesses use. See `testing.md`.

### Granting a zome-call capability

From 0.7.1 the grant carries a `constraint` (who may use it) and a nested `grant` holding the function list. The old `access` field is gone:

```typescript
await admin.grantZomeCallCapability({
  cell_id: cellId,
  cap_grant: {
    tag: "my_grant",
    constraint: { type: "unrestricted" },
    grant: { functions: { type: "listed", value: [["my_zome", "my_fn"]] } },
  },
});
```

`listCapabilityGrants` returns `CapGrantInfo` rows whose `cap_grant` is a `DesensitizedCapGrant { tag, constraint, capability }`, with `capability` either `{ type: "zome_call", value: { functions } }` or `{ type: "direct_signal" }`. Shapes read from the `@holochain/client` 0.21.1 declarations (`api/admin/types.d.ts`, `hdk/capabilities.d.ts`).

### Inspection

```typescript
const apps    = await admin.listApps({});
const cells   = await admin.listCellIds();
const grants  = await admin.listCapabilityGrants({
  installed_app_id: "my-app",
  include_revoked: false,        // required, not optional
});
const stats   = await admin.dumpNetworkStats();
```

`include_revoked` has no default: leave it out and the call does not typecheck. Set it to `false` when you are asking "what can this agent do right now", and `true` only when you are auditing history, because a revoked grant in the list looks exactly like a live one at a glance.

The same calls are available from the command line as `hc client call ...` (holonix `main-0.7` builds only the `hc` binary, so there is no standalone `hc-client` on its PATH). See `debugging.md`.

### App status

`appInfo()` returns a status that a UI has to branch on:

```typescript
export type AppStatus =
  | { type: "disabled"; value: DisabledAppReason }
  | { type: "enabled" }
  | { type: "awaiting_memproofs" };
```

`awaiting_memproofs` means the app is installed but waiting for a membrane proof before it can join. Handle it, or your app appears to install and then do nothing. See `membranes.md`.

---

## callZome Pattern

```typescript
const record = await client.callZome({
  role_name: "my_dna",
  zome_name: "my_zome",
  fn_name: "create_my_entry",
  payload: { title: "New Entry", status: "Active" },
});
```

`role_name` resolves the cell from the app manifest, which is what app code should use. Pass `cell_id` instead only when addressing a specific cloned cell.

---

## Actions: the header / data split

Holochain 0.7 split every action into a `header` holding the fields all actions share and a `data` payload holding the rest. The same split applies on the JavaScript side. `SignedActionHashed<H extends Action = Action>` keeps its type parameter, but `Create`, `Update`, `Delete`, `CreateLink` and the rest are now `ActionData` variants that live under `.data`, not `Action`s, so `SignedActionHashed<Create>` no longer typechecks.

```typescript
import type { SignedActionHashed, ActionHash, AgentPubKey, Timestamp } from "@holochain/client";
import { ActionType, encodeHashToBase64 } from "@holochain/client";

// Common fields live under .header
const author = encodeHashToBase64(action.hashed.content.header.author);
const createdAt = action.hashed.content.header.timestamp;

// Action-specific fields live under .data, a union narrowed on .type
const data = action.hashed.content.data;
if (data.type === ActionType.Create) {
  const entryHash = data.entry_hash;
}
```

`Create`, `Update`, `Delete`, `CreateLink` and `DeleteLink` are still exported, as members of the `ActionData` union, so signal types drop the old `SignedActionHashed<Create>` parameter and narrow on `action.hashed.content.data.type` instead:

```typescript
export type MyAppSignal =
  | { type: "EntryCreated"; action: SignedActionHashed; app_entry: EntryTypes }
  | { type: "EntryUpdated"; action: SignedActionHashed; original_action_hash: ActionHash }
  | { type: "LinkCreated"; action: SignedActionHashed; link_type: string };
```

---

## Signal Subscription

```typescript
import { SignalType } from "@holochain/client";

client.on("signal", (signal) => {
  if (signal.type !== SignalType.App) return;   // ignore system and direct signals

  const { zome_name, payload } = signal.value;
  if (zome_name === "my_zome") handleMyZomeSignal(payload as MyAppSignal);
});

function handleMyZomeSignal(payload: MyAppSignal) {
  switch (payload.type) {
    case "EntryCreated":
      // refresh list
      break;
    case "EntryUpdated":
      // update one item in the store
      break;
  }
}
```

The payload shape mirrors the Rust `Signal` enum, which uses `#[serde(tag = "type")]`. See `patterns.md` for the emitting side.

`SignalType` (imported from `@holochain/client`) has three members in 0.21.1: `App = "app"`, `AppDirect = "app_direct"` and `System = "system"`. An `AppDirect` signal carries `{ cell_id, from_agent, signal: Uint8Array }`, and the payload is opaque bytes you decode yourself. Sending and receiving direct signals needs capability grants (see `access-control.md`): `client.sendDirectSignal({ dna_hash, agents, signal, cap_secret? })` sends, `client.grantDirectSignalCapability({ cell_id, tag, constraint })` lets this cell receive, and the admin socket has the same `grantDirectSignalCapability` for any cell. `constraint` is `{ type: "unrestricted" }`, `{ type: "transferable", value: { secret } }` or `{ type: "assigned", value: { secret, assignees } }`.

---

## Chain ops (0.21.x change)

`ChainOp` and `OpEntry` follow the 0.7 msgpack encoding as of `@holochain/client` 0.21.1 (the 0.21.1-rc.0 notes mark this breaking). Newtype op variants such as `AgentActivity`, `DeleteEntry` and `CreateLink` carry a bare `SignedAction` rather than a one-element tuple, `OpEntry` unit variants are plain strings, and `CreateEntry` carries `[SignedAction, OpEntry]`. Read ops through `getChainOpType`, `getChainOpAction`, `getChainOpEntry` and `getChainOpSignature` rather than indexing the tuple. Code that destructured the 0.21.0 shape must be updated.

---

## Type Utilities

```typescript
import { decodeHashFromBase64, encodeHashToBase64, type Record } from "@holochain/client";
import { decode } from "@msgpack/msgpack";

// Hash serialisation, for URLs and localStorage
const hashString = encodeHashToBase64(actionHash);
const hashBack = decodeHashFromBase64(hashString);

// Decode an entry out of a Record
function decodeEntry<T>(record: Record): T {
  if (!("Present" in record.entry)) {
    throw new Error("Expected a Present entry");
  }
  return decode(record.entry.Present.entry) as T;
}

// The action hash of a Record
function getActionHash(record: Record) {
  return record.signed_action.hashed.hash;
}
```

---

## Network Stats

```typescript
import { type ApiTransportStats } from "@holochain/client";

const stats: ApiTransportStats = await client.dumpNetworkStats();
const connected = stats.transport_stats.connections.length;
const direct = stats.transport_stats.connections.filter((c) => c.is_direct).length;
```

Both the app and admin clients return the same `ApiTransportStats` type now, nesting the transport figures under `transport_stats` and adding `blocked_message_counts`. The per-connection `is_webrtc` flag is now `is_direct`, since WebRTC is gone and iroh over QUIC is the only transport.

---

## Migrating from 0.20.x

| 0.20.x | 0.21.0 |
|---|---|
| `AppAgentWebsocket.connect(url, appId)` | `AppWebsocket.connect()` |
| `SignedActionHashed<Create>` | `SignedActionHashed` |
| `action.hashed.content.author` | `action.hashed.content.header.author` |
| `action.hashed.content.timestamp` | `action.hashed.content.header.timestamp` |
| `Create`, `CreateLink`, ... as action types | still exported, now `ActionData` variants read from `action.hashed.content.data` |
| `TransportStats` | `ApiTransportStats` |
| `stats.connections` | `stats.transport_stats.connections` |
| `connection.is_webrtc` | `connection.is_direct` |

---

## Environment Variables

```
HC_PORT=8888           # conductor app WebSocket port
HC_ADMIN_PORT=9000     # admin port (conductor management)
VITE_HC_PORT=8888      # Vite prefix, for browser access
```

---

## Framework Integration

The patterns above are framework-neutral. For stack-specific wiring:

- Svelte 5 runes stores — `frameworks/svelte.md`
- Effect-TS typed errors and timeouts — `frameworks/effect.md`

Neither is required. A React, Vue or vanilla app uses the client exactly as shown above.
