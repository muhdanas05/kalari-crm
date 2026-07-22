import type { Rule } from "./engine";

/**
 * Client-safe rule helpers.
 *
 * lib/db/catalogue.ts fetches the catalogue on the server; this is the pure
 * filtering the invoice builder needs in the browser. Splitting them keeps
 * next/headers out of the client bundle.
 */
export function rulesForService(rules: Rule[], serviceId: string): Rule[] {
  return rules
    .filter((r) => r.service_id === serviceId)
    .sort((a, b) => a.sort_order - b.sort_order);
}
