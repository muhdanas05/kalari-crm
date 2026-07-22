import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readPortal } from "@/lib/portal/read";
import { formatPaise } from "@/lib/money";
import { Check } from "@/components/icons";
import { Wordmark } from "@/components/brand/Wordmark";

export const metadata: Metadata = {
  title: "Your application",
  // A private link. Keep it out of search results even if it's ever shared.
  robots: { index: false, follow: false },
};

/**
 * The customer status portal (§5.8).
 *
 * Read-only, mobile-first, no shell, no login. It exists to answer one question
 * — "where is my visa?" — so that the answer stops arriving as a phone call to
 * Kalari's office, which is the actual daily cost to the team.
 *
 * Outside the (app) group and excluded from the middleware matcher, so no
 * session is required or attempted.
 */
export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await readPortal(token);

  // Missing, revoked, expired or rate-limited all land here. Never confirm which.
  if (!data) notFound();

  const {
    customer,
    case: c,
    documents_outstanding: docs,
    money,
    invoice_number,
    payment_instructions,
  } = data;

  const currentIdx = c
    ? c.stage_path.findIndex((s) => s.name === c.stage)
    : -1;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col gap-5 bg-paper px-5 py-8">
      {/* The customer opens this from an email or an SMS from someone they've
          paid money to. Lead with the mark so it's immediately, obviously us. */}
      <header className="flex flex-col items-center gap-4 text-center">
        <Wordmark className="max-w-[132px]" />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[2px] text-gold-deep">
            Your application
          </p>
          <h1 className="mt-1 text-[28px] font-extrabold leading-[1.1] tracking-[-1px] text-ink">
            {customer.name}
          </h1>
        </div>
      </header>

      {c ? (
        <>
          <section className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-faint">
              Where you are
            </p>
            <p className="mt-1 text-[22px] font-extrabold tracking-[-0.5px] text-ink">
              {c.complete ? "Complete" : c.stage}
            </p>
            {c.service && (
              <p className="mt-0.5 text-[12.5px] font-medium text-ink-mid">
                {c.service}
              </p>
            )}

            {/*
              The customer's own stage path — the stages THEIR service actually
              has (§3.14). Showing the full 9-stage superset would invent steps
              they will never go through, which is the opposite of reassuring.
            */}
            {c.stage_path.length > 0 && (
              <ol className="mt-4 flex flex-col gap-0">
                {c.stage_path.map((s, i) => {
                  const done = currentIdx > i || c.complete;
                  const active = !c.complete && i === currentIdx;
                  return (
                    <li key={s.name} className="flex items-start gap-3">
                      <span className="flex flex-col items-center self-stretch">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                            done
                              ? "bg-accent text-white"
                              : active
                                ? "bg-accent text-white ring-4 ring-accent-mist"
                                : "bg-paper-deep text-ink-faint"
                          }`}
                        >
                          {done ? <Check size={10} strokeWidth={4} /> : i + 1}
                        </span>
                        {i < c.stage_path.length - 1 && (
                          <span
                            className={`w-0.5 flex-1 ${done ? "bg-accent" : "bg-line"}`}
                          />
                        )}
                      </span>
                      <span
                        className={`pb-4 text-[13px] ${
                          active
                            ? "font-bold text-ink"
                            : done
                              ? "font-medium text-ink-mid"
                              : "font-medium text-ink-faint"
                        }`}
                      >
                        {s.name}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/*
            §5.8: "what happens next".
            The last node of every path is literally named "Complete", so naming
            it verbatim produced "What happens next: Complete" — technically
            true, reads like a bug. This page exists to reassure someone who has
            paid money and is waiting, so say the thing a person would say.
          */}
          {!c.complete && currentIdx >= 0 && currentIdx < c.stage_path.length - 1 && (
            <section className="rounded-2xl border border-accent/25 bg-accent-mist p-5">
              <p className="text-[11px] font-bold uppercase tracking-[1px] text-accent">
                What happens next
              </p>
              <p className="mt-1 text-[14px] font-semibold text-ink">
                {nextStepCopy(c.stage_path[currentIdx + 1].name)}
              </p>
            </section>
          )}
        </>
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-[13px] font-medium text-ink-mid">
            We're getting your application started. We'll be in touch shortly.
          </p>
        </section>
      )}

      {docs.length > 0 && (
        <section className="rounded-2xl border border-warn/30 bg-warn-pale/40 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-warn">
            We still need
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
            {docs.map((d) => (
              <li key={d.label} className="text-[13px] font-semibold text-ink">
                {d.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {money.total_paise > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-ink-faint">
            Your balance
          </p>
          <dl className="mt-2 flex flex-col gap-1.5">
            <Row label="Total" value={formatPaise(money.total_paise)} />
            <Row label="Paid" value={formatPaise(money.paid_paise)} />
            <div className="mt-1 border-t border-line pt-2">
              <Row
                label="Outstanding"
                value={formatPaise(money.outstanding_paise)}
                strong
                warn={money.outstanding_paise > 0}
              />
            </div>
          </dl>

          {/*
            "Pay here" = bank details, nothing else (SOW §03: no gateway). Shown
            only when something is owed, and only if the office has filled the
            details in — placeholder text must never reach a customer.
          */}
          {money.outstanding_paise > 0 &&
            payment_instructions &&
            !payment_instructions.includes("<BANK NAME>") && (
              <div className="mt-4 rounded-xl border border-gold/40 bg-gold-mist p-4">
                <p className="text-[11px] font-bold uppercase tracking-[1px] text-gold-deep">
                  How to pay
                </p>
                {invoice_number && (
                  <p className="mt-1 text-[12px] font-medium text-ink-mid">
                    Reference:{" "}
                    <span className="font-mono font-semibold text-ink">
                      {invoice_number}
                    </span>
                  </p>
                )}
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[12.5px] font-medium leading-relaxed text-ink-soft">
                  {payment_instructions}
                </pre>
              </div>
            )}
        </section>
      )}

      <footer className="mt-auto pt-4 text-center">
        <p className="text-[11.5px] font-medium text-ink-faint">
          Questions? Call our office and quote your name.
        </p>
        <p className="mt-2 text-[10.5px] text-ink-ghost">
          This page is private to you. Please don't share the link.
        </p>
      </footer>
    </main>
  );
}

/**
 * Plain-English next step. The stage names are internal vocabulary — a customer
 * has no idea what "PNR Held" or "Group & Departure Allocated" means, and this is the
 * one screen written for them rather than for the office.
 */
function nextStepCopy(stage: string): string {
  switch (stage) {
    case "Complete":
      return "Everything is done and we close your file.";
    // Ticketing
    case "PNR Held":
      return "We hold your booking while the fare is confirmed.";
    case "Ticket Issued":
      return "Your ticket is issued and sent to you.";
    // Holiday packages
    case "Itinerary Final":
      return "We finalise your itinerary with you.";
    case "Bookings Confirmed":
      return "Your flights, stays and activities are confirmed.";
    case "Travel Docs Shared":
      return "We send you your tickets, vouchers and travel documents.";
    case "Travelling":
      return "You travel — we stay reachable throughout.";
    // Haj & Umrah
    case "Docs Collected":
      return "We collect and check your documents.";
    case "Visa Processing":
      return "Your pilgrimage visa is processed.";
    case "Group & Departure Allocated":
      return "You are allocated your group and departure date.";
    case "Departed":
      return "You depart — we stay reachable throughout.";
    // Visa services
    case "Submitted":
      return "Your application is submitted to the consulate.";
    case "Visa Received":
      return "Your visa is received and sent to you.";
    // Passport services
    case "PSK Appointment":
      return "You attend your Passport Seva Kendra appointment.";
    case "Passport Dispatched":
      return "Your passport is dispatched to you.";
    // Hotels
    case "Booking Confirmed":
      return "Your hotel booking is confirmed.";
    case "Voucher Sent":
      return "Your booking voucher is sent to you.";
    default:
      return stage;
  }
}

function Row({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12.5px] font-medium text-ink-mid">{label}</dt>
      <dd
        className={`font-mono ${
          strong ? "text-[16px] font-extrabold" : "text-[13px] font-semibold"
        } ${warn ? "text-warn" : "text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}
