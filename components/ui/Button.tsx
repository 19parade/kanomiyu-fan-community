import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-foreground hover:brightness-95",
  secondary: "border border-border bg-surface text-foreground hover:bg-background",
  ghost: "text-foreground hover:bg-surface",
};

/**
 * D2 shared button styling. Exported as a plain className builder (not just
 * a <button>) so it can be reused on next/link's <Link> for primary CTAs —
 * this site routes most "buttons" through Link, not <button type="submit">
 * (see signup-form.tsx / login-form.tsx for the actual form submit buttons,
 * which are intentionally left untouched in this phase).
 */
export function buttonClassName(variant: ButtonVariant = "primary", className = ""): string {
  return [BASE, VARIANTS[variant], className].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClassName(variant, className)} {...props} />;
}
