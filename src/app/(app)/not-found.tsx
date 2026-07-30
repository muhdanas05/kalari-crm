import Link from "next/link";
import { SearchX, LayoutDashboard } from "@/components/icons";
import { Button } from "@/components/ui/Button";

/**
 * Reached by notFound() on the detail pages — which fires both for a URL that
 * never existed and for a row this user is not allowed to see. The copy covers
 * both without confirming which, because "you don't have access to THIS record"
 * still tells an employee that the record exists.
 */
export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-floating">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-paper-deep">
          <SearchX size={22} className="text-ink-mid" />
        </span>

        <h1 className="text-[19px] font-extrabold tracking-[-0.4px] text-ink">
          Not found
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] font-medium leading-[1.6] text-ink-mid">
          This page doesn&apos;t exist, or it belongs to someone else&apos;s
          customer. Check the link, or search for what you were after.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Link href="/dashboard">
            <Button variant="primary" size="sm" icon={LayoutDashboard}>
              Dashboard
            </Button>
          </Link>
          <Link href="/customers">
            <Button variant="secondary" size="sm">
              Customers
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
