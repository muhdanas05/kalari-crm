"use client";

import { useState, useTransition } from "react";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/Toast";
import { Check, Plug } from "@/components/icons";
import { requestIntegration } from "./actions";

export function IntegrationCard({
  integration,
  name,
  what,
  needs,
  alreadyRequested,
}: {
  integration: "google_ads" | "meta_ads" | "instagram";
  name: string;
  what: string;
  needs: string;
  alreadyRequested: boolean;
}) {
  const toast = useToast();
  const [requested, setRequested] = useState(alreadyRequested);
  const [pending, startTransition] = useTransition();

  const request = () => {
    startTransition(async () => {
      const res = await requestIntegration(integration);
      if (!res.ok) {
        toast(res.error, "error");
        return;
      }
      setRequested(true);
      toast("Requested — we'll be in touch.", "ok");
    });
  };

  return (
    <section className="flex flex-col rounded-xl border border-line bg-surface p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Plug size={16} className="text-ink-faint" />
          <h2 className="text-base font-bold tracking-[-0.2px] text-ink">{name}</h2>
        </span>
        <Tag tone="neutral">Coming soon</Tag>
      </div>

      <p className="text-[12.5px] font-medium text-ink-soft">{what}</p>
      <p className="mt-2 text-[11.5px] font-medium text-ink-faint">{needs}</p>

      <div className="mt-auto pt-4">
        {requested ? (
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ok">
            <Check size={14} strokeWidth={3} />
            Requested — we'll be in touch
          </p>
        ) : (
          <button
            onClick={request}
            disabled={pending}
            className="h-9 w-full rounded-full border border-line bg-surface text-[12.5px] font-semibold text-ink-soft transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {pending ? "Sending…" : "Request this"}
          </button>
        )}

        {/* §5.11: say it in the product, not just the contract. */}
        <p className="mt-3 border-t border-line pt-3 text-[11px] font-medium text-ink-ghost">
          Not included in the current build. Available as a separate module.
        </p>
      </div>
    </section>
  );
}
