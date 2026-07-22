import { type LucideIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type Action = {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
};

type Props = {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: string;
  primaryAction?: Action;
  secondaryAction?: Action;
  /** Subtle tint behind the icon chip. Defaults to accent-mist. */
  tint?: "accent" | "info" | "warn" | "alert";
  className?: string;
};

const tintMap: Record<NonNullable<Props["tint"]>, { bg: string; icon: string }> = {
  accent: { bg: "bg-accent-mist", icon: "text-accent" },
  info: { bg: "bg-info-pale", icon: "text-info" },
  warn: { bg: "bg-warn-pale", icon: "text-warn" },
  alert: { bg: "bg-alert-pale", icon: "text-alert" },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  tint = "accent",
  className,
}: Props) {
  const tones = tintMap[tint];
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-line bg-surface px-6 py-16 text-center shadow-floating",
        className
      )}
    >
      <div
        className={cn(
          "mb-5 flex h-16 w-16 items-center justify-center rounded-2xl",
          tones.bg
        )}
      >
        <Icon size={32} className={tones.icon} />
      </div>
      <h3 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.8px] text-ink">
        {title}
      </h3>
      {description && (
        <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink-mid">
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-accent-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {primaryAction.icon && (
                <primaryAction.icon size={15} strokeWidth={2.4} />
              )}
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-5 text-[13px] font-semibold text-ink-soft transition-colors hover:border-line-strong hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              {secondaryAction.icon && (
                <secondaryAction.icon size={15} strokeWidth={2.2} />
              )}
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
