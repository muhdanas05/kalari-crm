// Tiny formatters — no date library, just Intl.

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
});
const DAY_OF_WEEK = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
const FULL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return DATE.format(new Date(iso)).toUpperCase();
}
export function formatDayOfWeek(iso?: string): string {
  if (!iso) return "—";
  return DAY_OF_WEEK.format(new Date(iso)).toUpperCase();
}
export function formatFull(iso?: string): string {
  if (!iso) return "Unscheduled";
  return FULL.format(new Date(iso));
}
export function formatTime(iso?: string): string {
  if (!iso) return "—";
  return TIME.format(new Date(iso));
}

export function jobRef(id: string): string {
  return id.toUpperCase();
}
