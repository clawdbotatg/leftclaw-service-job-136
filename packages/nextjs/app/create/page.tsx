"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AddressInput } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { Address as ViemAddress } from "viem";
import { useAccount, usePublicClient, useSignMessage, useSwitchChain } from "wagmi";
import {
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTransactor,
  useWriteAndOpen,
} from "~~/hooks/scaffold-eth";
import { VAULT_PARSER_VERSION, VaultBundle, VaultBundleFile } from "~~/lib/bundleVersion";
import { CATEGORIES, CategoryId, getCategory } from "~~/lib/categoryConfig";
import { isUploadWorkerConfigured, uploadBundle } from "~~/lib/uploadWorker";
import { buildSignMessage, deriveKey, encryptBundle } from "~~/lib/vaultCrypto";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

const BASE_CHAIN_ID = 8453;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const VAULT_ADDRESS = "0xe03ae28c814058fa0747b3644f8e1e4314cd7eb0";
const CLAWD_COST = 100_000n * 10n ** 18n;
const CV_COST = 1_000_000n * 10n ** 18n;
const MAX_FILE_BYTES = 1_000_000; // 1 MB cap per file (kept inline)

type SubmitState =
  | { kind: "idle" }
  | { kind: "encrypting" }
  | { kind: "uploading" }
  | { kind: "approving" }
  | { kind: "creating" }
  | { kind: "success"; tokenId: string }
  | { kind: "error"; message: string; technical?: string };

const FieldLabel = ({ children, badge }: { children: React.ReactNode; badge?: string }) => (
  <div className="flex items-baseline gap-2 mb-1.5">
    <label className="text-sm font-medium text-[var(--vault-text)]">{children}</label>
    {badge && (
      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#25252A] text-[var(--vault-muted)]">
        {badge}
      </span>
    )}
  </div>
);

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-[var(--vault-muted)] mt-1.5 mb-0">{children}</p>
);

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const r = String(reader.result ?? "");
      const idx = r.indexOf(",");
      resolve(idx >= 0 ? r.slice(idx + 1) : r);
    };
    reader.readAsDataURL(file);
  });

