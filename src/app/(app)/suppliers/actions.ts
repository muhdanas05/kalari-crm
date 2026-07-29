"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";

export type SaveSupplierResult = { ok: true; id: string } | { ok: false; error: string };

export type SupplierInput = {
  id?: string;
  name: string;
  supplies?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  city?: string;
  address?: string;
  notes?: string;
};

/** Admin-only, enforced by the suppliers_admin_write RLS policy — not re-checked here. */
export async function saveSupplier(input: SupplierInput): Promise<SaveSupplierResult> {
  await requireProfile();

  if (!input.name.trim()) return { ok: false, error: "Name is required." };

  const supabase = await createClient();
  const row = {
    name: input.name.trim(),
    supplies: input.supplies?.trim() || null,
    contact_person: input.contactPerson?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    whatsapp: input.whatsapp?.trim() || null,
    city: input.city?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  };

  const { data, error } = input.id
    ? await supabase.from("suppliers").update(row).eq("id", input.id).select("id").single()
    : await supabase.from("suppliers").insert(row).select("id").single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/suppliers");
  if (input.id) revalidatePath(`/suppliers/${input.id}`);
  return { ok: true, id: data.id };
}

export async function archiveSupplier(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { ok: true };
}
