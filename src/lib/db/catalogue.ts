import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Service, Rule } from "@/lib/pricing/engine";

/**
 * The rate catalogue. `line_item_rules` is the STORE; lib/pricing/engine.ts is
 * the resolver — that split is the schema's own comment, and it's why rates are
 * data rather than ten hardcoded templates (§3.4).
 *
 * Cached for an hour across requests. 10 services and 72 rules that change only
 * when a migration changes them, sitting ~600ms away — there is no reason to
 * re-fetch them every time someone opens the invoice builder.
 *
 * Admin client because unstable_cache runs outside the request scope. Safe here:
 * the catalogue is public to every authenticated user by policy — it is a price
 * list, not customer data. Never copy this to a customer-scoped read.
 *
 * If a rate ever changes, revalidateTag("reference") — or just redeploy.
 */
const getCatalogueCached = unstable_cache(
  async (): Promise<{ services: Service[]; rules: Rule[] }> => {
    const supabase = createAdminClient();
    const [{ data: services }, { data: rules }] = await Promise.all([
      supabase
        .from("services")
        .select("id, name, family, category, location, type")
        .eq("active", true)
        .is("archived_at", null)
        .order("name"),
      supabase
        .from("line_item_rules")
        .select("id, service_id, label, rate_paise, qty_rule, sort_order")
        .eq("active", true)
        .is("archived_at", null)
        .order("sort_order"),
    ]);

    return {
      services: (services ?? []) as Service[],
      rules: (rules ?? []) as Rule[],
    };
  },
  ["catalogue"],
  { revalidate: 3600, tags: ["reference"] },
);

export const getCatalogue = cache(getCatalogueCached);

// Pure helper — lives in lib/pricing/rules.ts so the client can use it too.
export { rulesForService } from "@/lib/pricing/rules";