const Create: NextPage = () => {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const writeTx = useTransactor();
  const { writeAndOpen } = useWriteAndOpen();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });

  const { writeContractAsync: writeVault } = useScaffoldWriteContract({ contractName: "VaultIDV2" });
  const { writeContractAsync: writeCLAWD } = useScaffoldWriteContract({ contractName: "CLAWD" });

  // Form state
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CategoryId>(8);
  const [icon, setIcon] = useState("");
  const [publicDescription, setPublicDescription] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string>("");
  const [tokenChoice, setTokenChoice] = useState<"CLAWD" | "CV">("CLAWD");

  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const [showTechnical, setShowTechnical] = useState(false);

  // Read CV token availability
  const { data: cvTokenAddress } = useScaffoldReadContract({
    contractName: "VaultIDV2",
    functionName: "cvToken",
  });
  const cvAvailable = cvTokenAddress && cvTokenAddress !== ZERO_ADDRESS;

  // Read CLAWD allowance
  const { data: clawdAllowance, refetch: refetchAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [address, VAULT_ADDRESS as ViemAddress],
  });
  const { data: clawdBalance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "balanceOf",
    args: [address],
  });

  // Reset CV token choice if becomes unavailable
  useEffect(() => {
    if (!cvAvailable && tokenChoice === "CV") setTokenChoice("CLAWD");
  }, [cvAvailable, tokenChoice]);

  const cost = tokenChoice === "CV" ? CV_COST : CLAWD_COST;
  const needsApproval = tokenChoice === "CLAWD" && (clawdAllowance === undefined || clawdAllowance < cost);

  const titleValid = title.trim().length > 0 && title.trim().length <= 64;
  const descValid = publicDescription.length <= 256;
  const iconValid = new TextEncoder().encode(icon).length <= 8;

  const formValid = titleValid && descValid && iconValid && (!expiryEnabled || expiryDate.length > 0);

  const buttonDisabled = useMemo(() => {
    if (!isConnected) return false;
    if (chainId !== BASE_CHAIN_ID) return false;
    if (!formValid) return true;
    if (
      state.kind === "encrypting" ||
      state.kind === "uploading" ||
      state.kind === "approving" ||
      state.kind === "creating"
    ) {
      return true;
    }
    return false;
  }, [chainId, formValid, isConnected, state.kind]);

  const onApprove = async () => {
    setState({ kind: "approving" });
    try {
      await writeAndOpen(async () => {
        await writeTx(async () => {
          const hash = await writeCLAWD({
            functionName: "approve",
            args: [VAULT_ADDRESS as ViemAddress, CLAWD_COST],
          });
          return hash as `0x${string}`;
        });
      });
      await refetchAllowance();
      notification.success("CLAWD approved");
      setState({ kind: "idle" });
    } catch (e) {
      const msg = getParsedError(e);
      notification.error(msg);
      setState({ kind: "error", message: "Approval failed.", technical: msg });
    }
  };

  const onSubmit = async () => {
    if (!address) return;
    if (!isUploadWorkerConfigured()) {
      setState({
        kind: "error",
        message: "Upload service not configured. Set NEXT_PUBLIC_UPLOAD_WORKER_URL and rebuild.",
      });
      return;
    }
    setShowTechnical(false);

    try {
      // Build bundle
      setState({ kind: "encrypting" });

      // Files (encoded as base64). Cap each file individually.
      const bundleFiles: VaultBundleFile[] = [];
      for (const f of files) {
        if (f.size > MAX_FILE_BYTES) {
          throw new Error(
            `File "${f.name}" is ${(f.size / 1024).toFixed(0)} KB — files must be under ${(MAX_FILE_BYTES / 1024).toFixed(0)} KB.`,
          );
        }
        const data = await fileToBase64(f);
        bundleFiles.push({
          name: f.name,
          size: f.size,
          type: f.type,
          encrypted: true,
          data,
        });
      }

      const bundle: VaultBundle = {
        bundleVersion: VAULT_PARSER_VERSION,
        createdAt: Math.floor(Date.now() / 1000),
        note: note.trim() || undefined,
        files: bundleFiles,
      };

      // Sign and derive key
      const signature = await signMessageAsync({ message: buildSignMessage(title.trim()) });
      const key = await deriveKey(signature);
      const encrypted = await encryptBundle(bundle, key);

      // Upload
      setState({ kind: "uploading" });
      const { uri } = await uploadBundle(encrypted, title.trim());
      if (uri.length > 256) {
        throw new Error("Upload returned a URI over 256 chars; cannot store on-chain.");
      }

      // Build params
      const expiresAt = expiryEnabled && expiryDate ? BigInt(Math.floor(new Date(expiryDate).getTime() / 1000)) : 0n;

      const backupWallet = (recoveryOpen && recoveryKey ? recoveryKey : ZERO_ADDRESS) as ViemAddress;

      const params = {
        backupWallet,
        encryptedContentURI: uri,
        title: title.trim(),
        category: Number(category),
        icon: icon.trim(),
        publicDescription: publicDescription.trim(),
        expiresAt,
      } as const;

      setState({ kind: "creating" });

      let txHash: `0x${string}` | undefined;
      await writeAndOpen(async () => {
        txHash = await writeVault({
          functionName: tokenChoice === "CV" ? "mintWithCV" : "mintWithCLAWD",
          args: [params],
        });
      });

      if (!txHash) throw new Error("Transaction did not return a hash");

      // Resolve token ID from receipt
      let tokenId = "";
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
          // Transfer event: topic[3] is tokenId (indexed). The third indexed topic.
          const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() === VAULT_ADDRESS.toLowerCase() && log.topics[0] === transferTopic) {
              const idHex = log.topics[3];
              if (idHex) {
                tokenId = BigInt(idHex).toString();
                break;
              }
            }
          }
        } catch {
          /* not fatal — we still succeeded */
        }
      }

      notification.success("Vault created");
      setState({ kind: "success", tokenId });
    } catch (e) {
      const msg = getParsedError(e);
      console.error(e);
      notification.error(msg);
      setState({ kind: "error", message: friendlyError(msg), technical: msg });
    }
  };

  // ----- Render -----
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 w-full">
      <h1 className="font-serif text-4xl text-[var(--vault-text)] mb-2">Create vault.</h1>
      <p className="text-[var(--vault-muted)] mb-8 m-0">
        Public details show on the verify page. Vault contents are encrypted on this device before they leave it.
      </p>

      {!isUploadWorkerConfigured() && (
        <Banner kind="warning">
          Upload service not configured. The site administrator must set <code>NEXT_PUBLIC_UPLOAD_WORKER_URL</code> for
          new vaults to be created. You can still fill in the form to preview the flow.
        </Banner>
      )}

      <form
        className="flex flex-col gap-6"
        onSubmit={e => {
          e.preventDefault();
          if (needsApproval) onApprove();
          else onSubmit();
        }}
      >
        {/* Title */}
        <div>
          <FieldLabel badge="Public — visible to anyone">Vault title</FieldLabel>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={64}
            placeholder="e.g. Concert ticket — Aphex Twin"
            className="w-full px-3 py-2 rounded bg-[var(--vault-surface)] text-[var(--vault-text)] border border-[#2a2a2f] focus:outline-none focus:border-[var(--vault-text)] transition-colors"
          />
          <div className="flex justify-between">
            <Hint>
              These details are public and may appear on the verify page. Do not include private information here.
            </Hint>
            <span className="text-xs text-[var(--vault-muted)] mt-1.5 ml-3 shrink-0">{title.length}/64</span>
          </div>
        </div>

        {/* Category */}
        <div>
          <FieldLabel badge="Public">Category</FieldLabel>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {CATEGORIES.map(c => {
              const active = category === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCategory(c.id as CategoryId)}
                  className={`p-2 rounded text-xs flex flex-col items-center gap-1 border transition-colors ${
                    active
                      ? "border-[var(--vault-text)] bg-[var(--vault-surface)]"
                      : "border-[#2a2a2f] bg-transparent hover:border-[var(--vault-muted)]"
                  }`}
                  style={active ? { borderLeftColor: c.color, borderLeftWidth: "3px" } : undefined}
                >
                  <span className="text-xl">{c.icon}</span>
                  <span className="text-[var(--vault-text)]">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Icon */}
        <div>
          <FieldLabel badge="Public">Icon</FieldLabel>
          <input
            type="text"
            value={icon}
            onChange={e => setIcon(e.target.value)}
            placeholder={getCategory(category).icon}
            className="w-full px-3 py-2 rounded bg-[var(--vault-surface)] text-[var(--vault-text)] border border-[#2a2a2f] focus:outline-none focus:border-[var(--vault-text)] transition-colors"
          />
          <Hint>Up to 8 bytes. Defaults to the category icon if left blank.</Hint>
          {!iconValid && (
            <p className="text-xs text-[var(--color-error,#EF4444)] mt-1">Icon is too long (max 8 bytes).</p>
          )}
        </div>

        {/* Public description */}
        <div>
          <FieldLabel badge="Public — visible to anyone">Public description</FieldLabel>
          <textarea
            value={publicDescription}
            onChange={e => setPublicDescription(e.target.value)}
            maxLength={256}
            rows={3}
            placeholder="Optional. What is this vault about? (visible to anyone)"
            className="w-full px-3 py-2 rounded bg-[var(--vault-surface)] text-[var(--vault-text)] border border-[#2a2a2f] focus:outline-none focus:border-[var(--vault-text)] transition-colors"
          />
          <div className="flex justify-between">
            <Hint>
              These details are public and may appear on the verify page. Do not include private information here.
            </Hint>
            <span className="text-xs text-[var(--vault-muted)] mt-1.5 ml-3 shrink-0">
              {publicDescription.length}/256
            </span>
          </div>
        </div>

        {/* Separator */}
        <div className="flex items-center gap-3 my-2">
          <div className="h-px flex-1 bg-[#25252A]" />
          <span className="text-xs uppercase tracking-wider text-[var(--vault-muted)]">
            Encrypted contents — only unlockable by approved wallet keys.
          </span>
          <div className="h-px flex-1 bg-[#25252A]" />
        </div>

        {/* Note */}
        <div>
          <FieldLabel>Private note</FieldLabel>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={4}
            placeholder="Encrypted. Only you can read it."
            className="w-full px-3 py-2 rounded bg-[var(--vault-surface)] text-[var(--vault-text)] border border-[#2a2a2f] focus:outline-none focus:border-[var(--vault-text)] transition-colors"
          />
          <Hint>Encrypted. Only you can read it.</Hint>
        </div>

        {/* Files */}
        <div>
          <FieldLabel>Files</FieldLabel>
          <label
            className="flex flex-col items-center justify-center px-4 py-8 rounded border border-dashed border-[#2a2a2f] cursor-pointer hover:border-[var(--vault-muted)] transition-colors"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              if (e.dataTransfer.files) {
                setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
              }
            }}
          >
            <input
              type="file"
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files) {
                  setFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]);
                  e.target.value = "";
                }
              }}
            />
            <span className="text-sm text-[var(--vault-muted)]">
              Click or drop files here. Encrypted on your device before upload.
            </span>
          </label>
          {files.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {files.map((f, i) => (
                <li key={i} className="text-xs text-[var(--vault-muted)] flex justify-between items-center">
                  <span>
                    {f.name} <span className="opacity-60">({(f.size / 1024).toFixed(1)} KB)</span>
                  </span>
                  <button
                    type="button"
                    className="text-[var(--vault-muted)] hover:text-[var(--vault-text)] transition-colors"
                    onClick={() => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Expiry */}
        <div>
          <FieldLabel>Expiry</FieldLabel>
          <div className="flex gap-2">
            <button
              type="button"
              className={`px-4 py-2 rounded text-sm border transition-colors ${
                !expiryEnabled
                  ? "border-[var(--vault-text)] bg-[var(--vault-surface)]"
                  : "border-[#2a2a2f] hover:border-[var(--vault-muted)]"
              }`}
              onClick={() => setExpiryEnabled(false)}
            >
              Permanent
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded text-sm border transition-colors ${
                expiryEnabled
                  ? "border-[var(--vault-text)] bg-[var(--vault-surface)]"
                  : "border-[#2a2a2f] hover:border-[var(--vault-muted)]"
              }`}
              onClick={() => setExpiryEnabled(true)}
            >
              Expires on…
            </button>
            {expiryEnabled && (
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="ml-2 px-3 py-2 rounded bg-[var(--vault-surface)] text-[var(--vault-text)] border border-[#2a2a2f] focus:outline-none focus:border-[var(--vault-text)] transition-colors"
              />
            )}
          </div>
        </div>

        {/* Recovery key */}
        <div>
          <button
            type="button"
            onClick={() => setRecoveryOpen(o => !o)}
            className="text-sm text-[var(--vault-text)] underline-offset-4 hover:underline"
          >
            {recoveryOpen ? "Hide" : "Add"} recovery key (optional)
          </button>
          {recoveryOpen && (
            <div className="mt-3 vault-card p-4">
              <FieldLabel>Recovery key (optional)</FieldLabel>
              <AddressInput
                value={recoveryKey}
                onChange={(v: string) => setRecoveryKey(v)}
                placeholder="0x… or vitalik.eth"
              />
              <p className="text-xs text-[var(--vault-muted)] mt-3 mb-0">
                If you lose access to both your wallet and recovery key, your encrypted vault contents may be
                unrecoverable.
              </p>
            </div>
          )}
        </div>

        {/* Token choice */}
        {cvAvailable && (
          <div>
            <FieldLabel>Pay with</FieldLabel>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTokenChoice("CLAWD")}
                className={`px-4 py-2 rounded text-sm border transition-colors ${
                  tokenChoice === "CLAWD"
                    ? "border-[var(--vault-text)] bg-[var(--vault-surface)]"
                    : "border-[#2a2a2f] hover:border-[var(--vault-muted)]"
                }`}
              >
                CLAWD (100,000)
              </button>
              <button
                type="button"
                onClick={() => setTokenChoice("CV")}
                className={`px-4 py-2 rounded text-sm border transition-colors ${
                  tokenChoice === "CV"
                    ? "border-[var(--vault-text)] bg-[var(--vault-surface)]"
                    : "border-[#2a2a2f] hover:border-[var(--vault-muted)]"
                }`}
              >
                CV (1,000,000)
              </button>
            </div>
          </div>
        )}

        {/* Balance hint */}
        {tokenChoice === "CLAWD" && address && clawdBalance !== undefined && (
          <p className="text-xs text-[var(--vault-muted)] m-0">
            Your CLAWD balance: {(Number(clawdBalance) / 1e18).toLocaleString()}
          </p>
        )}

        {/* Error / Status banners */}
        {state.kind === "error" && (
          <Banner kind="error">
            <div>{state.message}</div>
            {state.technical && (
              <div className="mt-2">
                <button
                  type="button"
                  className="text-xs underline-offset-4 hover:underline text-[var(--vault-muted)]"
                  onClick={() => setShowTechnical(s => !s)}
                >
                  {showTechnical ? "Hide" : "Show"} technical details
                </button>
                {showTechnical && (
                  <pre className="mt-2 text-xs whitespace-pre-wrap text-[var(--vault-muted)] bg-[#0b0b0d] p-2 rounded">
                    {state.technical}
                  </pre>
                )}
              </div>
            )}
          </Banner>
        )}

        {state.kind === "success" && (
          <Banner kind="success">
            <div className="font-medium text-[var(--vault-text)]">Vault created.</div>
            {state.tokenId ? (
              <Link
                href={`/vault/view?id=${state.tokenId}`}
                className="link text-[var(--vault-text)] mt-1 inline-block"
              >
                Open Vault #{state.tokenId} →
              </Link>
            ) : (
              <Link href="/vault" className="link text-[var(--vault-text)] mt-1 inline-block">
                See your vaults →
              </Link>
            )}
          </Banner>
        )}

        {/* Submit area */}
        <div className="pt-2">
          <SubmitButton
            isConnected={isConnected}
            chainId={chainId}
            switchChain={() => switchChain({ chainId: BASE_CHAIN_ID })}
            needsApproval={needsApproval}
            state={state}
            disabled={buttonDisabled}
            tokenChoice={tokenChoice}
          />
        </div>
      </form>
    </div>
  );
};

const SubmitButton = ({
  isConnected,
  chainId,
  switchChain,
  needsApproval,
  state,
  disabled,
  tokenChoice,
}: {
  isConnected: boolean;
  chainId?: number;
  switchChain: () => void;
  needsApproval: boolean;
  state: SubmitState;
  disabled: boolean;
  tokenChoice: "CLAWD" | "CV";
}) => {
  if (!isConnected) {
    return (
      <ConnectButton.Custom>
        {({ openConnectModal }) => (
          <button type="button" onClick={openConnectModal} className="btn btn-primary w-full normal-case">
            Connect wallet to create
          </button>
        )}
      </ConnectButton.Custom>
    );
  }
  if (chainId !== BASE_CHAIN_ID) {
    return (
      <button type="button" onClick={() => switchChain()} className="btn btn-primary w-full normal-case">
        Switch to Base
      </button>
    );
  }

  const label = (() => {
    if (state.kind === "encrypting") return "Encrypting…";
    if (state.kind === "uploading") return "Uploading…";
    if (state.kind === "approving") return "Approving CLAWD…";
    if (state.kind === "creating") return "Creating vault…";
    if (needsApproval) return `Approve ${tokenChoice}`;
    return "Create vault";
  })();

  return (
    <button type="submit" disabled={disabled} className="btn btn-primary w-full normal-case disabled:opacity-50">
      {label}
    </button>
  );
};

const Banner = ({ kind, children }: { kind: "warning" | "error" | "success"; children: React.ReactNode }) => {
  const colors =
    kind === "error"
      ? "border-[#EF4444] text-[#FCA5A5]"
      : kind === "success"
        ? "border-[#10B981] text-[#6EE7B7]"
        : "border-[#F59E0B] text-[#FCD34D]";
  return (
    <div className={`vault-card p-4 border ${colors}`} role="alert">
      <div className="text-sm">{children}</div>
    </div>
  );
};

const friendlyError = (msg: string): string => {
  const lower = msg.toLowerCase();
  if (lower.includes("user rejected") || lower.includes("user denied")) return "You cancelled the request.";
  if (lower.includes("insufficient") && lower.includes("balance")) return "Insufficient balance.";
  if (lower.includes("insufficient") && lower.includes("allowance"))
    return "Token allowance is too low. Please approve first.";
  if (lower.includes("titletoolong")) return "Title is too long.";
  if (lower.includes("uritoolong")) return "Encrypted bundle URI is too long.";
  if (lower.includes("descriptiontoolong")) return "Public description is too long.";
  if (lower.includes("icontoolong")) return "Icon is too long.";
  if (lower.includes("backupequalsholder")) return "Recovery key cannot be the same as your wallet.";
  return "Something went wrong.";
};

export default Create;
