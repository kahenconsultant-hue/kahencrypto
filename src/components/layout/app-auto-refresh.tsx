"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AppAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const delayedRefreshTimers: number[] = [];

    const refreshData = async () => {
      try {
        const response = await fetch("/api/v1/refresh", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { backgroundIngestionScheduled?: boolean; catchupAlreadyRunning?: boolean } | null;
        if (payload?.backgroundIngestionScheduled || payload?.catchupAlreadyRunning) {
          for (const delay of [90_000, 180_000]) {
            delayedRefreshTimers.push(
              window.setTimeout(() => {
                if (!cancelled) router.refresh();
              }, delay),
            );
          }
        }
      } catch {
        // The data health panels surface stale-source warnings; UI refresh still runs.
      }
      if (!cancelled) {
        router.refresh();
      }
    };

    const initialRefresh = window.setTimeout(() => {
      void refreshData();
    }, 1_000);

    const interval = window.setInterval(() => {
      void refreshData();
    }, 30 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
      for (const timer of delayedRefreshTimers) window.clearTimeout(timer);
    };
  }, [router]);

  return null;
}
