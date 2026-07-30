import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Global search. Success criterion §8.1: any customer findable in under 5
 * seconds by name or phone.
 *
 * Uses the USER-scoped client, so RLS scopes results automatically — an employee
 * searching cannot surface a customer who isn't theirs. That's the whole reason
 * this is a Route Handler and not a service-role lookup.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ customers: [], invoices: [] });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  // Phone search must tolerate however the user typed it: 050 482 7719,
  // +919567324364, 0091... all describe one person (§3.27). Reduce to digits
  // and match the tail against the generated phone_e164 column.
  const digits = q.replace(/\D/g, "");
  const escaped = q.replace(/[%_,()]/g, "");

  const orParts = [`name.ilike.%${escaped}%`];
  if (digits.length >= 3) {
    orParts.push(`phone_e164.ilike.%${digits}%`, `phone.ilike.%${digits}%`);
  }
  if (escaped.includes("@")) orParts.push(`email.ilike.%${escaped}%`);

  const [customers, invoices] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, email")
      .or(orParts.join(","))
      .is("archived_at", null)
      .limit(6),
    supabase
      .from("invoices_v")
      .select("id, number, total_paise, display_status")
      .ilike("number", `%${escaped}%`)
      .limit(4),
  ]);

  return NextResponse.json({
    customers: customers.data ?? [],
    invoices: invoices.data ?? [],
  });
}
