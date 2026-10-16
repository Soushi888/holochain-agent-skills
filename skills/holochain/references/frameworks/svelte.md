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

`$state` on a class field makes the whole array reactive. Reassign it rather than mutating in place when you want the UI to update.

---

## Connection context (SvelteKit)

```typescript
// src/lib/holochainClient.ts
import { AppWebsocket } from "@holochain/client";
import { getContext, setContext } from "svelte";

const CLIENT_KEY = Symbol("holochain-client");

export function setHolochainClient(client: AppWebsocket) {
  setContext(CLIENT_KEY, client);
}

export function getHolochainClient(): AppWebsocket {
  const client = getContext<AppWebsocket>(CLIENT_KEY);
  if (!client) throw new Error("Holochain client not initialised");
  return client;
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { AppWebsocket } from "@holochain/client";
  import { setHolochainClient } from "$lib/holochainClient";

  let ready = $state(false);

  $effect(() => {
    AppWebsocket.connect().then((client) => {
      setHolochainClient(client);
      ready = true;
    });
  });
</script>

{#if ready}
  {@render children?.()}
{:else}
  <p>Connecting to conductor…</p>
{/if}
```

Connect once in the root layout and pass the client down through context. Opening a websocket per component wastes connections and makes signal handling ambiguous.

---

## Environment

```
VITE_HC_PORT=8888
```

`hc-spin` injects the port when it launches your UI, so in development you rarely set this by hand.
