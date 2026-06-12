import { DatabaseZap } from "lucide-react";
import {
  dataSourceStatusDescriptions,
  dataSourceStatusLabels,
  type DataSourceStatus,
} from "@/lib/data-source-status";
import { Badge } from "@/components/ui/badge";

export function DataSourceBadge({ status }: { status: DataSourceStatus }) {
  const variant = status === "live" ? "success" : status === "partial_live" || status === "delayed" || status === "proxy" ? "warning" : status === "unavailable" ? "danger" : "muted";

  return (
    <Badge variant={variant} title={dataSourceStatusDescriptions[status]} className="gap-1">
      <DatabaseZap className="h-3 w-3" aria-hidden />
      {dataSourceStatusLabels[status]}
    </Badge>
  );
}
