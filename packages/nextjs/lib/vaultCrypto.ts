import { VaultBundle, parseBundle } from "./bundleVersion";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const getCrypto = (): SubtleCrypto => {
  if (typeof globalThis === "undefined" || !globalThis.crypto?.subtle) {
    throw new Error("Web Crypto API is not available. VaultID requires a modern browser with Web Crypto support.");
  }
  return globalThis.crypto.subtle;
};

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex signature");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === "function") return btoa(binary);
  // Node fallback (build-time prerender).
  return Buffer.from(bytes).toString("base64");
};

const base64ToBytes = (b64: string): Uint8Array => {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
};

export async function deriveKey(signature: string): Promise<CryptoKey> {
  const subtle = getCrypto();
  const sigBytes = hexToBytes(signature);
  const hash = await subtle.digest("SHA-256", sigBytes);
  return subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptBundle(bundle: VaultBundle, key: CryptoKey): Promise<string> {
  const subtle = getCrypto();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(bundle));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return JSON.stringify({
    v: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  });
}

export async function decryptBundle(encryptedJson: string, key: CryptoKey): Promise<VaultBundle> {
  const subtle = getCrypto();
  let parsed: { iv: string; ciphertext: string };
  try {
    parsed = JSON.parse(encryptedJson);
  } catch {
    throw new Error("Encrypted payload is not valid JSON");
  }
  if (!parsed?.iv || !parsed?.ciphertext) {
    throw new Error("Encrypted payload missing iv or ciphertext");
  }
  const iv = base64ToBytes(parsed.iv);
  const ct = base64ToBytes(parsed.ciphertext);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  } catch {
    throw new Error(
      "Decryption failed. The signature did not produce the right key — please make sure you signed with the same wallet that created this vault.",
    );
  }
  const json = JSON.parse(textDecoder.decode(plaintext));
  return parseBundle(json);
}

/** The exact message format used to derive the vault encryption key. */
export const buildSignMessage = (vaultTitle: string): string =>
  `Decrypt VaultID #\n\nThis signature is used to derive your encryption key.\n\nVault title: ${vaultTitle}`;
