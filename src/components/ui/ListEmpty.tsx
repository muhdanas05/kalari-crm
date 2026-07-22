import { type LucideIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type Props = {
  /** Phosphor glyph rendered duotone in a soft accent circle. */
  icon: LucideIcon;
  /** The (often filter-aware) message. */
  children: React.ReactNode;
  className?: string;
};

/**
 * Compact empty state for filtered list cards — a small duotone glyph in a
 * soft accent circle above the message. This is the lightweight tier; the
 * full-screen hero version (icon + headline + sub + CTA) is <EmptyState>.
 * Keeping filtered-list empties compact is deliberate: a giant hero would be
 * the wrong weight when you've simply filtered a populated list down to none.
 */
export function ListEmpty({ icon: Icon, children, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-6 py-14 text-center",
        className
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-mist text-accent">
        <Icon size={24} />
      </span>
      <p className="max-w-xs text-[13px] leading-relaxed text-ink-mid">{children}</p>
    </div>
  );
}
