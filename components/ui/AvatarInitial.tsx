const SIZES = {
  sm: "h-10 w-10 text-sm",
  md: "h-14 w-14 text-lg",
  lg: "h-20 w-20 text-2xl",
} as const;

/**
 * F4-A: shared avatar fallback (no Storage bucket exists for profile
 * images yet — see F4 audit). Shows the first character of `label`
 * (display_name) inside a gradient circle, same visual treatment
 * app/me/page.tsx already uses inline. Extracted here as a reusable
 * component for /fans without touching app/me/page.tsx (an F3-B file,
 * out of scope for this phase).
 */
export function AvatarInitial({
  label,
  size = "md",
}: {
  label: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <div
      className={`flex ${SIZES[size]} shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand/20 to-accent/20 font-bold text-brand`}
      aria-hidden="true"
    >
      {label.slice(0, 1)}
    </div>
  );
}
