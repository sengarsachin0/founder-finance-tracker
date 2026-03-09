"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import type { AppAlert, AlertSeverity } from "@/app/api/alerts/route";

const SEVERITY_CARD: Record<AlertSeverity, string> = {
  critical:
    "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
  warning:
    "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20",
  info: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20",
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  critical: "bg-destructive",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export function AlertBell() {
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAlerts(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently ignore — alerts are non-critical UI
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    // Refresh every 5 minutes
    const id = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  // Click-outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const badgeCount = alerts.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title={badgeCount > 0 ? `${badgeCount} active alert${badgeCount !== 1 ? "s" : ""}` : "No alerts"}
      >
        <Bell className="h-4 w-4" />
        {badgeCount > 0 && (
          <span
            className={`absolute top-1 right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold leading-none text-white ${
              criticalCount > 0 ? "bg-destructive" : "bg-amber-500"
            }`}
          >
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border bg-popover shadow-lg">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-semibold">Alerts</p>
            {badgeCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {badgeCount} active
              </span>
            )}
          </div>

          {badgeCount === 0 ? (
            <div className="p-6 text-center">
              <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">All clear!</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                No active alerts.
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto p-2 space-y-1.5">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-lg border p-3 text-xs ${SEVERITY_CARD[alert.severity]}`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1 h-2 w-2 rounded-full shrink-0 ${SEVERITY_DOT[alert.severity]}`}
                    />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground leading-snug">
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-muted-foreground leading-snug">
                        {alert.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t px-4 py-2.5">
            <button
              onClick={fetchAlerts}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Refresh alerts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
