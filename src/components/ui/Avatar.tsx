import { cn } from "@/lib/utils";

const PALETTES = [
  { bg: "bg-accent-pale", text: "text-accent-deep" },
  { bg: "bg-info-pale", text: "text-info" },
  { bg: "bg-warn-pale", text: "text-warn" },
  { bg: "bg-accent-pale", text: "text-accent-deep" },
  { bg: "bg-alert-pale", text: "text-alert" },
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function paletteFor(seed: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

type Props = {
  name: string;
  size?: "xs" | "sm" | "md";
  className?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-[13px]",
};

export function Avatar({ name, size = "sm", className }: Props) {
  const { bg, text } = paletteFor(name);
  return (
    <span
      title={name}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold ring-2 ring-surface",
        SIZE[size],
        bg,
        text,
        className
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

export function AvatarStack({ names, size = "sm" }: { names: string[]; size?: Props["size"] }) {
  return (
    <span className="flex -space-x-1.5">
      {names.map((n) => (
        <Avatar key={n} name={n} size={size} />
      ))}
    </span>
  );
}
