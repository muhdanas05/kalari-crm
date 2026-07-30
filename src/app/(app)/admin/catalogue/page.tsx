import type { Metadata } from "next";
import { PageHead } from "@/components/PageHead";
import { Tag } from "@/components/ui/Tag";
import { requireAdmin } from "@/lib/auth/session";
import { getCatalogue, rulesForService } from "@/lib/db/catalogue";
import { computeTotals } from "@/lib/money";
import { buildLines } from "@/lib/pricing/engine";
import { formatPaise, formatPaiseBare } from "@/lib/money";
import { AlertTriangle, GitBranch } from "@/components/icons";
import { ServiceFormModal } from "./ServiceFormModal";
import { RuleFormModal } from "./RuleFormModal";
import { ArchiveButton } from "./ArchiveButton";

export const metadata: Metadata = { title: "Service catalogue · Kalari" };

const QTY_LABEL: Record<string, string> = {
  once: "Once",
  once_per_file: "Once per booking",
  per_person: "Per person",
};

export default async function CataloguePage() {
  await requireAdmin();
  const { services, rules } = await getCatalogue();

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Admin"
        title="Service catalogue"
        subtitle="Your rate card. Every invoice is built from these lines."
        actions={<ServiceFormModal />}
      />

      {/*
        §3.11: rate changes never alter already-issued invoices. Say it here,
        because it's the question an admin has the moment they see an edit field.
      */}
      <div className="flex items-start gap-3 rounded-xl border border-line bg-paper px-5 py-3.5">
        <AlertTriangle size={15} className="mt-px shrink-0 text-ink-faint" />
        <p className="text-[12.5px] font-medium text-ink-mid">
          Changing a rate affects <strong className="text-ink">future invoices only</strong>.
          Issued invoices keep the rate they were issued with, permanently.
        </p>
      </div>

      {/*
        HARD RULE: never invent rates. Kalari has not confirmed a single figure
        yet, so every seeded rate is a deliberately round placeholder. This
        panel is the in-app enforcement — "the rate card looks authoritative"
        is exactly how a wrong rate becomes an immutable invoice.
      */}
      <div className="rounded-xl border border-alert/40 bg-alert-pale/50 px-5 py-4">
        <p className="flex items-center gap-2 text-[13px] font-extrabold text-alert">
          <AlertTriangle size={15} className="shrink-0" />
          Every rate below is an unconfirmed placeholder
        </p>
        <p className="mt-1.5 text-[12.5px] font-medium text-ink">
          No rate has been confirmed by Kalari yet — the figures are deliberately
          round stand-ins (₹500, ₹1,000, ₹2,000…). <strong>Do not issue a real
          invoice from these numbers.</strong> Issued invoices are immutable, so a
          wrong rate becomes a permanent credit-note trail.
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-0.5 pl-4 text-[12px] font-medium text-ink-soft">
          <li>The real service charge for every service, in writing</li>
          <li>
            Ticketing &amp; hotels — is the fare / room rate itself invoiced as a
            pass-through line, or only your service fee?
          </li>
          <li>GST: registration (GSTIN), and the treatment per service — all lines
            currently carry 0% until your accountant confirms</li>
          <li>Do children pay the full per-person rate on Haj/Umrah and holidays?</li>
          <li>Package tiers (standard/premium) — do they exist, and at what rates?</li>
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        {services.map((s) => {
          const svcRules = rulesForService(rules, s.id);
          const total = computeTotals(
            buildLines(svcRules, { adults: 1, children: 0 }),
          ).total_paise;
          const scales = svcRules.some((r) => r.qty_rule === "per_person");

          return (
            <section
              key={s.id}
              className="overflow-hidden rounded-xl border border-line bg-surface"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                <h2 className="flex items-center gap-2 text-[14px] font-bold text-ink">
                  {s.name}
                  {/*
                    Says at a glance whether selling this opens a case. Without
                    it the two kinds of service look identical on the rate card
                    and behave completely differently at the till.
                  */}
                  {s.tracks_pipeline && (
                    <Tag tone="accent">
                      <GitBranch size={11} className="mr-1 inline" />
                      Pipeline
                    </Tag>
                  )}
                </h2>
                <span className="flex items-center gap-2">
                  {scales && <Tag tone="accent">Scales by people</Tag>}
                  <span className="font-mono text-[13px] font-extrabold text-ink">
                    {formatPaise(total)}
                  </span>
                  {scales && (
                    <span className="text-[11px] font-medium text-ink-faint">
                      for 1 person
                    </span>
                  )}
                  <ServiceFormModal service={s} />
                  <ArchiveButton kind="service" id={s.id} name={s.name} />
                </span>
              </header>

              <table className="w-full">
                <tbody>
                  {svcRules.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="w-8 py-2 pl-5 font-mono text-[11px] text-ink-ghost">
                        {r.sort_order}
                      </td>
                      <td className="py-2 text-[12.5px] font-medium text-ink">
                        {r.label}
                      </td>
                      <td className="py-2 text-right text-[11px] font-medium text-ink-faint">
                        {QTY_LABEL[r.qty_rule] ?? r.qty_rule}
                      </td>
                      <td className="w-28 py-2 text-right font-mono text-[12.5px] font-semibold text-ink">
                        {formatPaiseBare(r.rate_paise)}
                      </td>
                      <td className="w-px whitespace-nowrap py-2 pr-3 text-right">
                        <span className="flex items-center justify-end gap-0.5">
                          <RuleFormModal
                            serviceId={s.id}
                            rule={r}
                            nextOrder={r.sort_order}
                          />
                          <ArchiveButton kind="rule" id={r.id} name={r.label} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="border-t border-line px-3 py-2">
                <RuleFormModal
                  serviceId={s.id}
                  nextOrder={
                    svcRules.reduce((max, r) => Math.max(max, r.sort_order), 0) + 1
                  }
                />
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-[11.5px] font-medium text-ink-faint">
        Rate changes take effect on new invoices only. Archived services and
        lines stay on the invoices that already carry them — an issued invoice
        keeps its own snapshot of every rate, permanently.
      </p>
    </div>
  );
}
