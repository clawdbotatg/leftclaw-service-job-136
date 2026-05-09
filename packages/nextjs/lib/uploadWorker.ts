/**
 * Uploads an encrypted vault payload to the configured Cloudflare Worker
 * pinning service. Returns the resulting CID and a fully-qualified URI we can
 * store on-chain (`ipfs://...` if the worker returns a CID, or a plain HTTP(S)
 * URL if it returns one of those).
 *
 * The worker URL is read from `NEXT_PUBLIC_UPLOAD_WORKER_URL`. If unset, this
 * function throws a clear, actionable error so the user — not just the
 * developer — knows what to do.
 */
export class UploadWorkerNotConfiguredError extends Error {
  constructor() {
    super(
      "Upload service is not configured. Set NEXT_PUBLIC_UPLOAD_WORKER_URL in your environment to enable vault uploads.",
    );
    this.name = "UploadWorkerNotConfiguredError";
  }
}

export class UploadWorkerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "UploadWorkerError";
    this.status = status;
  }
}

export type UploadResult = { cid: string; uri: string };

const normalizeUri = (cid: string, returnedUri?: string): string => {
  if (returnedUri && /^(ipfs:|https?:)/i.test(returnedUri)) return returnedUri;
  return `ipfs://${cid}`;
};

export async function uploadBundle(encryptedBundle: string, vaultTitle: string): Promise<UploadResult> {
  const workerUrl = process.env.NEXT_PUBLIC_UPLOAD_WORKER_URL;
  if (!workerUrl) {
    throw new UploadWorkerNotConfiguredError();
  }

  let res: Response;
  try {
    res = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: vaultTitle,
        payload: encryptedBundle,
      }),
    });
  } catch (e) {
    throw new UploadWorkerError(0, `Network error uploading vault: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new UploadWorkerError(res.status, `Upload failed (${res.status}): ${text || res.statusText}`);
  }

  let body: { cid?: string; uri?: string; url?: string };
  try {
    body = await res.json();
  } catch {
    throw new UploadWorkerError(res.status, "Upload worker returned invalid JSON");
  }

  const cid = body.cid;
  if (!cid) {
    throw new UploadWorkerError(res.status, "Upload worker response missing CID");
  }

  return { cid, uri: normalizeUri(cid, body.uri ?? body.url) };
}

export const isUploadWorkerConfigured = (): boolean => {
  return Boolean(process.env.NEXT_PUBLIC_UPLOAD_WORKER_URL);
};
