"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Small, plain building blocks for the staff pages (literate users, desktop or phone). */
export function Card({ title, children, actions, testId }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm" data-testid={testId}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-primary text-white hover:bg-primary-dark",
    secondary: "border border-line bg-white text-ink hover:bg-paper",
    danger: "bg-danger text-white",
  }[variant];
  return <button type="button" {...props} className={`min-h-11 rounded-xl px-4 py-2 text-base font-semibold disabled:opacity-50 ${styles} ${className}`} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "info"; children: ReactNode }) {
  const styles = { neutral: "bg-line text-ink", good: "bg-good-soft text-good", warn: "bg-accent-soft text-accent", info: "bg-primary-soft text-primary-dark" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-sm font-semibold ${styles}`}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}

export const inputClass = "min-h-11 rounded-xl border border-line bg-white px-3 text-base font-normal";

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error"; children: ReactNode }) {
  const styles = { info: "bg-primary-soft text-primary-dark", warn: "bg-accent-soft text-accent", error: "bg-danger-soft text-danger" }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-sm font-medium ${styles}`}>
      {children}
    </p>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-semibold text-primary underline-offset-2 hover:underline">
      ← {children}
    </Link>
  );
}

/** A scrollable table that stays usable on a phone. */
export function Table({ head, rows, empty, testId }: { head: ReactNode[]; rows: ReactNode[][]; empty: string; testId?: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-2 py-2 font-semibold text-ink-soft">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-2 py-2 align-top">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Shown wherever AI-generated text appears to staff. */
export function AiUnverified() {
  return <Badge tone="warn">AI-generated, unverified</Badge>;
}

/** Shown wherever the AET mapping appears. */
export const AET_NOTICE = "AET alignment is a proposed mapping, not accredited. It requires review by an accredited AET specialist before use in any funding, certification or reporting context.";
