import "server-only";
import type { Adapter, SendResult } from "../adapter";

/**
 * Resend. THE ONLY FILE IN THE CODEBASE THAT MAY KNOW RESEND EXISTS.
 *
 * Uses the REST API directly rather than the `resend` SDK — one fetch against a
 * stable endpoint, no dependency, and nothing extra in the Railway image. If
 * this ever needs SES, it is a sibling file and a config change; nothing else
 * moves.
 *
 * Chosen over SES for the reason in the SOW's cost model: $0–20/mo, and DKIM
 * setup that takes an afternoon rather than a week.
 */
export function resendAdapter(): Adapter {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  return {
    name: "resend",
    async send(to, subject, body, attachments): Promise<SendResult> {
      if (!key || !from) {
        // Refuse rather than throw: the worker records this against the row and
        // retries, instead of the whole tick dying on a config problem.
        return {
          msg_id: null,
          status: "failed",
          error: "RESEND_API_KEY or EMAIL_FROM is not set",
        };
      }

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [to],
            subject,
            text: body,
            ...(attachments?.length
              ? {
                  attachments: attachments.map((a) => ({
                    filename: a.filename,
                    content: a.content,
                  })),
                }
              : {}),
          }),
        });

        if (!res.ok) {
          const detail = await res.text();
          return {
            msg_id: null,
            status: "failed",
            // Keep the status code: 422 (bad address) must never be retried the
            // way 429/5xx should be.
            error: `resend ${res.status}: ${detail.slice(0, 300)}`,
          };
        }

        const json = (await res.json()) as { id?: string };
        return { msg_id: json.id ?? null, status: "sent" };
      } catch (e) {
        return {
          msg_id: null,
          status: "failed",
          error: e instanceof Error ? e.message : "network error",
        };
      }
    },
  };
}
