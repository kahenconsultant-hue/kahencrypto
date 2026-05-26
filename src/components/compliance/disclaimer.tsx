import { AlertTriangle } from "lucide-react";

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-6 text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-1 h-4 w-4 flex-none" aria-hidden />
        <p>
          این پلتفرم به‌صورت تخصصی و با به‌روزرسانی آنلاین، تحولات، داده‌ها و اخبار جهانی مؤثر بر بازار کریپتوکارنسی را تحلیل و تفسیر می‌کند.
          {compact ? " " : " خروجی‌ها هوش بازار و تحلیل سناریویی هستند و سیگنال خرید/فروش، یا پیشنهاد ورود/خروج ارائه نمی‌دهند."}
        </p>
      </div>
    </div>
  );
}
