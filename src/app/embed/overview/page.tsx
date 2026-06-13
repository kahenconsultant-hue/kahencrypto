import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { Disclaimer } from "@/components/compliance/disclaimer";
import { moduleDataSourceStatus } from "@/lib/data-source-status";

const alertLevelLabels: Record<string, string> = {
  Critical: "بحرانی",
  Important: "مهم",
  Watch: "رصد",
  Info: "اطلاعی",
};

const regimeLabels: Record<string, string> = {
  "Risk-On Expansion": "گسترش ریسک‌پذیری",
  "Weak Risk-On": "ریسک‌پذیری ضعیف",
  "Fragile Risk-On": "ریسک‌پذیری شکننده",
  "Liquidity-Constrained Risk-On": "ریسک‌پذیری محدودشده با نقدینگی",
  "Risk-Off Defensive": "حالت دفاعی بازار",
  "Liquidity Squeeze": "فشار نقدینگی",
  "Dollar Strength Pressure": "فشار ناشی از تقویت دلار",
  "Rates Shock": "شوک نرخ بهره",
  "Crypto-Specific Bullish": "حمایت اختصاصی کریپتو",
  "Crypto-Specific Stress": "تنش اختصاصی کریپتو",
  "Geopolitical Shock": "شوک ژئوپلیتیک",
  "Neutral / Transition": "خنثی / در حال گذار",
  "High Volatility Unclear Regime": "نوسان بالا و رژیم نامشخص",
};

export const metadata = {
  title: "ویجت قابل جاسازی رژیم بازار",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function EmbedOverviewPage() {
  const marketRegime = getMarketRegimeReport();
  const smartAlerts = generateSmartAlerts();

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>ویجت C.M.I.P</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">نمای قابل جاسازی برای وردپرس و استفاده هدلس</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge status={moduleDataSourceStatus.widgetEmbed} />
            <Badge variant="warning">{regimeLabels[marketRegime.regimeLabel ?? marketRegime.active] ?? marketRegime.regimeLabel ?? marketRegime.active}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-7 text-muted-foreground">{marketRegime.interpretationFa}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {smartAlerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="rounded-md border bg-secondary/25 p-3">
                <Badge variant={alert.level === "Critical" ? "danger" : alert.level === "Important" ? "warning" : "default"}>{alertLevelLabels[alert.level] ?? alert.level}</Badge>
                <div className="mt-2 text-xs font-bold leading-6">{alert.titleFa}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Disclaimer compact />
    </div>
  );
}
