"use client";

import { Switch } from "@/components/ui/Switch";
import { setStageEmail } from "./actions";

type Row = {
  stage_id: string;
  key: string;
  name: string;
  enabled: boolean;
};

/**
 * "on some selected stages i want to send them emails also as reminders"
 *
 * Defaults are the customer-visible milestones (PSK Appointment, Ticket
 * Issued, Travel Docs Shared, Group Allocated, Visa Received, Passport
 * Dispatched, Voucher Sent, Complete) — the ones a
 * customer is actually waiting on. Emailing all nine is how a business teaches
 * its customers to filter it, and the portal link already tells them everything
 * whenever they want it.
 */
export function StageEmailToggles({ stages }: { stages: Row[] }) {
  const on = stages.filter((s) => s.enabled).length;

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="mb-1 text-base font-bold tracking-[-0.2px] text-ink">
        Which stages email the customer
        <span className="ml-2 font-mono text-[12px] font-medium text-ink-faint">
          {on}/{stages.length}
        </span>
      </h2>
      <p className="mb-4 text-[12px] font-medium text-ink-faint">
        Everyone gets one message when their case opens, with a link to their own
        tracking page. These are the extra emails on top of that.
      </p>

      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {stages.map((s) => (
          <label
            key={s.stage_id}
            className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-paper"
          >
            <span className="text-[13px] font-medium text-ink">{s.name}</span>
            <Switch
              checked={s.enabled}
              size="sm"
              label={`Email on ${s.name}`}
              onToggle={(next) => setStageEmail(s.stage_id, next)}
            />
          </label>
        ))}
      </div>
    </section>
  );
}
