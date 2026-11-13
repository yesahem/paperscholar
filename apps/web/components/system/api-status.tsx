"use client";

import { Badge } from "@repo/ui/components/badge";
import { Spinner } from "@repo/ui/components/spinner";
import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/api/health";

type Status =
  { state: "checking" } | { state: "online"; version: string } | { state: "offline" };

/** Shows whether the browser can reach the backend through the /api proxy. */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ state: "checking" });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(({ version }) => setStatus({ state: "online", version }))
      .catch(() => {
        if (!controller.signal.aborted) setStatus({ state: "offline" });
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">Backend API</span>
      {status.state === "checking" ? (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Spinner label="Checking the backend" />
          Checking
        </span>
      ) : status.state === "online" ? (
        <Badge variant="success">Online · {status.version}</Badge>
      ) : (
        <Badge variant="destructive">Unreachable</Badge>
      )}
    </div>
  );
}
