import { type LucideIcon, TrendingUp, TrendingDown, ArrowRight } from "@/components/icons";
import { cn } from "@/lib/utils";

export type StatAccent = "default" | "ok" | "warn" | "alert" | "info";

type Props = {
  label: string;
  value: React.ReactNode;
  /** Plain supporting line under the metric (TRE's original API). */
  sub?: string;
  icon?: LucideIcon;
  className?: string;
  // ── Senator-foundation extras (all optional, backwards compatible) ──
  /** Short delta pill, e.g. "+12%". */
  delta?: string;
  trend?: "up" | "down" | "flat";
  /** For "good when going down" metrics (e.g. lead time) — flips the accent. */
  invertTrend?: boolean;
  /** Forces the accent tone; otherwise derived from trend + invert. */
  accent?: StatAccent;
  /** Tiny inline sparkline (values 0–100). */
  spark?: number[];
};

const ACCENT: Record<
  StatAccent,
  { chipBg: string; chipFg: string; pillBg: string; pillFg: string }
> = {
  default: {
    chipBg: "bg-accent-mist",
    chipFg: "text-accent",
    pillBg: "bg-paper-deep",
    pillFg: "text-ink-mid",
  },
  ok: { chipBg: "bg-ok/10", chipFg: "text-ok", pillBg: "bg-ok/12", pillFg: "text-ok" },
  warn: {
    chipBg: "bg-warn/12",
    chipFg: "text-warn",
    pillBg: "bg-warn/12",
    pillFg: "text-warn",
  },
  alert: {
    chipBg: "bg-alert-pale",
    chipFg: "text-alert",
    pillBg: "bg-alert/10",
    pillFg: "text-alert",
  },
  info: {
    chipBg: "bg-info-pale",
    chipFg: "text-info",
    pillBg: "bg-info-pale",
    pillFg: "text-info",
  },
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  className,
  delta,
  trend,
  invertTrend,
  accent,
  spark,
}: Props) {
  const resolvedAccent: StatAccent =
    accent ??
    (trend === "up"
      ? invertTrend
        ? "alert"
        : "ok"
      : trend === "down"
        ? invertTrend
          ? "ok"
          : "alert"
        : "default");
  const a = ACCENT[resolvedAccent];

  return (
    <div className="group relative rounded-xl border border-line bg-surface p-5 shadow-floating soft-elev-hover">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-gold-deep font-semibold">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl shrink-0",
              a.chipBg,
              a.chipFg
            )}
          >
            <Icon size={16} strokeWidth={2} />
          </span>
        ) : (
          <ArrowRight
            size={13}
            className="text-ink-ghost transition-all group-hover:translate-x-0.5 group-hover:text-accent"
          />
        )}
      </div>

      {/*
        Sized to the longest thing this card actually holds: a compact money
        figure like "₹37.9k". JetBrains Mono is ~0.6em per glyph, so at the
        old 42px that needed ~230px inside a ~190px card and wrapped onto two
        lines — "INR" on one, "37.9k" on the next. nowrap makes any future
        overflow visible as clipping (a bug you can see) rather than as a
        silent, plausible-looking second line.
      */}
      <div className="mt-4 overflow-hidden whitespace-nowrap font-mono text-[34px] font-black leading-none tracking-tight tabular-nums text-ink-strong">
        {value}
      </div>

      {(delta || spark || sub) && (
        <div className="mt-4 flex items-center justify-between gap-3">
          {delta ? (
            <>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                a.pillBg,
                a.pillFg
              )}
            >
              {trend === "up" && <TrendingUp size={11} strokeWidth={2.5} />}
              {trend === "down" && <TrendingDown size={11} strokeWidth={2.5} />}
              <span>{delta}</span>
            </span>
            <span className="text-[11px] text-ink-faint font-medium">vs previous 30 days</span>
            </>
          ) : (
            sub && <p className="text-[12px] font-medium text-ink-mid">{sub}</p>
          )}
          {spark && (
            <svg
              viewBox={`0 0 ${(spark.length - 1) * 10} 28`}
              className="ml-auto h-6 w-20"
              preserveAspectRatio="none"
            >
              <polyline
                points={spark
                  .map((v, i) => `${i * 10},${28 - (v / 100) * 24 - 2}`)
                  .join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(a.pillFg, "opacity-60")}
              />
            </svg>
          )}
        </div>
      )}

      {/* When a delta pill is shown, still surface `sub` beneath it. */}
      {delta && sub && (
        <p className="mt-2 text-[12px] font-medium text-ink-mid">{sub}</p>
      )}
    </div>
  );
}
