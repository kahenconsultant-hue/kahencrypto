import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "C.M.I.P | Crypto Macro Intelligence Platform",
  description: "C.M.I.P؛ پلتفرم هوشمند تحلیل کلان بازار کریپتو، نقدینگی، ریسک، همبستگی و سنتیمنت.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
