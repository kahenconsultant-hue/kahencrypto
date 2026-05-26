import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "outline" | "success" | "warning" | "danger" | "muted";

const variants: Record<BadgeVariant, string> = {
  default: "border-primary/40 bg-primary/12 text-primary",
  outline: "border-border bg-transparent text-foreground",
  success: "border-emerald-500/45 bg-emerald-500/12 text-emerald-200",
  warning: "border-amber-500/45 bg-amber-500/12 text-amber-200",
  danger: "border-red-500/45 bg-red-500/12 text-red-200",
  muted: "border-muted bg-muted/60 text-muted-foreground",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-sm border px-2 text-[11px] font-semibold leading-none",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
