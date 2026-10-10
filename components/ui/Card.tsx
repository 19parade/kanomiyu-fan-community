import type { HTMLAttributes } from "react";

/**
 * D2 shared card surface: warm off-white surface, soft border, generous
 * rounding (D1's "angular-ish but soft" fanzine direction — rounder than
 * the site's older `rounded-md`, not as pill-like as Button).
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["rounded-2xl border border-border bg-surface", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
