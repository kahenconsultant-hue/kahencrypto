"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

const publicPaths = new Set(["/", "/login", "/register", "/thank-you", "/pending-activation", "/sample-dashboard"]);

export function RouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (publicPaths.has(pathname)) return children;
  return <AppShell>{children}</AppShell>;
}

