import Link from "next/link";
import { Bell, Braces, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";

export function Header() {
  const activeAlertCount = generateSmartAlerts().filter((alert) => alert.status !== "suppressed").length;

  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 px-4 py-3 backdrop-blur">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">هوش زنده بازار</Badge>
            <Badge variant="outline">فارسی راست‌چین</Badge>
            <Badge variant="warning">بدون سیگنال معامله</Badge>
          </div>
          <h1 className="mt-2 text-xl font-black md:text-2xl">C.M.I.P</h1>
          <p className="mt-1 text-xs leading-5 text-muted-foreground md:text-sm">Crypto Macro Intelligence Platform · پلتفرم هوشمند تحلیل کلان بازار کریپتو</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-64 items-center gap-2 rounded-md border bg-card px-3 text-xs text-muted-foreground">
            <Search className="h-4 w-4" aria-hidden />
            جست‌وجو در خبرها، همبستگی‌ها، هشدارها
          </div>
          <Button variant="outline">
            <Bell className="h-4 w-4" aria-hidden />
            {activeAlertCount} هشدار فعال
          </Button>
          <Link
            href="/api/v1/overview"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Braces className="h-4 w-4" aria-hidden />
            API
          </Link>
        </div>
      </div>
    </header>
  );
}
