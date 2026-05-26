import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "outline" | "danger";

const variants: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "bg-transparent text-foreground hover:bg-muted",
  outline: "border border-border bg-transparent text-foreground hover:bg-muted",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

export function Button({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
