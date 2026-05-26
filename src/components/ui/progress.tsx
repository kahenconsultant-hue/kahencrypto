import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("h-2 overflow-hidden rounded-sm bg-muted", className)}>
      <div
        className={cn("h-full rounded-sm bg-primary transition-all", indicatorClassName)}
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
