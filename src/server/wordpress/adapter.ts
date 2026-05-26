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
          "در فاز foundation، payload وردپرس فقط وضعیت ingestion، سلامت منابع و raw events معتبر را منتشر می‌کند؛ تحلیل رژیم یا هشدار جهت‌دار بازار تولید نمی‌شود.",
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
        summaryFa: item.content ?? "این رویداد خام هنوز توسط لایه AI/translation پردازش نشده است.",
        importance: null,
        timestamp: item.timestamp,
      })),
    },
    embedScript: "/embed-widget.js",
  };
}
