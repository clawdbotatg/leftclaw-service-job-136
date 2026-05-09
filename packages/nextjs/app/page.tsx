"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { CATEGORIES } from "~~/lib/categoryConfig";

const Home: NextPage = () => {
  return (
    <div className="flex flex-col grow">
      {/* Hero */}
      <section className="px-6 pt-20 pb-16 max-w-5xl mx-auto w-full">
        <h1 className="font-serif text-5xl md:text-7xl font-semibold tracking-tight text-[var(--vault-text)] mb-4">
          Proof, passes, memories.
        </h1>
        <p className="text-xl md:text-2xl text-[var(--vault-muted)] mb-10 max-w-2xl">
          Encrypted vaults you actually own.
        </p>
        <Link href="/create" className="inline-block btn btn-primary btn-lg font-sans normal-case">
          Create your first vault.
        </Link>
      </section>

      {/* Value props */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full grid md:grid-cols-3 gap-6">
        {[
          { title: "Public ownership.", body: "Private contents." },
          { title: "Yours forever,", body: "on Base." },
          { title: "Encrypted before", body: "it leaves your device." },
        ].map((vp, i) => (
          <div key={i} className="vault-card p-6">
            <h3 className="font-serif text-2xl text-[var(--vault-text)] mb-1">{vp.title}</h3>
            <p className="text-[var(--vault-muted)] m-0">{vp.body}</p>
          </div>
        ))}
      </section>

      {/* Category grid */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full">
        <h2 className="font-serif text-3xl md:text-4xl text-[var(--vault-text)] mb-2">What you can store.</h2>
        <p className="text-[var(--vault-muted)] mb-8">Nine categories. One vault per slice of your life.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {CATEGORIES.map(c => (
            <div
              key={c.id}
              className="vault-card p-5 flex flex-col gap-1 border-l-4"
              style={{ borderLeftColor: c.color }}
            >
              <div className="text-3xl mb-1">{c.icon}</div>
              <div className="font-serif text-xl text-[var(--vault-text)]">{c.name}</div>
              <div className="text-sm text-[var(--vault-muted)]">{c.useCase}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full">
        <h2 className="font-serif text-3xl md:text-4xl text-[var(--vault-text)] mb-8">How it works.</h2>
        <ol className="grid md:grid-cols-3 gap-6">
          {[
            {
              n: "1",
              t: "Choose what to store",
              d: "Pick a category, add details.",
            },
            {
              n: "2",
              t: "Encrypt & create",
              d: "Encrypted on your device, minted on Base.",
            },
            {
              n: "3",
              t: "Your vault, forever",
              d: "Only your wallet can unlock it.",
            },
          ].map(s => (
            <li key={s.n} className="vault-card p-6 list-none">
              <div className="text-[var(--vault-muted)] text-sm mb-2">Step {s.n}</div>
              <h3 className="font-serif text-2xl text-[var(--vault-text)] mb-1">{s.t}</h3>
              <p className="text-[var(--vault-muted)] m-0">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-6 py-12 max-w-5xl mx-auto w-full text-center">
        <p className="text-sm text-[var(--vault-muted)] m-0">
          Built on Base · Powered by CLAWD ·{" "}
          <Link href="/verify" className="link text-[var(--vault-text)]">
            Verify any vault →
          </Link>
        </p>
      </section>
    </div>
  );
};

export default Home;
