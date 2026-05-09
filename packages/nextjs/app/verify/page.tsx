"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Address as AddressDisplay } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { base } from "viem/chains";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { getCategory } from "~~/lib/categoryConfig";
import { getVaultStatus } from "~~/lib/vaultStatus";

const VAULT_ADDRESS = "0xe03ae28c814058fa0747b3644f8e1e4314cd7eb0";

const formatDate = (sec: bigint): string => {
  if (sec === 0n) return "Permanent";
  return new Date(Number(sec) * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const Verify: NextPage = () => {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto px-6 py-20 text-[var(--vault-muted)]">Loading…</div>}>
      <VerifyInner />
    </Suspense>
  );
};

const VerifyInner = () => {
  const search = useSearchParams();
  const idParam = search.get("id");
  const tokenId = idParam ? BigInt(idParam) : undefined;

  const { data: vault } = useScaffoldReadContract({
    contractName: "VaultIDV2",
    functionName: "vaults",
    args: tokenId !== undefined ? [tokenId] : [undefined as unknown as bigint],
  });

  const [copied, setCopied] = useState(false);

  if (!idParam) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="font-serif text-3xl text-[var(--vault-text)] mb-2">Verify a vault.</h1>
        <p className="text-[var(--vault-muted)]">
          Append <code>?id=N</code> to this URL to view a vault&apos;s public certificate.
        </p>
        <Link href="/" className="link text-[var(--vault-text)]">
          ← Home
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

  const truncatedUri = encryptedContentURI.length > 40 ? encryptedContentURI.slice(0, 40) + "…" : encryptedContentURI;

  const copyUri = async () => {
    try {
      await navigator.clipboard.writeText(encryptedContentURI);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 w-full">
      <div className="text-xs uppercase tracking-widest text-[var(--vault-muted)] mb-2">Public certificate</div>

      <div className="flex items-start gap-4 mb-6">
        <div className="text-5xl">{displayIcon}</div>
        <div className="flex-1">
          <h1 className="font-serif text-4xl text-[var(--vault-text)] m-0 leading-tight">{title || "Untitled"}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
              style={{ borderColor: cat.color, borderWidth: 1, color: cat.color }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
              {cat.name}
            </span>
            <span
              className="text-xs uppercase tracking-wider px-2 py-1 rounded-full"
              style={{ color: status.accent, borderColor: status.accent, borderWidth: 1 }}
            >
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {publicDescription && <p className="text-[var(--vault-text)] mt-0 mb-6">{publicDescription}</p>}

      <div className="vault-card p-6 grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-sm">
        <Field label="Token ID">
          <span className="text-[var(--vault-text)]">Vault #{tokenId?.toString()}</span>
        </Field>
        <Field label="Status">
          <span style={{ color: status.accent }}>{status.label}</span>
          {expiresAt !== 0n && !burned && (
            <span className="text-[var(--vault-muted)]"> · {status.humanizedRelative}</span>
          )}
        </Field>
        <Field label="Holder">
          <AddressDisplay address={holder} chain={base} />
        </Field>
        <Field label="Recovery key">
          {backupWallet && backupWallet !== "0x0000000000000000000000000000000000000000" ? (
            <AddressDisplay address={backupWallet} chain={base} />
          ) : (
            <span className="text-[var(--vault-muted)]">none</span>
          )}
        </Field>
        <Field label="Contract">
          <a
            href={`https://basescan.org/address/${VAULT_ADDRESS}`}
            target="_blank"
            rel="noreferrer noopener"
            className="link text-[var(--vault-text)] break-all"
          >
            {VAULT_ADDRESS.slice(0, 10)}…{VAULT_ADDRESS.slice(-6)}
          </a>
        </Field>
        <Field label="Minted">
          <span className="text-[var(--vault-text)]">{formatDate(mintedAt)}</span>
        </Field>
        <Field label="Expires">
          <span className="text-[var(--vault-text)]">{formatDate(expiresAt)}</span>
        </Field>
        <Field label="Token URI">
          <div className="flex items-center gap-2">
            <code className="text-xs text-[var(--vault-text)] break-all">{truncatedUri}</code>
            <button
              type="button"
              onClick={copyUri}
              className="text-xs text-[var(--vault-muted)] hover:text-[var(--vault-text)] underline-offset-4 hover:underline shrink-0"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </Field>
      </div>

      <p className="text-xs text-[var(--vault-muted)] mt-6 italic">
        Private contents are encrypted and not shown here.
      </p>

      <div className="mt-8">
        <a
          href={`https://basescan.org/token/${VAULT_ADDRESS}?a=${tokenId?.toString()}`}
          target="_blank"
          rel="noreferrer noopener"
          className="link text-sm text-[var(--vault-text)]"
        >
          View on Basescan →
        </a>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="text-xs uppercase tracking-wider text-[var(--vault-muted)] mb-1">{label}</div>
    <div>{children}</div>
  </div>
);

export default Verify;
