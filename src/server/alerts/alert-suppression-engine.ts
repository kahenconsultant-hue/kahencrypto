import type { SmartAlert } from "@/lib/types";
import { clampPercent } from "@/server/analytics/scoring-engine";

export type AlertQualityLabel = "HIGH" | "MEDIUM" | "LOW" | "REJECTED";

export interface AlertQualityBreakdown {
  signalQuality: number;
  dataCoverage: number;
  sourceReliability: number;
  freshness: number;
}

export interface AlertSuppressionResult {
  visible: SmartAlert[];
  suppressed: SmartAlert[];
  rejected: SmartAlert[];
}

export function classifyAlertQuality(score: number): AlertQualityLabel {
  if (score >= 80) return "HIGH";
  if (score >= 60) return "MEDIUM";
  if (score >= 40) return "LOW";
  return "REJECTED";
}

export function calculateAlertQualityScore(breakdown: AlertQualityBreakdown) {
  return clampPercent(
    breakdown.signalQuality * 0.4 +
      breakdown.dataCoverage * 0.25 +
      breakdown.sourceReliability * 0.2 +
      breakdown.freshness * 0.15,
  );
}

function suppressionReasons(alert: SmartAlert) {
  const reasons: string[] = [];
  const coverage = alert.dataCoveragePercent ?? 0;
  const quality = alert.alertQualityScore ?? 0;
  const realIndicatorCount = alert.indicatorCount ?? alert.dataUsed?.filter((item) => item.status === "available").length ?? 0;
  const label = alert.alertQualityLabel ?? classifyAlertQuality(quality);

  if (alert.confidence < 20) reasons.push("confidence زیر ۲۰٪ است");
  if (coverage < 25) reasons.push("coverage زیر ۲۵٪ است");
  if (quality < 25) reasons.push("quality زیر ۲۵٪ است");
  if (realIndicatorCount < 2) reasons.push("کمتر از دو indicator واقعی دارد");
  if (label === "REJECTED") reasons.push("Alert Quality Gate خروجی را REJECTED کرده است");

  return reasons;
}

export function applyAlertSuppression(alerts: SmartAlert[]): AlertSuppressionResult {
  const visible: SmartAlert[] = [];
  const suppressed: SmartAlert[] = [];
  const rejected: SmartAlert[] = [];

  for (const alert of alerts) {
    const reasons = suppressionReasons(alert);
    if (!reasons.length) {
      visible.push({ ...alert, status: "active" });
      continue;
    }

    const suppressedAlert: SmartAlert = {
      ...alert,
      status: "suppressed",
      suppressionReason: reasons.join("؛ "),
    };
    suppressed.push(suppressedAlert);
    if ((alert.alertQualityLabel ?? classifyAlertQuality(alert.alertQualityScore ?? 0)) === "REJECTED") {
      rejected.push(suppressedAlert);
    }
  }

  return { visible, suppressed, rejected };
}
