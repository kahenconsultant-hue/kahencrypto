"use client";

import Image from "next/image";
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
  FlaskConical,
  LayoutDashboard,
  Landmark,
  LineChart,
  ShieldAlert,
  SlidersHorizontal,
  Waves,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "داشبورد بازار", icon: LayoutDashboard },
  { href: "/audit", label: "Intelligence Lab", icon: FlaskConical },
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
      <Link href="/dashboard" className="mb-5 flex items-center justify-center rounded-md border bg-secondary/40 p-3">
        <Image
          src="/cmip-logo.jpg"
          alt="CMIP - Crypto Macro Intelligence Platform"
          width={202}
          height={99}
          priority
          className="h-auto w-full max-w-[180px] object-contain invert mix-blend-screen"
        />
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
        <div className="font-bold text-foreground">فهرست پایش بازار ایران</div>
        <p>USDT, BTC, TRX, ETH, TON, SOL, XRP, DOGE, BNB, ADA</p>
      </div>
    </aside>
  );
}
