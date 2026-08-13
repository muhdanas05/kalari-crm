import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreatePortalUrl } from "@/lib/portal/token";
import { formatPaiseBare } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { DISPATCH_RULES } from "./rules";
import type { Database } from "@/lib/supabase/database.types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

/**
 * Give up on an event after this many failures, matching sendQueuedEmails.
 * A dead event stays visible (processed_at is still null and processed_result
 * holds the error) — it is skipped, not swept under the carpet, so /admin/logs
 * can still show it.
 */
const MAX_ATTEMPTS = 5;

export type DispatchSummary = {
  claimed: number;
  emailsQueued: number;
  callTasksRaised: number;
  sandboxed: number;
  skipped: number;
  errors: { event_id: string; error: string }[];
};

/**
 * The dispatcher. Reads events, decides what they mean, queues an email and/or
 * raises a call task. It does NOT send — that is the sender worker's job, and
 * keeping them apart is what lets email fail without losing the event.
 *
 * Runs as service_role: it acts for no user, and it must see every customer.
 */
export async function dispatchEvents(limit = 50): Promise<DispatchSummary> {
  const supabase = createAdminClient();
  const out: DispatchSummary = {
    claimed: 0,
    emailsQueued: 0,
    callTasksRaised: 0,
    sandboxed: 0,
    skipped: 0,
    errors: [],
  };

  const settings = await loadSettings(supabase);
  const emailOn = settings["email.enabled"] ?? false;
  const sandbox = settings["email.sandbox"] ?? true;

  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .is("processed_at", null)
    // Skip events that have already failed MAX_ATTEMPTS times. Without this a
    // single poison event retries forever AND, because the queue is ordered
    // oldest-first, permanently occupies a slot at the head — 50 of them and
    // the dispatcher stops making progress entirely while every later event
    // starves. sendQueuedEmails has always had this cap; the dispatcher never
    // got one.
    .lt("attempts", MAX_ATTEMPTS)
    .order("occurred_at")
    .limit(limit);

  if (error) throw new Error(`Could not read events: ${error.message}`);
  out.claimed = events?.length ?? 0;

  for (const event of events ?? []) {
    try {
      const result = await dispatchOne(supabase, event, { emailOn, sandbox });
      out.emailsQueued += result.queued;
      out.callTasksRaised += result.calls;
      out.sandboxed += result.sandboxed;
      out.skipped += result.skipped;

      await supabase
        .from("events")
        .update({
          processed_at: new Date().toISOString(),
          processed_result: result as unknown as Database["public"]["Tables"]["events"]["Row"]["processed_result"],
          attempts: (event.attempts ?? 0) + 1,
        })
        .eq("id", event.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      out.errors.push({ event_id: event.id, error: message });

      // Record the failure ON the event and leave processed_at null so it
      // retries. An event that fails silently is an automation nobody knows is
      // broken — which is precisely what the History tab exists to surface.
      await supabase
        .from("events")
        .update({
          attempts: (event.attempts ?? 0) + 1,
          processed_result: { error: message },
        })
        .eq("id", event.id);
    }
  }

  return out;
}

type OneResult = {
  queued: number;
  calls: number;
  sandboxed: number;
  skipped: number;
  reason?: string;
};

async function dispatchOne(
  supabase: ReturnType<typeof createAdminClient>,
  event: EventRow,
  cfg: { emailOn: boolean; sandbox: boolean },
): Promise<OneResult> {
  const res: OneResult = { queued: 0, calls: 0, sandboxed: 0, skipped: 0 };
  const rule = DISPATCH_RULES[event.type];
  if (!rule) {
    res.skipped = 1;
    res.reason = `no rule for ${event.type}`;
    return res;
  }

  // Is this rule switched off? Admin control, §5.10.
  const ruleKey = ruleSettingKey(event.type);
  if (ruleKey) {
    const { data } = await supabase
      .from("automation_settings")
      .select("enabled")
      .eq("key", ruleKey)
      .maybeSingle();
    if (data && data.enabled === false) {
      res.skipped = 1;
      res.reason = `${ruleKey} disabled`;
      return res;
    }
  }

  const customer = event.customer_id
    ? (
        await supabase
          .from("customers")
          .select("id, name, email, phone, email_flagged_at, archived_at")
          .eq("id", event.customer_id)
          .maybeSingle()
      ).data
    : null;

  if (!customer || customer.archived_at) {
    res.skipped = 1;
    res.reason = "no live customer";
    return res;
  }

  let emailWentOut = false;

  if (rule.email) {
    const outcome = await tryQueueEmail(supabase, event, customer, rule.email, cfg);
    if (outcome === "queued") {
      res.queued = 1;
      emailWentOut = true;
    } else if (outcome === "sandboxed") {
      res.sandboxed = 1;
      // Sandboxed is NOT delivered. It must still fall back to a call.
    }
  }

  // The design test, in three lines: when email is off or impossible, take the
  // call branch. Same table, same code path, one flag.
  if (rule.call) {
    const shouldCall = rule.call.when === "always" || !emailWentOut;
    if (shouldCall) {
      const raised = await raiseCallTask(supabase, event, customer, rule.call);
      if (raised) res.calls = 1;
    }
  }

  // Nothing at all happened AND nothing was supposed to — say so, don't hide it.
  if (res.queued + res.calls + res.sandboxed === 0) {
    res.skipped = 1;
    res.reason = res.reason ?? "nothing to do for this event";
  }

  return res;
}

async function tryQueueEmail(
  supabase: ReturnType<typeof createAdminClient>,
  event: EventRow,
  customer: { id: string; name: string; email: string | null; email_flagged_at: string | null },
  templateKey: string,
  cfg: { emailOn: boolean; sandbox: boolean },
): Promise<"queued" | "sandboxed" | "skipped"> {
  const dedupe = `${event.type}:${event.id}`;

  // case.input_needed does not use the shared template table at all — its
  // content is per-stage, written by the office for that exact stage
  // (stage_email_config.custom_subject/custom_body), not picked from a list.
  const template =
    event.type === "case.input_needed"
      ? await customStageTemplate(supabase, event)
      : (
          await supabase
            .from("email_templates")
            .select("*")
            .eq("key", templateKey)
            .maybeSingle()
        ).data;

  if (!template || !template.enabled) return "skipped";

  // No address, or a known-bad one → not an email, a phone call.
  if (!customer.email || customer.email_flagged_at) {
    return "skipped";
  }

  // §5.6: never send to a suppressed address.
  const { data: suppressed } = await supabase
    .from("suppressions")
    .select("email")
    .eq("email", customer.email.toLowerCase())
    .maybeSingle();
  if (suppressed) return "skipped";

  // §5.6: transactional mail is exempt from consent; promotional is NOT, and
  // consent cannot be inferred from an existing customer relationship.
  if (template.is_promotional) {
    const { data: consent } = await supabase.rpc("has_email_consent", {
      p_customer_id: customer.id,
    });
    if (!consent) return "skipped";
  }

  const { subject, body } = await render(supabase, template, event, customer);

  // Email off, or sandbox on → log it, never send it. Nothing is dropped.
  if (!cfg.emailOn || cfg.sandbox) {
    await supabase.from("email_log").insert({
      customer_id: customer.id,
      case_id: event.case_id,
      template_key: templateKey,
      to_email: customer.email,
      subject,
      body,
      status: "sandboxed",
      sandboxed: true,
      error: !cfg.emailOn ? "email.enabled is off" : "email.sandbox is on",
    });
    return "sandboxed";
  }

  const attachments = await attachmentsFor(supabase, event);

  const { error } = await supabase.from("email_queue").insert({
    event_id: event.id,
    customer_id: customer.id,
    case_id: event.case_id,
    invoice_id: event.entity === "invoice" ? event.entity_id : null,
    // email_queue.template_key has a real FK to email_templates.key — "custom"
    // (case.input_needed's rule.email marker) isn't a row there and never will
    // be, so it must go in as null, not the literal string.
    template_key: event.type === "case.input_needed" ? null : templateKey,
    to_email: customer.email,
    subject,
    body,
    attachments,
    dedupe_key: dedupe,
  });

  if (error) {
    // 23505 = this exact event is ALREADY in the queue, i.e. a previous run got
    // this far and then died before stamping processed_at. The email is going
    // out. Returning "skipped" here made the caller treat it as "no address on
    // file" and fire the `when: "fallback"` call task — telling an employee to
    // ring a customer and read them an invoice they had already been emailed.
    if (error.code === "23505") return "queued";
    throw new Error(error.message);
  }
  return "queued";
}

/**
 * The custom email for a checkpoint stage — read from stage_email_config for
 * the case's CURRENT stage, not from event.payload, in case the case has
 * already moved on by the time this event is processed.
 *
 * Same shape as an email_templates row so tryQueueEmail's downstream logic
 * (enabled check, is_promotional, render()) does not need to know which
 * source it came from. Checkpoint emails are transactional (a document, a
 * payment, an answer is needed to continue), never promotional.
 */
async function customStageTemplate(
  supabase: ReturnType<typeof createAdminClient>,
  event: EventRow,
): Promise<{ subject: string; body: string; enabled: boolean; is_promotional: boolean } | null> {
  if (!event.case_id) return null;

  const { data: kase } = await supabase
    .from("cases")
    .select("stage_id")
    .eq("id", event.case_id)
    .maybeSingle();
  if (!kase?.stage_id) return null;

  const { data: cfg } = await supabase
    .from("stage_email_config")
    .select("custom_subject, custom_body")
    .eq("stage_id", kase.stage_id)
    .maybeSingle();

  if (!cfg?.custom_subject?.trim() || !cfg?.custom_body?.trim()) return null;

  return {
    subject: cfg.custom_subject,
    body: cfg.custom_body,
    enabled: true,
    is_promotional: false,
  };
}

/**
 * The receipt PDF that rides along with a payment acknowledgement.
 *
 * Rendered here rather than fetched: the receipt route is user-scoped (RLS
 * decides who may read a payment), and the dispatcher runs from cron with no
 * user at all. Same renderer, same numbers, admin-scoped read.
 *
 * Failure is non-fatal on purpose — a Storage or jsPDF hiccup must never stop
 * the customer being told their money arrived. They get the email without the
 * attachment, and the receipt is still downloadable in the app.
 */
async function attachmentsFor(
  supabase: ReturnType<typeof createAdminClient>,
  event: EventRow,
): Promise<{ filename: string; content: string; contentType: string }[]> {
  if (event.type !== "payment.received" || event.entity !== "payment") return [];

  try {
    const { data: payment } = await supabase
      .from("payments")
      .select("number, paid_on, amount_paise, method, reference, invoice_id, voided_at")
      .eq("id", event.entity_id)
      .maybeSingle();

    // A voided payment gets no receipt — handing out proof of a reversed
    // payment is worse than sending nothing.
    if (!payment || payment.voided_at || !payment.number) return [];

    const { data: invoice } = await supabase
      .from("invoices_v")
      .select("number, outstanding_paise, customer_id")
      .eq("id", payment.invoice_id)
      .maybeSingle();
    if (!invoice) return [];

    const { data: customer } = invoice.customer_id
      ? await supabase
          .from("customers")
          .select("name")
          .eq("id", invoice.customer_id)
          .maybeSingle()
      : { data: null };

    const { renderReceiptPdf } = await import("@/lib/pdf/receipt");
    const buffer = await renderReceiptPdf({
      number: payment.number,
      paidOn: payment.paid_on,
      amountPaise: payment.amount_paise,
      method: payment.method,
      reference: payment.reference,
      customerName: customer?.name ?? "—",
      invoiceNumber: invoice.number ?? "—",
      balanceAfterPaise: invoice.outstanding_paise ?? 0,
    });

    return [
      {
        filename: `${payment.number}.pdf`,
        content: Buffer.from(buffer).toString("base64"),
        contentType: "application/pdf",
      },
    ];
  } catch (err) {
    console.error("[dispatch] receipt attachment failed:", err);
    return [];
  }
}

async function raiseCallTask(
  supabase: ReturnType<typeof createAdminClient>,
  event: EventRow,
  customer: { id: string; name: string },
  call: NonNullable<DispatchRuleCall>,
): Promise<boolean> {
  const context = await callContext(supabase, event, customer);

  const { data } = await supabase.rpc("dispatch_call_task", {
    p_customer_id: customer.id,
    // The RPC's optional params are `string | undefined`; event.case_id is
    // `string | null`. Coerce rather than widen the generated types.
    p_case_id: event.case_id ?? undefined,
    p_reason: call.reason,
    p_priority: call.priority,
    p_context: context,
    p_dedupe_key: `${call.reason}:${event.id}`,
  });

  return data === true;
}

type DispatchRuleCall = (typeof DISPATCH_RULES)[keyof typeof DISPATCH_RULES]["call"];

/**
 * The one line an employee reads before dialling (§5.7 / SOW §02.H).
 * Rendered here, once, and stored — so the call list is one query with no joins
 * on a phone on mobile data.
 */
async function callContext(
  supabase: ReturnType<typeof createAdminClient>,
  event: EventRow,
  customer: { name: string },
): Promise<string> {
  const p = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case "invoice.overdue":
    case "invoice.unpaid": {
      const out = Number(p.outstanding_paise ?? 0);
      const days = Number(p.days_overdue ?? 0);
      return days > 0
        ? `₹${formatPaiseBare(out)} outstanding, ${days} days overdue`
        : `₹${formatPaiseBare(out)} outstanding`;
    }
    case "docs.missing": {
      const docs = await outstandingDocs(supabase, event.case_id);
      return docs.length
        ? `Has not submitted: ${docs.join(", ")}`
        : "Documents outstanding";
    }
    case "case.stuck":
      return `Stuck at ${p.stage ?? "this stage"} for ${p.days ?? "?"} days`;
    case "case.input_needed":
      return `${p.stage ?? "This stage"} needs something from them — check the email sent`;
    case "quote.unanswered":
      return "Quoted, no answer — follow up";
    case "renewal.due":
      return `Visa issued ${p.visa_issue_date ? formatDate(String(p.visa_issue_date)) : "—"} — due for renewal`;
    case "email.failed":
      return "Email bounced — no working address, call them";
    case "lead.created":
      return "New enquiry, no email on file — call to introduce";
    case "invoice.issued":
      return "Invoice issued but no email on file — call with the details";
    default:
      return `${customer.name} needs a call`;
  }
}

