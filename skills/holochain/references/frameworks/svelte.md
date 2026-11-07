# Svelte 5 Integration

Optional. The framework-neutral client surface is in `../client.md`; nothing here is required to use Holochain from TypeScript.

Assumes Svelte 5 runes and `@holochain/client` 0.21.1.

---

## Reactive store

```typescript
// stores/myEntry.svelte.ts
import type { AppWebsocket } from "@holochain/client";
import { SignalType } from "@holochain/client";
import type { MyEntry, MyAppSignal } from "$lib/types";

export class MyEntryStore {
  entries = $state<MyEntry[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  constructor(private client: AppWebsocket) {
    client.on("signal", (signal) => {
      if (signal.type !== SignalType.App) return;
      const { zome_name, payload } = signal.value;
      if (zome_name === "my_zome") this.handleSignal(payload as MyAppSignal);
    });
  }

  async loadAll() {
    this.loading = true;
    this.error = null;
    try {
      const records = await this.client.callZome({
        role_name: "my_dna",
        zome_name: "my_zome",
        fn_name: "get_all_my_entries",
        payload: null,
      });
      this.entries = records.map(decodeEntry<MyEntry>);
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
    }
  }

  private handleSignal(signal: MyAppSignal) {
    switch (signal.type) {
      case "EntryCreated":
        this.loadAll();
        break;
      case "EntryDeleted":
        // action fields live under .header in 0.7
        this.entries = this.entries.filter(
          (e) => e.originalHash !== signal.original_action_hash,
        );
        break;
    }
  }
}
```

`$state` on a class field makes the array deeply reactive: reassigning it and mutating it in place (`push`, `splice`, setting an item's property) both update the UI. Declare it with `$state.raw` for a large list you never mutate; raw state updates only on reassignment.

---

## Connection context (SvelteKit)

```typescript
// src/lib/holochainClient.ts
import { AppWebsocket } from "@holochain/client";
import { getContext, setContext } from "svelte";

const CLIENT_KEY = Symbol("holochain-client");

// setContext and getContext must run during component initialisation,
// never inside an $effect or a .then(), so the context holds the connection promise
export function setHolochainClient(client: Promise<AppWebsocket>) {
  setContext(CLIENT_KEY, client);
}

export function getHolochainClient(): Promise<AppWebsocket> {
  const client = getContext<Promise<AppWebsocket>>(CLIENT_KEY);
  if (!client) throw new Error("Holochain client not initialised");
  return client;
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { AppWebsocket } from "@holochain/client";
  import { setHolochainClient } from "$lib/holochainClient";

  let { children }: { children: Snippet } = $props();

  const client = AppWebsocket.connect();
  setHolochainClient(client);   // during init, synchronously
</script>

{#await client}
  <p>Connecting to conductor…</p>
{:then}
  {@render children()}
{:catch error}
  <p>Could not connect: {String(error)}</p>
{/await}
```

The connection only exists in the browser, so turn off server rendering for this layout with `export const ssr = false;` in `src/routes/+layout.ts`. A component reads the client with `const client = await getHolochainClient()` inside its handlers.

Connect once in the root layout and pass the client down through context. Opening a websocket per component wastes connections and makes signal handling ambiguous.

---

## Environment

```
VITE_HC_PORT=8888
```

`hc-spin` does not read this variable. It exposes `window.__HC_LAUNCHER_ENV__` (app interface port, app id and auth token) to the UI it launches, and `AppWebsocket.connect()` with no `url` reads that, so under `hc-spin` you set nothing by hand. A variable like this matters only when you connect outside `hc-spin` and pass `url` and `token` yourself.
