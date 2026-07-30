import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { listLedger, defaultRange } from "@/lib/db/accounts";
import { formatPaiseBare } from "@/lib/money";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** RFC 4180: quote everything, double any embedded quote. Cheapest correct rule. */
function csv(value: string | null): string {
  return `"${(value ?? "").replace(/"/g, '""')}"`;
}

/** The account book as a spreadsheet — what the paper book was for. */
export async function GET(request: NextRequest) {
  await requireAdmin();

  const sp = request.nextUrl.searchParams;
  const fallback = defaultRange();
  const fromParam = sp.get("from");
  const toParam = sp.get("to");
  const from = fromParam && DATE_RE.test(fromParam) ? fromParam : fallback.from;
  const to = toParam && DATE_RE.test(toParam) ? toParam : fallback.to;

  const entries = await listLedger({ from, to });

  const lines = [
    ["Date", "Type", "Description", "Reference", "Method", "Amount (INR)"].join(","),
    ...entries.map((e) =>
      [
        csv(e.date),
        csv(e.kind === "in" ? "In" : "Out"),
        csv([e.label, e.sublabel].filter(Boolean).join(" — ")),
        csv(e.ref),
        csv(e.method),
        // Bare decimal, no symbol and no grouping commas — a spreadsheet has to
        // read this as a number.
        csv(formatPaiseBare(e.amount_paise).replace(/,/g, "")),
      ].join(","),
    ),
  ];

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kalari-accounts-${from}-to-${to}.csv"`,
    },
  });
}
