"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bitcoin,
  CircleDollarSign,
  DatabaseZap,
  Gauge,
  LayoutDashboard,
  Landmark,
  LineChart,
  ShieldAlert,
  SlidersHorizontal,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "داشبورد", icon: LayoutDashboard },
  { href: "/assets/btc", label: "BTC", icon: Bitcoin },
  { href: "/assets/eth", label: "ETH", icon: Activity },
  { href: "/assets/sol", label: "SOL", icon: Gauge },
  { href: "/assets/usdt", label: "ریسک USDT (تتر)", icon: ShieldAlert },
  { href: "/assets/dxy", label: "محرک DXY (شاخص دلار)", icon: CircleDollarSign },
  { href: "/assets/gold", label: "محرک Gold (طلا)", icon: Landmark },
  { href: "/assets/nasdaq", label: "محرک Nasdaq (ریسک فناوری)", icon: LineChart },
  { href: "/assets/us10y", label: "محرک US10Y (بازده اوراق)", icon: Waves },
  { href: "/liquidity", label: "نقدینگی (Liquidity)", icon: Waves },
  { href: "/correlations", label: "همبستگی (Correlation)", icon: BarChart3 },
  { href: "/sentiment", label: "سنتیمنت بازار (Sentiment)", icon: AlertTriangle },
  { href: "/admin", label: "ادمین", icon: SlidersHorizontal },
  { href: "/embed/overview", label: "ویجت", icon: DatabaseZap },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-64 shrink-0 border-l bg-card/80 p-3 lg:sticky lg:top-0 lg:block">
      <Link href="/" className="mb-5 flex items-center gap-3 rounded-md border bg-secondary/40 p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BarChart3 className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <div className="text-sm font-black">C.M.I.P</div>
          <div className="text-[11px] leading-5 text-muted-foreground">تحلیل کلان، نقدینگی و ریسک بازار کریپتو</div>
        </div>
      </Link>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-primary/12 text-primary ring-1 ring-primary/25",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 rounded-md border bg-background/50 p-3 text-xs leading-6 text-muted-foreground">
        <div className="font-bold text-foreground">پوشش دارایی‌ها</div>
        <p>BTC, ETH, SOL, USDT, DXY, Gold, Nasdaq, US10Y, Fed</p>
      </div>
    </aside>
  );
}
