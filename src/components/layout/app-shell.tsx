"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Disclaimer } from "@/components/compliance/disclaimer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const refreshData = async () => {
      try {
        await fetch("/api/v1/refresh", { cache: "no-store" });
      } catch {
        // The data quality panel surfaces stale-source warnings; the UI refresh still runs.
      }
      if (!cancelled) {
        router.refresh();
      }
    };

    void refreshData();

    const interval = window.setInterval(() => {
      void refreshData();
    }, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [router]);

  if (pathname.startsWith("/embed")) {
    return <div className="min-h-screen bg-background p-3">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-background terminal-grid">
      <div className="flex">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <Header />
          <div className="container space-y-4 py-4">
            <Disclaimer compact />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
