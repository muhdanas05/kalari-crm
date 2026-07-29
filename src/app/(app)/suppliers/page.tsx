import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { listSuppliers } from "@/lib/db/suppliers";
import { getProfile } from "@/lib/auth/session";
import { ChevronRight, Mail, Phone } from "@/components/icons";
import { SupplierFormModal } from "./SupplierFormModal";

export const metadata: Metadata = { title: "Suppliers · Kalari" };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [profile, suppliers] = await Promise.all([getProfile(), listSuppliers({ q })]);

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        eyebrow="Vendors"
        title="Suppliers"
        subtitle="Consolidators, DMCs, visa and Haj/Umrah agents, hotels — who Kalari books through."
        actions={profile?.role === "admin" ? <SupplierFormModal /> : undefined}
      />

      {suppliers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center text-[13px] font-medium text-ink-faint">
          {q ? `Nothing matches “${q}”.` : "No suppliers yet."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {suppliers.map((s) => (
            <li key={s.id} className="border-b border-line last:border-0">
              <Link
                href={`/suppliers/${s.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper"
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink">
                    {s.name}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2">
                    {s.supplies && (
                      <span className="truncate text-[11.5px] text-ink-mid">{s.supplies}</span>
                    )}
                    {s.phone && (
                      <span className="flex items-center gap-1 font-mono text-[11.5px] text-ink-faint">
                        <Phone size={11} className="shrink-0" />
                        {s.phone}
                      </span>
                    )}
                    {s.email && (
                      <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-ink-faint">
                        <Mail size={11} className="shrink-0" />
                        <span className="truncate">{s.email}</span>
                      </span>
                    )}
                  </span>
                </div>
                <ChevronRight size={15} className="shrink-0 text-ink-ghost" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
