# Signing and Encryption

App-level cryptography in a zome. Every signature below is taken from the shipped `hdk 0.7.0` and `hdi 0.8.0` sources, not from recall.

Holochain already signs every action for you. This page is about the cases where that is not enough: proving authorship of something that is not an action, and keeping content confidential from the DHT.

## Signing (coordinator: `hdk::ed25519`)

```rust
pub fn sign<K, D>(key: K, data: D) -> ExternResult<Signature>
pub fn sign_raw<K>(key: K, data: Vec<u8>) -> ExternResult<Signature>
pub fn sign_ephemeral<D>(datas: Vec<D>) -> ExternResult<EphemeralSignatures>
pub fn sign_ephemeral_raw(datas: Vec<Vec<u8>>) -> ExternResult<EphemeralSignatures>
```

`sign` is a serde convenience over `sign_raw`. Both sign with the private key held in lair for the public key you pass, so they only work for a key this conductor actually holds. If you do not have the private half, you cannot sign.

```rust
#[hdk_extern]
pub fn sign_offer(offer: Offer) -> ExternResult<Signature> {
    let me = agent_info()?.agent_initial_pubkey;
    sign(me, offer)
}
```

`sign_ephemeral` signs N items with a freshly generated key whose private half **is discarded immediately after signing**. Signatures come back pairwise ordered with the inputs. This is a primitive, not a pattern: it only means something inside a cryptographic scheme you have designed. If you cannot say what the discarded key proves, you do not want this function.

## Verifying (integrity: `hdi::ed25519`)

```rust
pub fn verify_signature<K, S, D>(key: K, signature: S, data: D) -> ExternResult<bool>
pub fn verify_signature_raw<K, S>(key: K, signature: S, data: Vec<u8>) -> ExternResult<bool>
```

These live in `hdi`, so they are callable from `validate()`. They are pure: no DHT read, no clock. That makes "this entry carries a valid signature from the agent it names" one of the few cross-agent claims you can actually enforce in validation. See `patterns.md` for why most other cross-agent checks cannot be.

## Encryption (coordinator: `hdk::x_salsa20_poly1305`)

Anything you commit as a public entry is readable by every DHT authority that holds it. Private entries stay on your own source chain but are not encrypted for anyone else. If you need a specific other agent to read something and nobody else, you encrypt it yourself.

Two shapes, matching libsodium's two:

**secretbox, one shared key.** Anyone holding the shared secret can decrypt.

```rust
pub fn x_salsa20_poly1305_shared_secret_create_random(
    /* ... */
) -> ExternResult<XSalsa20Poly1305KeyRef>
pub fn x_salsa20_poly1305_shared_secret_export( /* ... */ )
pub fn x_salsa20_poly1305_shared_secret_ingest( /* ... */ )
pub fn x_salsa20_poly1305_encrypt(
    key_ref: XSalsa20Poly1305KeyRef,
    data: XSalsa20Poly1305Data,
) -> ExternResult<XSalsa20Poly1305EncryptedData>
```

The secret never leaves the keystore. You hold a `XSalsa20Poly1305KeyRef`, not key bytes. `export` wraps the secret with the box algorithm so you can hand it to a specific peer, and that peer calls `ingest` to store it in their own keystore.

**box, two keypairs.** Only the named recipient can decrypt.

```rust
pub fn create_x25519_keypair() -> ExternResult<X25519PubKey>
pub fn x_25519_x_salsa20_poly1305_encrypt(
    sender: X25519PubKey,
    recipient: X25519PubKey,
    data: XSalsa20Poly1305Data,
) -> ExternResult<XSalsa20Poly1305EncryptedData>
```

`create_x25519_keypair` generates in lair and returns only the public half. The secret never leaves lair.

There is also a convenience that converts ed25519 signing keys into x25519 encryption keys, so you can encrypt straight to an `AgentPubKey`:

```rust
pub fn ed_25519_x_salsa20_poly1305_encrypt(
    sender: AgentPubKey,
    recipient: AgentPubKey,
    data: XSalsa20Poly1305Data,
) -> ExternResult<XSalsa20Poly1305EncryptedData>
```

