import { cn } from "@/lib/utils";

type Props = {
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
};

/**
 * Senator page header: blue uppercase eyebrow → bold sans title (NO trailing
 * dot, NO serif/italic) → optional subtitle in mid-ink, with an actions slot.
 * Any <em> passed in the title is rendered bold-non-italic (the old italic-
 * emphasis pattern is neutralised app-wide here per the Senator visual lock).
 */
export function PageHead({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="flex max-w-2xl flex-col">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[2px] text-gold-deep">
          {eyebrow}
        </p>
        <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-1.5px] text-ink sm:text-[40px] lg:text-[44px] [&_em]:font-extrabold [&_em]:not-italic">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 text-[15px] leading-relaxed text-ink-mid">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
