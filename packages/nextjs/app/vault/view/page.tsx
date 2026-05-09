"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Address as AddressDisplay, AddressInput } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { Address as ViemAddress } from "viem";
import { base } from "viem/chains";
import { useAccount, useSignMessage } from "wagmi";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { VaultBundle } from "~~/lib/bundleVersion";
import { getCategory } from "~~/lib/categoryConfig";
import { clearCachedBundle, getCachedBundle, setCachedBundle } from "~~/lib/sessionCache";
import { buildSignMessage, decryptBundle, deriveKey } from "~~/lib/vaultCrypto";
import { getVaultStatus } from "~~/lib/vaultStatus";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

const fetchEncrypted = async (uri: string): Promise<string> => {
  let url = uri;
  if (uri.startsWith("ipfs://")) {
    url = IPFS_GATEWAY + uri.slice("ipfs://".length);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch encrypted bundle (${res.status})`);
  return res.text();
};

const formatDate = (sec: bigint): string => {
  if (sec === 0n) return "Permanent";
  return new Date(Number(sec) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const VaultView: NextPage = () => {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-6 py-20 text-[var(--vault-muted)]">Loading…</div>}>
      <VaultViewInner />
    </Suspense>
  );
};

const VaultViewInner = () => {
  const search = useSearchParams();
  const idParam = search.get("id");
  const tokenId = idParam ? BigInt(idParam) : undefined;
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const { data: vault, refetch: refetchVault } = useScaffoldReadContract({
    contractName: "VaultIDV2",
    functionName: "vaults",
    args: tokenId !== undefined ? [tokenId] : [undefined as unknown as bigint],
  });

  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "VaultIDV2" });

  const [bundle, setBundle] = useState<VaultBundle | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [showOverflow, setShowOverflow] = useState(false);

  // Re-collapse and clear bundle on tokenId change
  useEffect(() => {
    setBundle(null);
    setUnlockError(null);
    if (tokenId !== undefined) {
      const cached = getCachedBundle(tokenId.toString());
      if (cached) setBundle(cached);
    }
  }, [tokenId]);

  if (!idParam) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h1 className="font-serif text-3xl text-[var(--vault-text)]">Missing vault id.</h1>
        <Link href="/vault" className="link text-[var(--vault-text)]">
          ← Back to your vaults
        </Link>
      </div>
    );
  }

  if (!vault) {
    return <div className="max-w-3xl mx-auto px-6 py-20 text-[var(--vault-muted)]">Loading vault…</div>;
  }

  const [
    holder,
    backupWallet,
    encryptedContentURI,
    title,
    category,
    icon,
    publicDescription,
    mintedAt,
    expiresAt,
    burned,
  ] = vault as readonly [`0x${string}`, `0x${string}`, string, string, number, string, string, bigint, bigint, boolean];

  const cat = getCategory(category);
  const status = getVaultStatus(expiresAt, burned);
  const displayIcon = icon || cat.icon;

  const isOwner = address?.toLowerCase() === holder.toLowerCase();
  const isBackup = address?.toLowerCase() === backupWallet?.toLowerCase() && backupWallet !== ZERO_ADDRESS;
  const canUnlock = isOwner || isBackup;

  const onUnlock = async () => {
    if (!tokenId) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const signature = await signMessageAsync({ message: buildSignMessage(title) });
      const key = await deriveKey(signature);
      const encrypted = await fetchEncrypted(encryptedContentURI);
      const b = await decryptBundle(encrypted, key);
      setBundle(b);
      setCachedBundle(tokenId.toString(), b);
    } catch (e) {
      setUnlockError(getParsedError(e));
    } finally {
      setUnlocking(false);
    }
  };

  const onLockAgain = () => {
    if (!tokenId) return;
    setBundle(null);
    clearCachedBundle(tokenId.toString());
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 w-full">
      {/* Header */}
      <div className="flex items-start gap-4 mb-2">
        <div className="text-5xl">{displayIcon}</div>
        <div className="flex-1">
          <h1 className="font-serif text-4xl text-[var(--vault-text)] m-0 leading-tight">
            {title || "Untitled vault"}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
            <span className="text-sm text-[var(--vault-muted)]">{cat.name}</span>
            <span className="text-sm text-[var(--vault-muted)]">·</span>
            <span className="text-sm text-[var(--vault-muted)]">Vault #{tokenId?.toString()}</span>
          </div>
        </div>
        {isOwner && !burned && (
          <div className="relative">
            <button
              onClick={() => setShowOverflow(o => !o)}
              className="btn btn-ghost btn-sm normal-case text-[var(--vault-muted)]"
              aria-label="More options"
            >
              ⋯
            </button>
            {showOverflow && (
              <div className="absolute right-0 top-full mt-1 bg-[var(--vault-surface)] border border-[#2a2a2f] rounded shadow-md z-10 min-w-[200px] py-1">
                {expiresAt !== 0n && (
                  <ExtendExpiryItem
                    onDone={async () => {
                      setShowOverflow(false);
                      await refetchVault();
                    }}
                    tokenId={tokenId!}
                    writeContractAsync={writeContractAsync}
                  />
                )}
                <ChangeBackupItem
                  onDone={async () => {
                    setShowOverflow(false);
                    await refetchVault();
                  }}
                  tokenId={tokenId!}
                  current={backupWallet}
                  writeContractAsync={writeContractAsync}
                />
                <DeleteVaultItem
                  onDone={async () => {
                    setShowOverflow(false);
                    await refetchVault();
                  }}
                  tokenId={tokenId!}
                  writeContractAsync={writeContractAsync}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status pill */}
      <div className="mt-4">
        <span
          className="text-xs uppercase tracking-wider px-2 py-1 rounded-full"
          style={{ color: status.accent, borderColor: status.accent, borderWidth: 1 }}
        >
          {status.label}
        </span>
      </div>

      {/* Public section */}
      <section className="mt-8 vault-card p-6">
        <h2 className="text-sm uppercase tracking-wider text-[var(--vault-muted)] mt-0 mb-4 font-sans font-medium">
          Public details
        </h2>

        {publicDescription && <p className="text-[var(--vault-text)] m-0 mb-4">{publicDescription}</p>}

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
          <div>
            <dt className="text-[var(--vault-muted)]">Owner</dt>
            <dd className="m-0 mt-1">
              <AddressDisplay address={holder} chain={base} />
            </dd>
          </div>
          <div>
            <dt className="text-[var(--vault-muted)]">Recovery key</dt>
            <dd className="m-0 mt-1">
              {backupWallet && backupWallet !== ZERO_ADDRESS ? (
                <AddressDisplay address={backupWallet} chain={base} />
              ) : (
                <span className="text-[var(--vault-muted)]">No recovery key</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--vault-muted)]">Created</dt>
            <dd className="m-0 mt-1 text-[var(--vault-text)]">{formatDate(mintedAt)}</dd>
          </div>
          <div>
            <dt className="text-[var(--vault-muted)]">Expires</dt>
            <dd className="m-0 mt-1 text-[var(--vault-text)]">
              {expiresAt === 0n ? "Permanent" : `${formatDate(expiresAt)} · ${status.humanizedRelative}`}
            </dd>
          </div>
        </dl>
        <div className="mt-4">
          <Link href={`/verify?id=${tokenId?.toString()}`} className="link text-sm text-[var(--vault-text)]">
            View public verify page →
          </Link>
        </div>
      </section>

      {/* Private section */}
      <section className="mt-6 vault-card p-6">
        <h2 className="text-sm uppercase tracking-wider text-[var(--vault-muted)] mt-0 mb-4 font-sans font-medium">
          Vault contents
        </h2>

        {!bundle ? (
          <div>
            {!canUnlock && (
              <p className="text-[var(--vault-muted)] m-0 mb-4">
                You can only unlock this vault from the owner&apos;s wallet
                {backupWallet && backupWallet !== ZERO_ADDRESS ? " or its recovery key" : ""}.
              </p>
            )}
            {isBackup && (
              <p className="text-xs text-[var(--vault-muted)] m-0 mb-4">
                You are the recovery key for this vault. Unlocking will sign a message with your wallet.
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary normal-case"
              onClick={onUnlock}
              disabled={!canUnlock || unlocking || burned}
            >
              {unlocking ? "Unlocking…" : "Unlock contents"}
            </button>
            {unlockError && <p className="text-sm text-[#FCA5A5] mt-3 m-0">{unlockError}</p>}
            {burned && <p className="text-sm text-[var(--vault-muted)] mt-3 m-0">This vault has been deleted.</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--vault-muted)]">Decrypted on this device</span>
              <button
                type="button"
                onClick={onLockAgain}
                className="text-xs text-[var(--vault-muted)] hover:text-[var(--vault-text)] underline-offset-4 hover:underline"
              >
                Lock again
              </button>
            </div>
            {bundle.note && (
              <div>
                <h3 className="text-sm uppercase tracking-wider text-[var(--vault-muted)] m-0 mb-2 font-sans font-medium">
                  Note
                </h3>
                <p className="whitespace-pre-wrap text-[var(--vault-text)] m-0">{bundle.note}</p>
              </div>
            )}
            {bundle.files.length > 0 && (
              <div>
                <h3 className="text-sm uppercase tracking-wider text-[var(--vault-muted)] m-0 mb-2 font-sans font-medium">
                  Files
                </h3>
                <ul className="flex flex-col gap-3 list-none p-0 m-0">
                  {bundle.files.map((f, i) => {
                    const dataUrl = f.data ? `data:${f.type || "application/octet-stream"};base64,${f.data}` : null;
                    const isImage = f.type?.startsWith("image/");
                    return (
                      <li key={i} className="flex flex-col gap-1">
                        <div className="text-sm text-[var(--vault-text)] flex justify-between gap-2">
                          <span className="truncate">{f.name}</span>
                          <span className="text-[var(--vault-muted)] text-xs shrink-0">
                            {(f.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        {isImage && dataUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={dataUrl} alt={f.name} className="max-h-64 rounded border border-[#2a2a2f]" />
                        )}
                        {dataUrl && (
                          <a
                            href={dataUrl}
                            download={f.name}
                            className="link text-xs text-[var(--vault-text)] self-start"
                          >
                            Download
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {!bundle.note && bundle.files.length === 0 && (
              <p className="text-[var(--vault-muted)] m-0">This vault is empty.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

const ExtendExpiryItem = ({
  tokenId,
  writeContractAsync,
  onDone,
}: {
  tokenId: bigint;
  writeContractAsync: ReturnType<typeof useScaffoldWriteContract<"VaultIDV2">>["writeContractAsync"];
  onDone: () => Promise<void> | void;
}) => {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const seconds = BigInt(days) * 86_400n;
      await writeContractAsync({
        functionName: "extendExpiry",
        args: [tokenId, seconds],
      });
      notification.success(`Extended by ${days} days`);
      await onDone();
    } catch (e) {
      notification.error(getParsedError(e));
    } finally {
      setSubmitting(false);
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        className="block w-full text-left px-3 py-2 text-sm hover:bg-[#25252A] text-[var(--vault-text)]"
        onClick={() => setOpen(true)}
      >
        Extend expiry…
      </button>
    );
  }

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      <label className="text-xs text-[var(--vault-muted)]">Add days (max 365)</label>
      <input
        type="number"
        min={1}
        max={365}
        value={days}
        onChange={e => setDays(Math.max(1, Math.min(365, Number(e.target.value))))}
        className="px-2 py-1 rounded bg-[#0E0E10] border border-[#2a2a2f] text-sm text-[var(--vault-text)]"
      />
      <button className="btn btn-sm btn-primary normal-case" onClick={submit} disabled={submitting}>
        {submitting ? "Extending…" : "Extend"}
      </button>
    </div>
  );
};

const ChangeBackupItem = ({
  tokenId,
  current,
  writeContractAsync,
  onDone,
}: {
  tokenId: bigint;
  current: `0x${string}`;
  writeContractAsync: ReturnType<typeof useScaffoldWriteContract<"VaultIDV2">>["writeContractAsync"];
  onDone: () => Promise<void> | void;
}) => {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>(current === ZERO_ADDRESS ? "" : current);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const target = (val.trim() ? val : ZERO_ADDRESS) as ViemAddress;
      await writeContractAsync({
        functionName: "setBackupWallet",
        args: [tokenId, target],
      });
      notification.success("Recovery key updated");
      await onDone();
    } catch (e) {
      notification.error(getParsedError(e));
    } finally {
      setSubmitting(false);
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        className="block w-full text-left px-3 py-2 text-sm hover:bg-[#25252A] text-[var(--vault-text)]"
        onClick={() => setOpen(true)}
      >
        Change recovery key…
      </button>
    );
  }

  return (
    <div className="px-3 py-2 flex flex-col gap-2 max-w-[260px]">
      <label className="text-xs text-[var(--vault-muted)]">New recovery key (blank = remove)</label>
      <AddressInput value={val} onChange={(v: string) => setVal(v)} placeholder="0x… or vitalik.eth" />
      <p className="text-[10px] text-[var(--vault-muted)] m-0">
        If you lose access to both your wallet and recovery key, your encrypted vault contents may be unrecoverable.
      </p>
      <button className="btn btn-sm btn-primary normal-case" onClick={submit} disabled={submitting}>
        {submitting ? "Saving…" : "Save"}
      </button>
    </div>
  );
};

const DeleteVaultItem = ({
  tokenId,
  writeContractAsync,
  onDone,
}: {
  tokenId: bigint;
  writeContractAsync: ReturnType<typeof useScaffoldWriteContract<"VaultIDV2">>["writeContractAsync"];
  onDone: () => Promise<void> | void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await writeContractAsync({
        functionName: "burn",
        args: [tokenId],
      });
      notification.success("Vault deleted");
      await onDone();
    } catch (e) {
      notification.error(getParsedError(e));
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  if (!confirming) {
    return (
      <button
        className="block w-full text-left px-3 py-2 text-sm hover:bg-[#25252A] text-[#FCA5A5]"
        onClick={() => setConfirming(true)}
      >
        Delete vault…
      </button>
    );
  }

  return (
    <div className="px-3 py-2 flex flex-col gap-2">
      <p className="text-xs text-[var(--vault-muted)] m-0">
        Deletion is permanent. The on-chain record stays as Deleted.
      </p>
      <div className="flex gap-2">
        <button className="btn btn-sm btn-outline normal-case" onClick={() => setConfirming(false)}>
          Cancel
        </button>
        <button
          className="btn btn-sm normal-case"
          style={{ backgroundColor: "#EF4444", color: "#0E0E10", borderColor: "#EF4444" }}
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
};

export default VaultView;
