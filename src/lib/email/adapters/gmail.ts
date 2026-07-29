import "server-only";
import type { Adapter, Attachment, SendResult } from "../adapter";

/**
 * Gmail, via a Google OAuth refresh token. THE ONLY FILE IN THE CODEBASE THAT
 * MAY KNOW GMAIL EXISTS.
 *
 * Plain fetch against Google's REST endpoints — no googleapis SDK, nothing
 * extra in the Railway image. Good enough to get real mail out now; move to a
 * domain sender (Resend + SPF/DKIM/DMARC on kalaritravels.in) later for
 * deliverability and Gmail's ~500/day send cap stops mattering.
 */

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3000) * 1000,
  };
  return cachedToken.value;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** RFC 2047 — a header value with non-ASCII must be base64-encoded like this. */
function encodeHeader(value: string): string {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

function buildRawMessage(
  from: string,
  to: string,
  subject: string,
  body: string,
  attachments: Attachment[],
): string {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
  ];

  if (attachments.length === 0) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    return base64url([...headers, "", body].join("\r\n"));
  }

  const boundary = `kalari-${Date.now()}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
    ...attachments.flatMap((a) => [
      `--${boundary}`,
      `Content-Type: ${a.contentType ?? "application/octet-stream"}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      a.content,
    ]),
    `--${boundary}--`,
  ];
  return base64url([...headers, "", ...parts].join("\r\n"));
}

export function gmailAdapter(): Adapter {
  const from = process.env.EMAIL_FROM;

  return {
    name: "gmail",
    async send(to, subject, body, attachments = []): Promise<SendResult> {
      if (!from) {
        return { msg_id: null, status: "failed", error: "EMAIL_FROM is not set" };
      }
      const token = await getAccessToken();
      if (!token) {
        return {
          msg_id: null,
          status: "failed",
          error: "GMAIL_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN not set or refresh failed",
        };
      }

      try {
        const res = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw: buildRawMessage(from, to, subject, body, attachments) }),
          },
        );

        if (!res.ok) {
          const detail = await res.text();
          return {
            msg_id: null,
            status: "failed",
            error: `gmail ${res.status}: ${detail.slice(0, 300)}`,
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
