import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { getIngestionFoundationStatusSync } from "@/health/source-health";

export function buildWordPressPayload() {
  const foundation = getIngestionFoundationStatusSync();
  const smartAlerts = generateSmartAlerts();

  return {
    schemaVersion: "2026-05-25-foundation",
    generatedAt: new Date().toISOString(),
    widgets: {
      reliability: {
        title: "Ingestion Foundation",
        criticalSourcesOnline: foundation.criticalSourcesOnline,
        criticalSourcesTotal: foundation.criticalSourcesTotal,
        failedSources: foundation.failedSources,
        degradedSources: foundation.degradedSources,
        interpretationFa:
          "این payload فقط وضعیت جمع‌آوری داده، سلامت منابع و رویدادهای معتبر ذخیره‌شده را منتشر می‌کند؛ اگر تحلیل جهت‌دار داده کافی نداشته باشد، مقدار ساختگی تولید نمی‌شود.",
      },
      alerts: [...smartAlerts].sort((left, right) => right.importance - left.importance).slice(0, 8).map((alert) => ({
        id: alert.id,
        type: alert.type,
        level: alert.level,
        titleFa: alert.titleFa,
        confidence: alert.confidence,
        importance: alert.importance,
        dataQuality: alert.dataQuality,
      })),
      latestNews: foundation.latestEvents.slice(0, 8).map((item) => ({
        id: item.dedupHash,
        source: item.sourceName,
        title: item.title,
        summaryFa: item.content ?? "خلاصه فارسی قابل اتکا هنوز آماده نیست؛ فقط عنوان و منبع معتبر نمایش داده می‌شود.",
        importance: null,
        timestamp: item.timestamp,
      })),
    },
    embedScript: "/embed-widget.js",
  };
}
