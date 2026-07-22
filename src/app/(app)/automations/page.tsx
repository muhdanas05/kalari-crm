import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { StatCard } from "@/components/ui/StatCard";
import { Tag } from "@/components/ui/Tag";
import { requireAdmin } from "@/lib/auth/session";
import {
  getAutomationLog,
  getAutomationHealth,
  getSettings,
  getStageEmailConfig,
} from "@/lib/db/automations";
import { formatDateTime } from "@/lib/dates";
import { DISPATCH_RULES } from "@/lib/dispatch/rules";
import { AlertTriangle, Zap, Mail, PhoneCall, Check } from "@/components/icons";
import { StageEmailToggles } from "./StageEmailToggles";
import { RuleToggles } from "./RuleToggles";

export const metadata: Metadata = { title: "Automations · Kalari" };

/**
 * The Automations tab.
 *
 * "automations tab will be just a log of automations fired and all as per the
 *  pipelines we dont wanna do it twice same thing"
 *
 * So this is a LOG first, controls second. It answers: what fired, for whom,
 * what did it do, and did anything break.
 */
export default async function AutomationsPage() {
  await requireAdmin();
  const [log, health, settings, stageConfig] = await Promise.all([
    getAutomationLog(120),
    getAutomationHealth(),
    getSettings(),
    getStageEmailConfig(),
  ]);

  const emailOn = settings.find((s) => s.key === "email.enabled")?.enabled ?? false;
  const sandbox = settings.find((s) => s.key === "email.sandbox")?.enabled ?? true;

  const fired = log.filter((l) => l.processed_at).length;
  const pending = log.filter((l) => !l.processed_at).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Automations"
        title="Automations"
        subtitle="What fired, for whom, and what it did."
      />

      {/* The design test, said out loud rather than looking like a fault. */}
      {(!emailOn || sandbox) && (
        <div className="flex items-start gap-3 rounded-xl border border-accent/25 bg-accent-mist px-5 py-4">
          <Mail size={16} className="mt-0.5 shrink-0 text-accent" />
          <div>
            <p className="text-[13px] font-semibold text-ink">
              Email is {!emailOn ? "switched off" : "in sandbox"} — and everything
              still works.
            </p>
            <p className="mt-1 text-[12.5px] font-medium text-ink-soft">
              Every message that would have been emailed is written to the log and
              turned into a call task instead. Nothing is dropped. Switch email on
              once your domain's SPF, DKIM and DMARC records are verified.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Automations fired" value={fired} icon={Zap} />
        <StatCard
          label="Waiting"
          value={pending}
          sub="Next run picks these up"
          icon={Check}
        />
        <StatCard
          label="Errors"
          value={health.total}
          sub={health.total ? "Needs a look" : "Nothing broken"}
          icon={AlertTriangle}
          accent={health.total > 0 ? "alert" : "default"}
        />
      </div>

      {health.total > 0 && (
        <Link
          href="/history?errors=1"
          className="flex items-center gap-3 rounded-xl border border-alert/30 bg-alert-pale/40 px-5 py-3.5 transition-colors hover:border-alert/50"
        >
          <AlertTriangle size={16} className="shrink-0 text-alert" />
          <p className="flex-1 text-[13px] font-semibold text-ink">
            {health.total} automation{health.total === 1 ? "" : "s"} failed — see
            the detail in History
          </p>
        </Link>
      )}

      <RuleToggles settings={settings} />

      <StageEmailToggles stages={stageConfig} />

      <section>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-gold-deep">
          Log
        </h2>
        {log.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-12 text-center text-[13px] font-medium text-ink-faint">
            Nothing has fired yet.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-line bg-surface">
            {log.map((l) => {
              const rule = DISPATCH_RULES[l.event_type as keyof typeof DISPATCH_RULES];
              const result = (l.processed_result ?? {}) as Record<string, number>;
              return (
                <li
                  key={l.id}
                  className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0"
                >
                  <span className="mt-0.5 shrink-0">
                    {l.has_error || l.is_failing ? (
                      <AlertTriangle size={14} className="text-alert" />
                    ) : (
                      <Zap size={14} className="text-ink-ghost" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">
                      {rule?.label ?? l.event_type}
                    </span>
                    <span className="block truncate text-[11.5px] font-medium text-ink-mid">
                      {l.customer_name ?? "—"}
                    </span>
                    <span className="block font-mono text-[10.5px] text-ink-faint">
                      {formatDateTime(l.occurred_at)}
                    </span>
                    {l.error_text && (
                      <span className="mt-1 block rounded bg-alert-pale px-2 py-1 font-mono text-[10.5px] text-alert">
                        {l.error_text}
                      </span>
                    )}
                  </span>

                  <span className="flex shrink-0 items-center gap-1.5">
                    {result.queued > 0 && (
                      <Tag tone="ok" icon={Mail}>
                        sent
                      </Tag>
                    )}
                    {result.sandboxed > 0 && (
                      <Tag tone="neutral" icon={Mail}>
                        logged
                      </Tag>
                    )}
                    {result.calls > 0 && (
                      <Tag tone="accent" icon={PhoneCall}>
                        call
                      </Tag>
                    )}
                    {!l.processed_at && <Tag tone="warn">waiting</Tag>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/*
        The dedupe rule, stated where someone will look for it. It's the brief's
        most specific requirement and the least visible thing in the product.
      */}
      <p className="rounded-xl border border-line bg-paper px-5 py-3.5 text-[12px] font-medium text-ink-mid">
        <strong className="text-ink">Nothing fires twice.</strong> Each automation
        is keyed to the thing that caused it, so a case moved forward, back, and
        forward again sends one message, not three — and a reminder that has
        already gone never repeats.
      </p>
    </div>
  );
}
