export const VAULT_PARSER_VERSION = 1;
export const VAULT_METADATA_VERSION = "2.0";

export type VaultBundleFile = {
  name: string;
  size: number;
  type: string;
  encrypted: true;
  // Optional: base64-encoded payload of the file (encrypted at the bundle level
  // along with the rest of the JSON). Stored inline so the bundle is fully
  // self-contained and matches the spec of "encrypted before it leaves your
  // device" — the server never sees plaintext.
  data?: string;
};

export type VaultBundle = {
  bundleVersion: 1;
  createdAt: number;
  note?: string;
  thumbnail?: string;
  files: VaultBundleFile[];
};

export class UnsupportedBundleVersion extends Error {
  constructor(version: unknown) {
    super(`Unsupported bundle version: ${String(version)}`);
    this.name = "UnsupportedBundleVersion";
  }
}

export function parseBundle(json: unknown): VaultBundle {
  if (!json || typeof json !== "object") {
    throw new Error("Bundle is not an object");
  }
  const obj = json as Record<string, unknown>;
  const version = obj.bundleVersion;
  if (version !== VAULT_PARSER_VERSION) {
    throw new UnsupportedBundleVersion(version);
  }
  if (typeof obj.createdAt !== "number") {
    throw new Error("Bundle missing createdAt");
  }
  if (!Array.isArray(obj.files)) {
    throw new Error("Bundle missing files array");
  }
  return obj as unknown as VaultBundle;
}
