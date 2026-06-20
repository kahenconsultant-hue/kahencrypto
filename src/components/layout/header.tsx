import Image from "next/image";
import Link from "next/link";
import { Bell, FlaskConical, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 px-4 py-3 backdrop-blur">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">گزارش بروز شده بازار</Badge>
            <Badge variant="outline">فارسی راست‌چین</Badge>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Image
              src="/cmip-logo.jpg"
              alt="CMIP - Crypto Macro Intelligence Platform"
              width={202}
              height={99}
              priority
              className="h-14 w-auto object-contain invert mix-blend-screen md:h-16"
            />
            <p className="max-w-sm text-xs leading-5 text-muted-foreground md:text-sm">پلتفرم هوشمند تحلیل کلان بازار کریپتو</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-64 items-center gap-2 rounded-md border bg-card px-3 text-xs text-muted-foreground">
            <Search className="h-4 w-4" aria-hidden />
            جست‌وجو در خبرها، همبستگی‌ها، هشدارها
          </div>
          <Button variant="outline">
            <Bell className="h-4 w-4" aria-hidden />
            هشدارها
          </Button>
          <Link
            href="/audit"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-muted"
          >
            <FlaskConical className="h-4 w-4" aria-hidden />
            Audit
          </Link>
        </div>
      </div>
    </header>
  );
}
