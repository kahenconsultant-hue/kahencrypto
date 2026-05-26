import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

const toneClass = {
  good: "text-emerald-300",
  warn: "text-amber-300",
  bad: "text-red-300",
  neutral: "text-slate-200",
};

export function Metric({
  label,
  value,
  detail,
  tone = "neutral",
  progress,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: keyof typeof toneClass;
  progress?: number;
}) {
  return (
    <div className="rounded-md border bg-secondary/35 p-3">
      <div className="metric-label">{label}</div>
      <div className={cn("mt-2 text-lg font-black number-tabular", toneClass[tone])}>{value}</div>
      {typeof progress === "number" ? <Progress value={progress} className="mt-3" /> : null}
      {detail ? <p className="mt-2 text-xs leading-6 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
