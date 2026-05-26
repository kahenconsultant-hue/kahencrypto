import { CorrelationMapPanel, LatestNewsFeedPanel } from "@/components/dashboard/panels";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "موتور همبستگی | C.M.I.P",
};

export default function CorrelationsPage() {
  return (
    <div className="space-y-4">
      <CorrelationMapPanel />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>معماری موتور همبستگی</CardTitle>
          <CardDescription>موتور همبستگی با وضعیت‌های کمی، تشخیص تغییر رژیم و تولید تفسیر فارسی پس از محاسبه داده.</CardDescription>
          </div>
          <Badge variant="outline">پنجره‌های چرخان</Badge>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["همبستگی چرخان", "پنجره‌های ۷، ۳۰ و ۹۰ روزه برای تشخیص تغییر رفتار"],
            ["تشخیص تغییر رژیم", "مقایسه تغییرات همبستگی با نوسان و فشار تیترهای خبری"],
            ["تشخیص واگرایی", "ثبت جدا شدن BTC از Nasdaq یا DXY در افق کوتاه"],
            ["تولید تفسیر", "تبدیل عدد همبستگی به تفسیر فارسی سناریومحور"],
          ].map(([title, body]) => (
            <div key={title} className="rounded-md border bg-secondary/25 p-3">
              <div className="font-black">{title}</div>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <LatestNewsFeedPanel />
    </div>
  );
}
