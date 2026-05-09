# VaultID V2 — Next steps for the operator

Before deploying or running this site against real users, configure the
following environment variables (in `.env.local` for local dev, and in your
deployment provider — Vercel/IPFS/etc — for production):

## Required

### `NEXT_PUBLIC_UPLOAD_WORKER_URL`

URL of the Cloudflare Worker (or other HTTP endpoint) that pins encrypted
vault payloads. The frontend POSTs JSON of the form:

```json
{ "title": "<vault title>", "payload": "<encrypted bundle JSON>" }
```

The worker must respond with JSON containing a `cid` field, e.g.

```json
{ "cid": "bafy..." }
```

If the worker also returns an absolute `uri` or `url`, the frontend will use
that verbatim (otherwise it stores `ipfs://<cid>` on-chain).

If this variable is unset, `/create` shows a clear inline warning and refuses
to submit.

## Optional

- `NEXT_PUBLIC_PRODUCTION_URL` — used to build social card / OG image URLs.
- `NEXT_PUBLIC_BASE_RPC_URL` — RPC endpoint for Base. Defaults to Alchemy.
- `NEXT_PUBLIC_ALCHEMY_API_KEY` — your own Alchemy key (recommended).
- `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` — your own WalletConnect project id.

## Contract addresses (already wired)

- `VaultIDV2`: `0xe03ae28c814058fa0747b3644f8e1e4314cd7eb0` (Base, chain id 8453)
- `CLAWD`: `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` (18 decimals)
- CV token: read live from `VaultIDV2.cvToken()`. The "Pay with CV" option is
  hidden until the contract owner calls `setCvToken(...)`.
