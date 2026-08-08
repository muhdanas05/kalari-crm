"use server";

import { revalidateTag, revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/database.types";

type ServiceFamily = Database["public"]["Enums"]["service_family"];
type ServiceCategory = Database["public"]["Enums"]["service_category"];
type ServiceLocation = Database["public"]["Enums"]["service_location"];
type ServiceType = Database["public"]["Enums"]["service_type"];
type QtyRule = Database["public"]["Enums"]["qty_rule"];

export type Result = { ok: true } | { ok: false; error: string };

export type ServiceInput = {
  id?: string;
  name: string;
  family: ServiceFamily;
  category: ServiceCategory | null;
  location: ServiceLocation | null;
  type: ServiceType | null;
  tracksPipeline: boolean;
};

export type RuleInput = {
  id?: string;
  serviceId: string;
  label: string;
  ratePaise: number;
  qtyRule: QtyRule;
  sortOrder: number;
};

/**
 * The catalogue is admin-editable data, not a migration (§REQ-I7). RLS already
 * carried the admin-write policy from day one; only the UI was missing.
 *
 * Every write invalidates the "reference" tag — getCatalogue caches for an
 * hour, so without this an edited rate would keep selling at the old price
 * until the cache expired.
 */
export async function saveService(input: ServiceInput): Promise<Result> {
  await requirePermission("admin_catalogue");
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) return { ok: false, error: "The service needs a name." };

  const row = {
    name,
    family: input.family,
    category: input.category,
    location: input.location,
    type: input.type,
    tracks_pipeline: input.tracksPipeline,
  };

  const { error } = input.id
    ? await supabase.from("services").update(row).eq("id", input.id)
    : await supabase.from("services").insert(row);

  if (error) return { ok: false, error: friendly(error.message) };

  revalidateTag("reference");
  revalidatePath("/admin/catalogue");
  revalidatePath("/invoices/new");
  return { ok: true };
}

export async function saveRule(input: RuleInput): Promise<Result> {
  await requirePermission("admin_catalogue");
  const supabase = await createClient();

  const label = input.label.trim();
  if (!label) return { ok: false, error: "The line needs a description." };
  if (!Number.isSafeInteger(input.ratePaise) || input.ratePaise < 0) {
    return { ok: false, error: "That rate is not a valid amount." };
  }

  const row = {
    service_id: input.serviceId,
    label,
    rate_paise: input.ratePaise,
    qty_rule: input.qtyRule,
    sort_order: input.sortOrder,
  };

  const { error } = input.id
    ? await supabase.from("line_item_rules").update(row).eq("id", input.id)
    : await supabase.from("line_item_rules").insert(row);

  if (error) return { ok: false, error: friendly(error.message) };

  revalidateTag("reference");
  revalidatePath("/admin/catalogue");
  revalidatePath("/invoices/new");
  return { ok: true };
}

/**
 * Soft-delete, always. A rate that appears on an issued invoice must stay
 * explainable — and issued invoices snapshot their own rates, so archiving one
 * never rewrites history.
 */
export async function archiveService(id: string): Promise<Result> {
  await requirePermission("admin_catalogue");
  const supabase = await createClient();

  const { error } = await supabase
    .from("services")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateTag("reference");
  revalidatePath("/admin/catalogue");
  return { ok: true };
}

export async function archiveRule(id: string): Promise<Result> {
  await requirePermission("admin_catalogue");
  const supabase = await createClient();

  const { error } = await supabase
    .from("line_item_rules")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidateTag("reference");
  revalidatePath("/admin/catalogue");
  return { ok: true };
}

/**
 * The two constraint violations an admin can actually hit, in their own words.
 * The raw Postgres text names the constraint, which means nothing to the
 * person who just typed a service name.
 */
function friendly(message: string): string {
  if (message.includes("services_dims_ck")) {
    return (
      "That combination of family and options is not allowed. " +
      "Check which options this family uses — e.g. Haj/Umrah needs a programme, " +
      "ticketing needs domestic or international, and attestation takes none."
    );
  }
  if (message.includes("services_dims_uk")) {
    return "A service with exactly those options already exists.";
  }
  if (message.includes("line_item_rules_order_uk")) {
    return "This service already has a line at that position. Use a different order number.";
  }
  return message;
}
