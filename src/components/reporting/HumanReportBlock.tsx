import type { HumanizedReportBlock } from "@/lib/intelligence/humanReport";
import { validateHumanizedBlock } from "@/lib/intelligence/humanReport";
import { cn } from "@/lib/utils";

export type HumanReportBlockProps = HumanizedReportBlock & {
  className?: string;
  compact?: boolean;
};

function detailRows(details: Record<string, unknown>) {
  return Object.entries(details).map(([key, value]) => (
    <div key={key} className="rounded-md border border-border/55 bg-background/25 p-2">
      <div className="text-[10px] font-bold text-muted-foreground">{key}</div>
      <div className="mt-1 text-xs leading-6 text-foreground">{Array.isArray(value) ? value.join("، ") : String(value)}</div>
    </div>
  ));
}

function DetailDisclosure(props: { title: string; details: Record<string, unknown>; compact?: boolean; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-md border border-border/55 bg-muted/10 p-2" open={props.defaultOpen}>
      <summary className="cursor-pointer list-none text-[11px] font-black text-muted-foreground marker:hidden">
        <span className="inline-flex items-center gap-2">
          <span>{props.title}</span>
          <span className="text-[10px] font-medium text-muted-foreground/70">برای مشاهده باز کنید</span>
        </span>
      </summary>
      <div className={cn("mt-2 grid gap-2", props.compact ? "grid-cols-1" : "md:grid-cols-2")}>{detailRows(props.details)}</div>
    </details>
  );
}

export function HumanReportBlock(props: HumanReportBlockProps) {
  const isValid = validateHumanizedBlock(props);
  if (!isValid) {
    console.error("HumanReportBlock received incomplete humanized content", {
      hasSummary: Boolean(props.human_summary),
      hasMeaning: Boolean(props.user_meaning),
      hasReasoning: Boolean(props.reasoning),
      hasWatchNext: Boolean(props.watch_next),
      hasConfidence: Boolean(props.confidence_explanation),
      hasTechnical: Boolean(props.technical_details),
    });
    return (
      <div className={cn("rounded-md border border-amber-500/30 bg-amber-500/8 p-3 text-xs leading-6 text-amber-100", props.className)}>
        این بخش هنوز توضیح انسانی کامل ندارد و فقط جزئیات فنی در دسترس است.
      </div>
    );
  }

  return (
    <div className={cn("space-y-3 text-[12px] leading-6", props.className)}>
      <section>
        <div className="font-black text-foreground">۱. روایت بازار</div>
        <p className="mt-1 text-muted-foreground">{props.human_summary}</p>
      </section>
      <section>
        <div className="font-black text-foreground">۲. مسیر تشخیص ترید</div>
        <p className="mt-1 text-muted-foreground">{props.user_meaning}</p>
      </section>
      <section>
        <div className="font-black text-foreground">۳. دلیل</div>
        <p className="mt-1 text-muted-foreground">{props.reasoning}</p>
      </section>
      <section>
        <div className="font-black text-foreground">۴. برای رصد بعدی</div>
        <p className="mt-1 text-muted-foreground">{props.watch_next}</p>
      </section>
      <section>
        <div className="font-black text-foreground">۵. اعتماد و کیفیت داده</div>
        <p className="mt-1 text-muted-foreground">{props.confidence_explanation}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-sm border bg-muted/35 px-2 py-1 text-[10px] text-muted-foreground">{props.data_quality_label}</span>
          <span className="rounded-sm border bg-muted/35 px-2 py-1 text-[10px] text-muted-foreground">{props.risk_label}</span>
        </div>
      </section>
      <DetailDisclosure title="۶. جزئیات فنی" details={props.technical_details} compact={props.compact} />
      <DetailDisclosure title="۷. جزئیات Audit" details={props.audit_details} compact={props.compact} />
      {!props.compact ? (
        <p className="rounded-md border bg-secondary/20 p-2 text-[11px] leading-5 text-muted-foreground">{props.non_advisory_note}</p>
      ) : null}
    </div>
  );
}
