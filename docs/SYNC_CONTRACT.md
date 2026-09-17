# Sync and account boundary

Version 0.4 keeps learning data on the current device. The web client creates
`LocalOnlySyncClient`, whose status is `disabled / local_only`; it never sends
IndexedDB data and never reports a successful sync. There is no login UI and no
account is created by this release.

The replaceable `@jp/sync` package defines the future API v1 boundary:

- Every progress record has a stable `id`, stable `wordId`, `userId`, integer
  `revision`, ISO 8601 `updatedAt`, optional ISO `deletedAt`, and JSON payload.
  Domain `Date` values must be converted to ISO strings before `JSON.stringify`;
  transport parsing leaves them as strings. Rehydration into domain `Date`
  values belongs to the storage adapter.
- A change set carries a client id, an idempotency key, and the cursor it was
  based on. Servers return an opaque version/token cursor and accepted keys, so
  retrying the same request is safe.
- A stale base cursor or revision mismatch is returned as a conflict with the
  current server record. The client must surface the conflict and choose an
  explicit merge; the contract does not silently overwrite a newer review.
- `HttpSyncClient` accepts an endpoint and token provider at runtime. It has an
  abort signal and timeout and does not contain credentials. It is not selected
  until account/auth wiring exists.

The expected future routes are `POST /api/v1/sync` and an authentication layer
owned by the deployment. The route must scope every read and write to the
authenticated `userId`; anonymous/local identities must be rejected by the
server. Word ids should be generated from textbook identity (book/lesson/order
or an equivalent canonical key), never from array position, so six-book content
updates do not orphan progress.

This contract intentionally leaves provider/session details to the deployment
agent. It does not implement account registration, token storage, remote upload,
or conflict UI.
