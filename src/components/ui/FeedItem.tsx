import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  icon: ReactNode;
  tone?: "default" | "ok" | "alert" | "warn";
  children: ReactNode;
  time?: string;
};

const toneMap = {
  default: "bg-accent-pale text-accent",
  ok: "bg-ok/10 text-ok",
  alert: "bg-alert-pale text-alert",
  warn: "bg-warn/15 text-warn",
};

export function FeedItem({ icon, tone = "default", children, time }: Props) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-line last:border-b-0">
      <div
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5",
          toneMap[tone]
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink-soft leading-snug">{children}</div>
        {time && (
          <div className="mt-1 text-[11px] font-mono text-ink-faint">{time}</div>
        )}
      </div>
    </div>
  );
}
