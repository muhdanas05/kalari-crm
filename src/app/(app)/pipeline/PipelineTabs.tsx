"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Kanban, List } from "@/components/icons";
import { cn } from "@/lib/utils";

type Props = {
  pipelines: { key: string; name: string; count?: number }[];
  active: string;
  view: "board" | "list" | null;
};

export function PipelineTabs({ pipelines, active, view }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    router.push(`/pipeline?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        className="flex items-center gap-1 rounded-lg border border-line bg-paper-deep p-0.5"
        role="tablist"
      >
        {pipelines.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={p.key === active}
            onClick={() => setParam("p", p.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
              p.key === active
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-mid hover:text-ink",
            )}
          >
            {p.name}
            {p.count != null && (
              <span className="font-mono text-[10.5px] text-ink-faint">
                {p.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* View switch — hidden on mobile, where the list is simply the view. */}
      <div className="hidden items-center gap-1 rounded-lg border border-line bg-paper-deep p-0.5 sm:flex">
        <ViewBtn
          label="Board"
          icon={Kanban}
          active={view !== "list"}
          onClick={() => setParam("view", "board")}
        />
        <ViewBtn
          label="List"
          icon={List}
          active={view === "list"}
          onClick={() => setParam("view", "list")}
        />
      </div>
    </div>
  );
}

function ViewBtn({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist",
        active ? "bg-surface text-ink shadow-sm" : "text-ink-mid hover:text-ink",
      )}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
