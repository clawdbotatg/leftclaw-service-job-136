import { VaultBundle } from "./bundleVersion";

const PREFIX = "vault-bundle-";

const safeStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export function getCachedBundle(vaultId: string): VaultBundle | null {
  const ss = safeStorage();
  if (!ss) return null;
  try {
    const raw = ss.getItem(`${PREFIX}${vaultId}`);
    if (!raw) return null;
    return JSON.parse(raw) as VaultBundle;
  } catch {
    return null;
  }
}

export function setCachedBundle(vaultId: string, bundle: VaultBundle): void {
  const ss = safeStorage();
  if (!ss) return;
  try {
    ss.setItem(`${PREFIX}${vaultId}`, JSON.stringify(bundle));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function clearCachedBundle(vaultId: string): void {
  const ss = safeStorage();
  if (!ss) return;
  try {
    ss.removeItem(`${PREFIX}${vaultId}`);
  } catch {
    /* ignore */
  }
}

export function clearAllCaches(): void {
  const ss = safeStorage();
  if (!ss) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach(k => ss.removeItem(k));
  } catch {
    /* ignore */
  }
}
