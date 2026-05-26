import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPercent(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat("fa-IR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatCompactUsd(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000_000) {
    return `${sign}$${formatNumber(abs / 1_000_000_000, 2)}B`;
  }

  if (abs >= 1_000_000) {
    return `${sign}$${formatNumber(abs / 1_000_000, 1)}M`;
  }

  return `${sign}$${formatNumber(abs, 0)}`;
}

export function severityColor(level: "Info" | "Watch" | "Important" | "Critical") {
  switch (level) {
    case "Critical":
      return "border-red-500/50 bg-red-500/12 text-red-100";
    case "Important":
      return "border-amber-500/50 bg-amber-500/12 text-amber-100";
    case "Watch":
      return "border-cyan-500/50 bg-cyan-500/12 text-cyan-100";
    default:
      return "border-slate-500/50 bg-slate-500/12 text-slate-100";
  }
}

export function scoreColor(score: number) {
  if (score >= 72) return "text-emerald-300";
  if (score >= 52) return "text-cyan-300";
  if (score >= 35) return "text-amber-300";
  return "text-red-300";
}
