"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  content: React.ReactNode;
}

export function Tabs({ items, defaultValue, className }: { items: TabItem[]; defaultValue?: string; className?: string }) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.value);
  const current = items.find((item) => item.value === active) ?? items[0];

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2 rounded-md border bg-muted/35 p-1">
        {items.map((item) => (
          <button
            key={item.value}
            className={cn(
              "h-8 rounded-sm px-3 text-xs font-bold text-muted-foreground transition-colors",
              active === item.value && "bg-card text-foreground shadow-sm",
            )}
            onClick={() => setActive(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div>{current?.content}</div>
    </div>
  );
}
