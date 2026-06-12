import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Disclaimer } from "@/components/compliance/disclaimer";
import { AppAutoRefresh } from "@/components/layout/app-auto-refresh";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background terminal-grid">
      <AppAutoRefresh />
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