async function outstandingDocs(
  supabase: ReturnType<typeof createAdminClient>,
  caseId: string | null,
): Promise<string[]> {
  if (!caseId) return [];
  const { data } = await supabase
    .from("case_documents")
    .select("label")
    .eq("case_id", caseId)
    .eq("state", "outstanding");
  return (data ?? []).map((d) => d.label);
}

/**
 * {{token}} substitution. Deliberately not a template language: this is edited
 * by an admin in a textarea, and a sandbox escape in an email renderer is a
 * genuinely bad day.
 */
async function render(
  supabase: ReturnType<typeof createAdminClient>,
  template: { subject: string; body: string },
  event: EventRow,
  customer: { id: string; name: string },
): Promise<{ subject: string; body: string }> {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const tokens: Record<string, string> = {
    customer_name: customer.name,
  };

  // Every template can carry the portal link. Same URL every time — see
  // lib/portal/token.ts.
  const portal = await getOrCreatePortalUrl(customer.id);
  tokens.portal_url = portal ?? "";

  const [{ data: settings }, caseRow] = await Promise.all([
    supabase
      .from("automation_settings")
      .select("config")
      .eq("key", "email.payment_instructions")
      .maybeSingle(),
    event.case_id
      ? supabase
          .from("cases_board_v")
          .select("service_name, stage_name, stage_path")
          .eq("id", event.case_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  tokens.payment_instructions =
    ((settings?.config as Record<string, unknown>)?.text as string) ?? "";

  const c = caseRow?.data as { service_name?: string; stage_name?: string; stage_path?: unknown } | null;
  tokens.service_name = c?.service_name ?? "application";
  tokens.stage_name = String(p.stage ?? c?.stage_name ?? "");
  tokens.next_step = nextStepFrom(c?.stage_path, tokens.stage_name);

  if (event.entity === "invoice") {
    const { data: inv } = await supabase
      .from("invoices_v")
      .select("number, total_paise, outstanding_paise, due_date, days_overdue")
      .eq("id", event.entity_id)
      .maybeSingle();
    if (inv) {
      tokens.invoice_number = inv.number ?? "";
      tokens.invoice_total = formatPaiseBare(inv.total_paise ?? 0);
      tokens.invoice_outstanding = formatPaiseBare(inv.outstanding_paise ?? 0);
      tokens.due_date = formatDate(inv.due_date);
      tokens.days_overdue = String(inv.days_overdue ?? 0);
    }
  }

  // A payment event points at the PAYMENT, so the invoice tokens above never
  // fire for it. Fetch both: the receipt names the payment, the balance names
  // the invoice, and the customer wants to read both in one line.
  if (event.entity === "payment") {
    const { data: pay } = await supabase
      .from("payments")
      .select("amount_paise, number, paid_on, method, invoice_id")
      .eq("id", event.entity_id)
      .maybeSingle();
    if (pay) {
      tokens.payment_amount = formatPaiseBare(pay.amount_paise ?? 0);
      tokens.receipt_number = pay.number ?? "";
      tokens.payment_date = formatDate(pay.paid_on);
      tokens.payment_method = String(pay.method ?? "");

      if (pay.invoice_id) {
        const { data: inv } = await supabase
          .from("invoices_v")
          .select("number, total_paise, outstanding_paise")
          .eq("id", pay.invoice_id)
          .maybeSingle();
        if (inv) {
          tokens.invoice_number = inv.number ?? "";
          tokens.invoice_total = formatPaiseBare(inv.total_paise ?? 0);
          tokens.invoice_outstanding = formatPaiseBare(inv.outstanding_paise ?? 0);
        }
      }
    }
  }

  if (event.type === "docs.missing") {
    const docs = await outstandingDocs(supabase, event.case_id);
    tokens.documents = docs.map((d) => `  • ${d}`).join("\n");
  }

  if (event.type === "renewal.due" && p.visa_issue_date) {
    tokens.visa_issue_month = formatDate(String(p.visa_issue_date));
  }

  const fill = (s: string) =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => tokens[k] ?? "");

  return { subject: fill(template.subject), body: fill(template.body) };
}

function nextStepFrom(stagePath: unknown, current: string): string {
  if (!Array.isArray(stagePath)) return "";
  const path = stagePath as { name: string }[];
  const i = path.findIndex((s) => s.name === current);
  if (i < 0 || i >= path.length - 1) return "";
  const next = path[i + 1].name;
  return next === "Complete"
    ? "Your visa will then be issued and we finish your file."
    : `Next: ${next}.`;
}

function ruleSettingKey(type: EventRow["type"]): string | null {
  const map: Partial<Record<EventRow["type"], string>> = {
    "lead.created": "rule.case_opened",
    "case.stage_changed": "rule.stage_changed",
    "case.completed": "rule.case_complete",
    "case.input_needed": "rule.input_needed",
    "case.stuck": "rule.case_stuck",
    "docs.missing": "rule.docs_missing",
    "quote.unanswered": "rule.quote_unanswered",
    "invoice.issued": "rule.invoice_issued",
    "invoice.unpaid": "rule.invoice_unpaid",
    "invoice.overdue": "rule.invoice_overdue",
    "renewal.due": "rule.renewal_due",
    "reengagement.due": "rule.reengagement",
  };
  return map[type] ?? null;
}

async function loadSettings(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Record<string, boolean>> {
  const { data } = await supabase.from("automation_settings").select("key, enabled");
  return Object.fromEntries((data ?? []).map((s) => [s.key, s.enabled]));
}
