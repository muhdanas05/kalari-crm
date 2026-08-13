import Link from "next/link";
import { SearchX, LayoutDashboard } from "@/components/icons";

/*
 * Deliberately NOT using <Button> here.
 *
 * This is a Server Component, and Button is "use client". Passing
 * icon={LayoutDashboard} across that boundary hands React a Lucide
 * forwardRef object — a non-serializable value — so every notFound() in the
 * (app) group threw "Only plain objects can be passed to Client Components"
 * and rendered the error overlay INSTEAD of this page. Hitting any id the
 * user isn't allowed to see showed a crash rather than "Not found".
 *
 * Rendering the icon as a child (as with SearchX below) is fine — that
 * produces plain serializable output. It is passing the component ITSELF as
 * a prop that breaks. Styled links also fix the invalid <a><button> nesting
 * the old markup produced.
 */
const LINK_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full h-8 px-3 text-[12px] font-bold whitespace-nowrap transition-all duration-200 active:scale-[0.97] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mist focus-visible:ring-offset-1";

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
          <Link href="/dashboard" className={`${LINK_BASE} cta-accent-gradient text-white`}>
            <LayoutDashboard size={14} />
            Dashboard
          </Link>
          <Link
            href="/customers"
            className={`${LINK_BASE} border border-line bg-surface text-ink-soft soft-elev hover:border-line-strong hover:text-ink`}
          >
            Customers
          </Link>
        </div>
      </div>
    </div>
  );
}
