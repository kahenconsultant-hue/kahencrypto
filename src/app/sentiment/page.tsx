import { SentimentPanel } from "@/components/dashboard/panels";
import { getNewsItems } from "@/lib/production-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Sentiment Dashboard | C.M.I.P",
};

export default function SentimentPage() {
  const items = getNewsItems("sentiment").slice(0, 8);

  return (
    <div className="space-y-4">
      <SentimentPanel />
      <Card>
        <CardHeader>
          <div>
            <CardTitle>خوشه‌های روایت اجتماعی</CardTitle>
            <CardDescription>۸ آیتم منتخب سنتیمنت با تفسیر فارسی و وزن اهمیت.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-md border bg-secondary/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="muted">{item.source}</Badge>
                <Badge variant={item.importance > 88 ? "warning" : "outline"}>اولویت {item.importance}</Badge>
              </div>
              <h3 className="mt-3 text-sm font-black leading-7">{item.titleFa}</h3>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.analysisFa}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