Its own doc comment carries a warning: understand the downsides of reusing a signing key for encryption before you use it. See <https://doc.libsodium.org/advanced/ed25519-curve25519>. Prefer a dedicated x25519 keypair unless you have a specific reason not to.

**On decryption.** The decrypt side lives in `hdi 0.8.0` (`hdi::x_salsa20_poly1305`), which `hdk 0.7.0` re-exports with `pub use hdi::x_salsa20_poly1305::*` and lists in its prelude, so `use hdk::prelude::*` brings all three into scope:

```rust
pub fn x_salsa20_poly1305_decrypt(
    key_ref: XSalsa20Poly1305KeyRef,
    encrypted_data: XSalsa20Poly1305EncryptedData,
) -> ExternResult<Option<XSalsa20Poly1305Data>>
pub fn x_25519_x_salsa20_poly1305_decrypt(
    recipient: X25519PubKey,
    sender: X25519PubKey,
    encrypted_data: XSalsa20Poly1305EncryptedData,
) -> ExternResult<Option<XSalsa20Poly1305Data>>
pub fn ed_25519_x_salsa20_poly1305_decrypt(
    recipient: AgentPubKey,
    sender: AgentPubKey,
    encrypted_data: XSalsa20Poly1305EncryptedData,
) -> ExternResult<XSalsa20Poly1305Data>
```

The secretbox and x25519 variants return `None` when the ciphertext does not open; the ed25519 variant returns an error instead.

## Size limit: about 8 KiB per keystore request

Every function on this page hands its payload to lair, and every lair request travels down a framed channel that refuses any frame over 8 KiB (`const MAX_FRAME: usize = 1024 * 8` in `lair_keystore_api 0.7.1`, `src/sodium_secretstream.rs`). That holds for the in-process keystore too: it talks to its server over the same framed stream. The frame also carries the request envelope, so the plaintext you can encrypt in one call is smaller than 8192 bytes. Over the limit, the call fails at runtime with a host error, not at compile time:

```
WasmError { module_path: "holochain::core::ribosome::host_fn::x_salsa20_poly1305_encrypt", line: 36, error: Host("{\"error\":\"FrameOverflow\",\"message\":\"29937 > 8192\"}") }
```

That error came from a Sweettest run encrypting a record holding a 20 KB photo. The `hdk` doc comment already says secretbox "is designed for 'small' data, break large data into chunks with unique nonces"; the frame limit is what makes that advice binding.

For anything that is not reliably small, encrypt the content in the zome with a fresh one-use key and a pure-Rust AEAD, then pass only that 32-byte key through lair (`x_salsa20_poly1305_encrypt` under the long-lived key, or one of the box functions). Decrypting is the same two steps in reverse. The long-lived key never leaves lair; what crosses Wasm memory is the one-use key for the one item being read or written. This envelope shape is not part of the example hApp, so no Rust is given for it here. One worked write-up, using the `chacha20poly1305` crate with `default-features = false` (XChaCha20-Poly1305): [Hearth, `docs/encryption.md`](https://github.com/topeuph-ai/hearth/blob/main/docs/encryption.md).

## What none of this gives you

- **Encryption is not access control.** A DHT authority still stores and gossips your ciphertext, sees its size, sees who authored it and when, and sees the link graph around it. Metadata leaks even when content does not.
- **Signing is not identity.** A signature proves control of a key at some moment. Binding a key to a person is a separate problem, and 0.7 does not solve it in the SDK. See the DeepKey note in `architecture.md`.
- **Validation must not decrypt.** The host does let `validate()` call the decrypt functions (they need only deterministic keystore access, which validation is granted), but the answer depends on which keys the validating conductor happens to hold. Two authorities would reach different verdicts on the same op, which is exactly the non-determinism validation forbids. Check signatures and sizes in validation, never content, and design your invariants around what stays in the clear.

## Related

- `access-control.md` for capability grants, which govern who may call your functions rather than who may read your data.
- `patterns.md` for private entries, which keep data off the DHT entirely and are usually the simpler answer.
