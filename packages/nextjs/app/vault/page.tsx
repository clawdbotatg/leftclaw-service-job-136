"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import deployedContracts from "~~/contracts/deployedContracts";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { CATEGORIES, getCategory } from "~~/lib/categoryConfig";
import { getVaultStatus } from "~~/lib/vaultStatus";

const VAULT_CONTRACT = deployedContracts[8453].VaultIDV2;

type VaultRow = {
  tokenId: bigint;
  holder: `0x${string}`;
  backupWallet: `0x${string}`;
  encryptedContentURI: string;
  title: string;
  category: number;
  icon: string;
  publicDescription: string;
  mintedAt: bigint;
  expiresAt: bigint;
  burned: boolean;
};

function VaultCardFetcher({
  tokenId,
  address,
  filterCategory,
}: {
  tokenId: bigint;
  address: string;
  filterCategory: number | "all";
}) {
  const { data } = useScaffoldReadContract({
    contractName: "VaultIDV2",
    functionName: "vaults",
    args: [tokenId],
    watch: false,
  });

  if (!data) return null;

  const r = data as readonly [string, string, string, string, number, string, string, bigint, bigint, boolean];
  const vault: VaultRow = {
    tokenId,
    holder: r[0] as `0x${string}`,
    backupWallet: r[1] as `0x${string}`,
    encryptedContentURI: r[2],
    title: r[3],
    category: r[4],
    icon: r[5],
    publicDescription: r[6],
    mintedAt: r[7],
    expiresAt: r[8],
    burned: r[9],
  };

  // Only render if vault belongs to current address
  if (vault.holder.toLowerCase() !== address.toLowerCase()) return null;
  // Only render if matches filter
  if (filterCategory !== "all" && vault.category !== filterCategory) return null;

  return <VaultCardDisplay vault={vault} />;
}

const VaultLibrary: NextPage = () => {
  const { address, isConnected } = useAccount();
  const [filterCategory, setFilterCategory] = useState<number | "all">("all");

  const { data: events, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "VaultIDV2",
    eventName: "VaultMinted",
    fromBlock: BigInt(VAULT_CONTRACT.deployedOnBlock ?? 0),
    filters: address ? { holder: address } : undefined,
    watch: true,
    enabled: Boolean(address),
  });

  const tokenIds = useMemo(() => {
    if (!events) return [] as bigint[];
    const ids = events
      .map(e => (e.args as { tokenId?: bigint }).tokenId)
      .filter((x): x is bigint => typeof x === "bigint");
    // unique + ascending
    return Array.from(new Set(ids.map(b => b.toString())))
      .map(s => BigInt(s))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }, [events]);

  if (!isConnected) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 w-full text-center">
        <h1 className="font-serif text-4xl text-[var(--vault-text)] mb-2">Your vaults.</h1>
        <p className="text-[var(--vault-muted)] mb-8">Your encrypted vault library lives here.</p>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button onClick={openConnectModal} className="btn btn-primary normal-case">
              Connect wallet
            </button>
          )}
        </ConnectButton.Custom>
      </div>
    );
  }

  const isLoading = eventsLoading;
  const totalLabel = tokenIds.length === 1 ? "1 vault" : `${tokenIds.length} vaults`;

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 w-full">
      <div className="flex items-end justify-between mb-2 flex-wrap gap-2">
        <h1 className="font-serif text-4xl text-[var(--vault-text)] mb-0">Your vaults.</h1>
        <span className="text-sm text-[var(--vault-muted)]">{isLoading ? "Loading…" : totalLabel}</span>
      </div>

      {/* Filter */}
      <div className="flex gap-1 flex-wrap mt-4 mb-8 border-b border-[#1f1f23]">
        <FilterTab
          label="All"
          active={filterCategory === "all"}
          onClick={() => setFilterCategory("all")}
          color="#F5F4F1"
        />
        {CATEGORIES.map(c => (
          <FilterTab
            key={c.id}
            label={c.name}
            active={filterCategory === c.id}
            onClick={() => setFilterCategory(c.id)}
            color={c.color}
          />
        ))}
      </div>

      {/* Empty state */}
      {!isLoading && tokenIds.length === 0 && (
        <div className="vault-card p-10 text-center">
          <p className="text-[var(--vault-muted)] mb-4 m-0">Nothing here yet.</p>
          <Link href="/create" className="link text-[var(--vault-text)]">
            + Create your first vault →
          </Link>
        </div>
      )}

      {/* Grid */}
      {tokenIds.length > 0 && address && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tokenIds.map(id => (
            <VaultCardFetcher key={id.toString()} tokenId={id} address={address} filterCategory={filterCategory} />
          ))}
        </div>
      )}
    </div>
  );
};

const FilterTab = ({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-2 text-sm transition-colors border-b-2 -mb-px ${
      active ? "text-[var(--vault-text)]" : "text-[var(--vault-muted)] hover:text-[var(--vault-text)]"
    }`}
    style={{ borderBottomColor: active ? color : "transparent" }}
  >
    {label}
  </button>
);

const VaultCardDisplay = ({ vault }: { vault: VaultRow }) => {
  const cat = getCategory(vault.category);
  const status = getVaultStatus(vault.expiresAt, vault.burned);
  const displayIcon = vault.icon || cat.icon;

  return (
    <Link
      href={`/vault/view?id=${vault.tokenId.toString()}`}
      className="vault-card p-5 flex flex-col gap-3 relative overflow-hidden border-l-4 hover:border-l-4"
      style={{ borderLeftColor: cat.color }}
    >
      <div className="flex items-start justify-between">
        <div className="text-3xl">{displayIcon}</div>
        <span
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ color: status.accent, borderColor: status.accent, borderWidth: 1 }}
        >
          {status.label}
        </span>
      </div>
      <div>
        <h3 className="font-serif text-xl text-[var(--vault-text)] m-0 mb-1 leading-tight truncate">
          {vault.title || "Untitled"}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-[var(--vault-muted)]">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
          {cat.name}
        </div>
      </div>
      <div className="text-xs text-[var(--vault-muted)] mt-auto flex justify-between items-end">
        <span className="opacity-70">{status.humanizedRelative}</span>
        <span>Vault #{vault.tokenId.toString()}</span>
      </div>
    </Link>
  );
};

export default VaultLibrary;
