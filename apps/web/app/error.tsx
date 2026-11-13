"use client";

import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the failed segment (Next.js 16.2+). */
  retry: () => void;
}

/** Fallback for an unexpected rendering error in any route segment. */
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    // Until an error-reporting service is configured, the console is the record.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <Alert variant="destructive" title="Something went wrong">
        This page failed to load. Try again, and if it keeps happening, report it with the
        reference below.
        {error.digest ? (
          <span className="mt-1 block font-mono text-xs">Reference: {error.digest}</span>
        ) : null}
      </Alert>
      <div>
        <Button onClick={retry}>Try again</Button>
      </div>
    </main>
  );
}
