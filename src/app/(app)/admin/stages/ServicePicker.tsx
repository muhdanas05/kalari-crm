"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import type { PipelineService } from "@/lib/db/stages";

export function ServicePicker({
  services,
  selected,
}: {
  services: PipelineService[];
  selected?: string;
}) {
  const router = useRouter();

  return (
    <div className="max-w-sm">
      <Select
        value={selected ?? ""}
        onChange={(id) => router.push(`/admin/stages?service=${id}`)}
        ariaLabel="Service"
        options={services.map((s) => ({ value: s.id, label: s.name }))}
        placeholder="Choose a service…"
      />
    </div>
  );
}
