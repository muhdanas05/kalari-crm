"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Undo2 } from "@/components/icons";
import { unarchiveEntity, type ArchiveKind } from "../archive-actions";

/**
 * Undo an archive. Archiving used to be permanent in practice — nothing in the
 * app could clear `archived_at`, so a mis-click made a customer untypeable
 * forever. Small and inline because it lives on a row in the archived list.
 */
export function RestoreButton({ kind, id }: { kind: ArchiveKind; id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        start(async () => {
          const res = await unarchiveEntity(kind, id);
          if (!res.ok) return toast(res.error, "error");
          toast("Restored.", "ok");
          router.refresh();
        });
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink-mid transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
    >
      <Undo2 size={13} />
      {pending ? "Restoring…" : "Restore"}
    </button>
  );
}
