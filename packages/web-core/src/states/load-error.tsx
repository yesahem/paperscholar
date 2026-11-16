"use client";

import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { RotateCcw } from "lucide-react";

/** What failed and a retry action; never a blank area (docs/specs/08-web.md §8). */
export function LoadError({
  what,
  message,
  onRetry,
  retrying = false,
}: {
  /** "the leaderboard", "this profile". */
  what: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    <Alert variant="destructive" title={`Could not load ${what}`}>
      <span className="flex flex-wrap items-center gap-3">
        {message}
        <Button size="sm" variant="outline" onClick={onRetry} loading={retrying}>
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
      </span>
    </Alert>
  );
}
