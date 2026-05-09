# VaultID V2

**Live URL:** https://bafybeifhmk2tf4bcmwyipjk6ngsn4m673uhrt24acvuxcnkqjy5ewaqcqa.ipfs.community.bgipfs.com/

A premium personal vault product for encrypted life organization — passes, receipts, memories, warranties, medical records, recovery notes — backed by soulbound ownership on Base.

Files stay encrypted client-side. Only opt-in organizational metadata (title, category, icon, description) is public. Designed to feel like a consumer privacy product (Notion × 1Password), not an NFT dApp.

## Live Deployment

Deployed on Base (chain ID 8453). Frontend hosted on IPFS via bgipfs.

## Smart Contracts

| Contract | Address | Basescan |
|----------|---------|---------|
| VaultIDV2 | `0xe03ae28c814058fa0747b3644f8e1e4314cd7eb0` | [View on Basescan](https://basescan.org/address/0xe03ae28c814058fa0747b3644f8e1e4314cd7eb0) |
| CLAWD Token | `0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07` | [View on Basescan](https://basescan.org/address/0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07) |

### Contract architecture

- **VaultIDV2.sol** — soulbound ERC-721 (ERC-5192) with dual-token mint fees (CLAWD or CV), optional recovery wallet, soft-burn, expiry extension, and on-chain SVG tokenURI.
- Mint cost: 100,000 CLAWD or 1,000,000 CV tokens
- Ownership: `0xfe968de21eb0e77d5877477c31a04a3075c0086e` (pending `acceptOwnership()`)

## Client actions required after deployment

1. **Call `acceptOwnership()`** on VaultIDV2 to complete the Ownable2Step transfer.
2. **Call `setFeeRecipient(address)`** to set your desired fee collection address.
3. **Call `setCvToken(address)`** if you want to enable CV token minting.
4. **Configure the Cloudflare Worker**: set `NEXT_PUBLIC_UPLOAD_WORKER_URL` to your Worker endpoint.

## Frontend pages

- `/` — Homepage with hero, value props, category showcase, how-it-works
- `/create` — Multi-step vault creation with client-side AES-256-GCM encryption
- `/vault` — Library of your vaults, filterable by category
- `/vault/view?id=N` — Full vault view with encrypted unlock
- `/verify?id=N` — Public certificate page (no wallet required)

## Running Locally

```bash
yarn install
yarn fork --network base
yarn deploy
yarn start
```

## Environment Variables

```
NEXT_PUBLIC_UPLOAD_WORKER_URL=https://your-worker.workers.dev    # REQUIRED for /create
NEXT_PUBLIC_ALCHEMY_API_KEY=...                                  # optional, for RPC
NEXT_PUBLIC_PRODUCTION_URL=https://<CID>.ipfs.community.bgipfs.com  # set before IPFS rebuild
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...                        # optional
```

## Security

- Content encrypted client-side with AES-256-GCM before upload
- Soulbound: all transfer/approval functions revert with `SoulboundLocked`
- If you lose both wallet and recovery key, encrypted vault contents may be unrecoverable
- `encryptedContentURI` on-chain stores IPFS CID; tampering changes CID and breaks decryption
