"use client";

import { forwardRef } from "react";
import { type LucideIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

// Senator-foundation button: a bold, fully-rounded pill. The primary
// variant carries the signature gradient-CTA treatment (blue gradient +
// coloured glow + shine-sweep on hover, via .cta-accent-gradient in
// globals.css); the rest sit on soft elevation that lifts on hover.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-all duration-200 active:scale-[0.97] ease-out disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist focus-visible:ring-offset-1";

const VARIANTS: Record<Variant, string> = {
  primary: "cta-accent-gradient text-white",
  secondary:
    "border border-line bg-surface text-ink-soft soft-elev hover:border-line-strong hover:text-ink soft-elev-hover",
  ghost: "text-ink-mid hover:bg-paper-deep hover:text-ink",
  danger:
    "border border-alert/30 bg-alert-pale text-alert hover:border-alert/60 hover:bg-alert/10",
};

// md is the default and is bumped on mobile to meet the 44px touch
// target while staying compact (h-10) on sm+. Same on desktop, more
// finger-friendly on mobile.
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12px]",
  md: "h-11 px-4 text-[13px] sm:h-10",
  lg: "h-11 px-5 text-[14px]",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    icon: Icon,
    iconPosition = "left",
    children,
    ...rest
  },
  ref
) {
  const iconSize = size === "sm" ? 14 : 15;
  return (
    <button
      ref={ref}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {Icon && iconPosition === "left" && (
        <Icon size={iconSize} strokeWidth={2.4} />
      )}
      {children}
      {Icon && iconPosition === "right" && (
        <Icon size={iconSize} strokeWidth={2.4} />
      )}
    </button>
  );
});
