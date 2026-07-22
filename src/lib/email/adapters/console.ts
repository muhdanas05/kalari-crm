import "server-only";
import type { Adapter, SendResult } from "../adapter";

/**
 * The default adapter: logs instead of sending.
 *
 * This is what makes ARCHITECTURE.md §4's design test — "the CRM must be fully
 * usable with email switched off entirely" — something you can actually run,
 * rather than a claim in a document. It is also the safety net: a fresh deploy
 * with no EMAIL_PROVIDER cannot email real customers by accident.
 *
 * It reports `sent`, deliberately. The dispatcher's job is to prove the pipeline
 * works end to end; whether a provider is attached is a config question, and
 * every send is written to email_log with sandboxed=true regardless, so nothing
 * is hidden.
 */
export function consoleAdapter(): Adapter {
  return {
    name: "console",
    async send(to, subject, body): Promise<SendResult> {
      console.log(
        `[email:console] to=${to}\n  subject=${subject}\n  ${body.slice(0, 300).replace(/\n/g, "\n  ")}`,
      );
      return { msg_id: `console-${Date.now()}`, status: "sent" };
    },
  };
}
