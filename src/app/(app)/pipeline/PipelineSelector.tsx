"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Kanban, List } from "@/components/icons";
import { cn } from "@/lib/utils";

export const LEADS_VALUE = "leads";

type Props = {
  services: { id: string; name: string }[];
  selected: string;
  view: "board" | "list" | null;
};

/**
 * One dropdown, not a tab per pipeline: pick "New enquiries" (Sales-stage
 * leads, no service yet) or any service that tracks a pipeline, and the board
 * below renders THAT selection's own stage path — the one set up in the
 * Pipeline Stages editor — with only its own cases in each column. Replaces
 * the old sales/processing/renewal tab switcher, which mixed every service's
 * stages into one flat column list on the Processing tab.
 */
export function PipelineSelector({ services, selected, view }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(k, v);
    router.push(`/pipeline?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="max-w-xs flex-1">
        <Select
          value={selected}
          onChange={(v) => setParam("service", v)}
          ariaLabel="Service"
          options={[
            { value: LEADS_VALUE, label: "New enquiries" },
            ...services.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
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
