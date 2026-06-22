import type { Metadata } from "next";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/900.css";
import "./globals.css";
import { RouteShell } from "@/components/layout/route-shell";

export const metadata: Metadata = {
  title: "C.M.I.P | Crypto Macro Intelligence Platform",
  description: "C.M.I.P؛ پلتفرم هوشمند تحلیل کلان بازار کریپتو، نقدینگی، ریسک، همبستگی و سنتیمنت.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className="dark">
      <body>
        <RouteShell>{children}</RouteShell>
      </body>
    </html>
  );
}
