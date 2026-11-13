"use client";

import { Button } from "@repo/ui/components/button";
import { useState } from "react";
import { AuthRequestError, googleSignInUrl } from "@/lib/auth/auth-api";

/**
 * Continues with Google through the redirect flow: the browser leaves for
 * Google and comes back signed in. No Google script runs on our pages.
 */
export function GoogleButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      window.location.assign(await googleSignInUrl(next));
    } catch (caught) {
      setPending(false);
      setError(
        caught instanceof AuthRequestError
          ? caught.problem.message
          : "Could not start Google sign-in. Try again.",
      );
    }
  }

  return (
    <div className="grid gap-2">
      <Button variant="outline" loading={pending} onClick={start}>
        Continue with Google
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
