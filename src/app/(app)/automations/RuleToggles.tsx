"use client";

import { Switch } from "@/components/ui/Switch";
import { setSetting } from "./actions";
import type { Database } from "@/lib/supabase/database.types";

type Setting = Database["public"]["Tables"]["automation_settings"]["Row"];

const LABELS: Record<string, { name: string; hint: string }> = {
  "email.enabled": {
    name: "Send email",
    hint: "Master switch. Off means everything becomes a call task instead — the system still works.",
  },
  "email.sandbox": {
    name: "Sandbox",
    hint: "Write every email to the log instead of sending it. Safe for testing.",
  },
  "rule.case_opened": {
    name: "Case opened → portal link",
    hint: "One message when a case opens, carrying their tracking link.",
  },
  "rule.stage_changed": {
    name: "Stage updates",
    hint: "Only the stages switched on below. Once per stage, ever.",
  },
  "rule.docs_missing": {
    name: "Documents outstanding",
    hint: "Email, then a call task after 3 days.",
  },
  "rule.invoice_issued": {
    name: "Invoice issued",
    hint: "Email the invoice the moment it is issued.",
  },
  "rule.invoice_unpaid": {
    name: "Payment reminders",
    hint: "Every 3 days, maximum 5. Stops the moment they pay.",
  },
  "rule.invoice_overdue": {
    name: "Overdue",
    hint: "Email and a high-priority call. Money late always gets a human.",
  },
  "rule.quote_unanswered": {
    name: "Quote unanswered",
    hint: "Call task after 3 days.",
  },
  "rule.case_stuck": {
    name: "Stuck cases",
    hint: "No movement in 7 days raises a call task. Never emails the customer.",
  },
  "rule.renewal_due": {
    name: "Renewal at 22 months",
    hint: "The repeat-business engine. Needs the visa issue date from Stamping.",
  },
  "rule.case_complete": {
    name: "Case complete",
    hint: "Thank you when the file closes.",
  },
  "rule.reengagement": {
    name: "Re-engagement",
    hint: "Promotional — will not send without a logged consent record.",
  },
};

export function RuleToggles({ settings }: { settings: Setting[] }) {
  const shown = settings.filter((s) => LABELS[s.key]);
  const master = shown.filter((s) => s.key.startsWith("email."));
  const rules = shown.filter((s) => s.key.startsWith("rule."));

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="mb-1 text-base font-bold tracking-[-0.2px] text-ink">
        What runs
      </h2>
      <p className="mb-4 text-[12px] font-medium text-ink-faint">
        Each of these can be switched off on its own.
      </p>

      <div className="mb-5 flex flex-col gap-1 border-b border-line pb-5">
        {master.map((s) => (
          <Row key={s.key} setting={s} />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {rules.map((s) => (
          <Row key={s.key} setting={s} />
        ))}
      </div>
    </section>
  );
}

function Row({ setting }: { setting: Setting }) {
  const meta = LABELS[setting.key];
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">{meta.name}</p>
        <p className="text-[11.5px] font-medium text-ink-faint">{meta.hint}</p>
      </div>
      <Switch
        checked={setting.enabled}
        label={meta.name}
        onToggle={(next) => setSetting(setting.key, next)}
      />
    </div>
  );
}
