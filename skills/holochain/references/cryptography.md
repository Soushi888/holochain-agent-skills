# Signing and Encryption

App-level cryptography in a zome. Every signature below is taken from the shipped `hdk 0.7.1` and `hdi 0.8.1` sources, not from recall.

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

**On decryption.** The `hdk 0.7.0` `x_salsa20_poly1305` module exports the encrypt side and the shared-secret lifecycle listed above. Its doc comments reference decryption, but no `x_salsa20_poly1305_decrypt` appears in the module's public surface at that version. Check the crate you are actually building against before designing a round trip, and if you need it and it is missing, decrypt client-side instead of in the zome.

## What none of this gives you

- **Encryption is not access control.** A DHT authority still stores and gossips your ciphertext, sees its size, sees who authored it and when, and sees the link graph around it. Metadata leaks even when content does not.
- **Signing is not identity.** A signature proves control of a key at some moment. Binding a key to a person is a separate problem, and 0.7 does not solve it in the SDK. See the DeepKey note in `architecture.md`.
- **Validation cannot decrypt.** `validate()` is pure and has no keystore access, so it can check a signature but never inspect encrypted content. Design your invariants around what stays in the clear.

## Related

- `access-control.md` for capability grants, which govern who may call your functions rather than who may read your data.
- `patterns.md` for private entries, which keep data off the DHT entirely and are usually the simpler answer.
