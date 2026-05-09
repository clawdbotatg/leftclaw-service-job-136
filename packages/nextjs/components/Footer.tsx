import React from "react";
import Link from "next/link";

export const Footer = () => {
  return (
    <footer className="w-full border-t border-[#1f1f23] py-6 px-4 mt-16">
      <div className="max-w-6xl mx-auto text-center text-sm text-[var(--vault-muted)]">
        Built on Base · Powered by CLAWD ·{" "}
        <Link href="/verify" className="link text-[var(--vault-text)]">
          Verify any vault →
        </Link>
      </div>
    </footer>
  );
};
