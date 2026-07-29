import "server-only";

/**
 * The adapter contract — ARCHITECTURE.md §4, verbatim:
 *
 *   send(to, subject, body, attachments) → { msg_id, status }
 *
 * NOTHING outside src/lib/email/adapters/ may import a provider SDK. Not the
 * dispatcher, not a server action, not a route. That is the entire point of the
 * seam: the channel could change without business logic knowing, and swapping
 * Gmail for Resend or SES is one file.
 *
 * If you find yourself importing a provider client somewhere else to "just
 * send one email", that is the moment the seam dies.
 */

export type Attachment = {
  filename: string;
  /** base64 */
  content: string;
  contentType?: string;
};

export type SendResult = {
  msg_id: string | null;
  status: "sent" | "failed";
  error?: string;
};

export type Adapter = {
  name: string;
  send(
    to: string,
    subject: string,
    body: string,
    attachments?: Attachment[],
  ): Promise<SendResult>;
};

/**
 * Which adapter is live.
 *
 * Defaults to `console` — a system that starts out able to email real customers
 * because someone forgot to configure it is the wrong default. You opt IN to
 * sending.
 */
export async function getAdapter(): Promise<Adapter> {
  const provider = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();

  switch (provider) {
    case "resend": {
      const { resendAdapter } = await import("./adapters/resend");
      return resendAdapter();
    }
    case "gmail": {
      const { gmailAdapter } = await import("./adapters/gmail");
      return gmailAdapter();
    }
    case "console":
    default: {
      const { consoleAdapter } = await import("./adapters/console");
      return consoleAdapter();
    }
  }
}
