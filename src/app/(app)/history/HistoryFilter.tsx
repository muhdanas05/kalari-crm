"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle } from "@/components/icons";
import { cn } from "@/lib/utils";

const SOURCES = [
  { key: "all", label: "Everything" },
  { key: "activity", label: "Data changes" },
  { key: "automation", label: "Automations" },
  { key: "email", label: "Email" },
  { key: "call", label: "Calls" },
];

export function HistoryFilter({
  source,
  errorsOnly,
}: {
  source: string;
  errorsOnly: boolean;
}) {
  const router = useRouter();

  const go = (next: { source?: string; errors?: boolean }) => {
    const p = new URLSearchParams();
    const s = next.source ?? source;
    const e = next.errors ?? errorsOnly;
    if (s && s !== "all") p.set("source", s);
    if (e) p.set("errors", "1");
    router.push(p.toString() ? `/history?${p}` : "/history", { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            onClick={() => go({ source: s.key })}
            aria-pressed={source === s.key}
            className={cn(
              "h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
              source === s.key
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-ink-mid hover:border-line-strong hover:text-ink",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => go({ errors: !errorsOnly })}
        aria-pressed={errorsOnly}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
          errorsOnly
            ? "border-alert bg-alert text-white"
            : "border-line bg-surface text-ink-mid hover:border-alert hover:text-alert",
        )}
      >
        <AlertTriangle size={13} />
        Errors only
      </button>
    </div>
  );
}
