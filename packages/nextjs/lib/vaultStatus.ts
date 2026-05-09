export type VaultStatus = "Permanent" | "Active" | "ExpiringSoon" | "ExpiringImminent" | "Expired" | "Deleted";

export type VaultStatusInfo = {
  status: VaultStatus;
  label: string;
  accent: string;
  daysRemaining: number | null;
  expiresAt: bigint;
  humanizedRelative: string;
};

const SECONDS_PER_DAY = 86_400n;

const humanizeDays = (days: number): string => {
  if (days <= 0) return "today";
  if (days === 1) return "in 1 day";
  if (days < 30) return `in ${days} days`;
  const months = Math.floor(days / 30);
  if (months === 1) return "in 1 month";
  if (months < 12) return `in ${months} months`;
  const years = Math.floor(days / 365);
  if (years === 1) return "in 1 year";
  return `in ${years} years`;
};

const humanizePast = (days: number): string => {
  const abs = Math.abs(days);
  if (abs === 0) return "today";
  if (abs === 1) return "1 day ago";
  if (abs < 30) return `${abs} days ago`;
  const months = Math.floor(abs / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(abs / 365);
  if (years === 1) return "1 year ago";
  return `${years} years ago`;
};

export function getVaultStatus(expiresAt: bigint, burned: boolean): VaultStatusInfo {
  if (burned) {
    return {
      status: "Deleted",
      label: "Deleted",
      accent: "#6B7280",
      daysRemaining: null,
      expiresAt,
      humanizedRelative: "deleted",
    };
  }

  if (expiresAt === 0n) {
    return {
      status: "Permanent",
      label: "Permanent",
      accent: "#10B981",
      daysRemaining: null,
      expiresAt,
      humanizedRelative: "never expires",
    };
  }

  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const diffSeconds = expiresAt - nowSeconds;

  if (diffSeconds <= 0n) {
    const daysAgo = Number(diffSeconds / SECONDS_PER_DAY);
    return {
      status: "Expired",
      label: "Expired",
      accent: "#6B7280",
      daysRemaining: daysAgo,
      expiresAt,
      humanizedRelative: humanizePast(daysAgo),
    };
  }

  const days = Number(diffSeconds / SECONDS_PER_DAY);

  if (days <= 7) {
    return {
      status: "ExpiringImminent",
      label: "Expiring",
      accent: "#EF4444",
      daysRemaining: days,
      expiresAt,
      humanizedRelative: humanizeDays(days),
    };
  }

  if (days <= 30) {
    return {
      status: "ExpiringSoon",
      label: "Expiring soon",
      accent: "#F59E0B",
      daysRemaining: days,
      expiresAt,
      humanizedRelative: humanizeDays(days),
    };
  }

  return {
    status: "Active",
    label: "Active",
    accent: "#10B981",
    daysRemaining: days,
    expiresAt,
    humanizedRelative: humanizeDays(days),
  };
}
