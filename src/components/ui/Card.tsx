import { cn } from "@/lib/utils";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  /** When true the card lifts on hover with a soft green-tinted shadow. */
  interactive?: boolean;
};

export function Card({ className, interactive, ...rest }: Props) {
  return (
    <div
      className={cn(
        // Senator card: white surface, hairline border (border-led), soft
        // shadow, 12px radius. Interactive cards lift with a blue-tinted border.
        "rounded-xl border border-line bg-surface p-6 shadow-floating",
        interactive &&
          "cursor-pointer soft-elev-hover hover:border-accent/30",
        className
      )}
      {...rest}
    />
  );
}
