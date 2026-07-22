import { type LucideIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "ok" | "warn" | "alert" | "info" | "accent";

const TONES: Record<Tone, { bg: string; text: string }> = {
  neutral: { bg: "bg-paper-deep", text: "text-ink-soft" },
  ok: { bg: "bg-ok-pale", text: "text-ok" },
  warn: { bg: "bg-warn-pale", text: "text-warn" },
  alert: { bg: "bg-alert-pale", text: "text-alert" },
  info: { bg: "bg-info-pale", text: "text-info" },
  accent: { bg: "bg-accent-mist", text: "text-accent" },
};

type Props = {
  tone?: Tone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
};

export function Tag({ tone = "neutral", icon: Icon, className, children }: Props) {
  const tones = TONES[tone];
  return (
    <span
      className={cn(
        // Senator-foundation tag: a compact, chunky uppercase chip.
        "inline-flex h-[22px] items-center gap-1 rounded-md px-2.5 text-[10px] font-bold uppercase tracking-[0.1em]",
        tones.bg,
        tones.text,
        className
      )}
    >
      {Icon && <Icon size={11} strokeWidth={2.6} />}
      {children}
    </span>
  );
}
