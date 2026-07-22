import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Kalari Tours and Travels mark.
 *
 * One source file (kalaritravels.in/logo.svg — plane + KALARI TRAVELS
 * roundel, navy #0F365D + gold #C7890A on near-white), two sizes:
 *   full — for the sidebar, the login card, and the portal header.
 *   mark — the same roundel small, for tight spots.
 *
 * The SVG's near-white ground (#FBFBFC) is indistinguishable from the paper
 * canvas (#FAF9F6), so no transparent cut-out is needed.
 *
 * `priority` on the full lockup: it sits in the shell above the fold on every
 * page, so lazy-loading it just makes it pop in late.
 */

export function Wordmark({
  className,
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "mark";
}) {
  return (
    <Image
      src="/kalari-logo.svg"
      alt="Kalari Tours and Travels — Your Journey, Handled Right"
      width={variant === "mark" ? 320 : 560}
      height={variant === "mark" ? 320 : 560}
      priority
      className={cn(
        "h-auto w-full select-none object-contain",
        variant === "mark" ? "max-w-[40px]" : "max-w-[130px]",
        className,
      )}
    />
  );
}
