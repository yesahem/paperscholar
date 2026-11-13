"use client";

import { Button } from "@repo/ui/components/button";
import { MailWarning } from "lucide-react";
import { useState } from "react";
import { AuthRequestError, resendVerificationEmail } from "@/lib/auth/auth-api";
import { useInstanceConfig, useMe } from "@/lib/queries";

type ResendState = "idle" | "sending" | "sent" | { error: string };

/**
 * Shown to a signed-in user whose email is unconfirmed, on instances that
 * verify emails (docs/specs/06-auth.md §4). Until then they can browse and
 * edit code, but not run it.
 */
export function VerificationBanner() {
  const me = useMe();
  const config = useInstanceConfig();
  const [state, setState] = useState<ResendState>("idle");

  if (!me.data || me.data.emailVerified || !config.data?.features.emailVerification) {
    return null;
  }
  const email = me.data.email;

  async function resend() {
    setState("sending");
    try {
      await resendVerificationEmail(email);
      setState("sent");
    } catch (error) {
      setState({
        error:
          error instanceof AuthRequestError
            ? error.problem.message
            : "Could not send it. Try again.",
      });
    }
  }

  return (
    <div role="status" className="border-b border-warning bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm sm:px-6">
        <MailWarning aria-hidden="true" className="size-4 shrink-0 text-warning" />
        <p className="min-w-0 flex-1">
          Confirm your email to run and submit code. We sent a link to{" "}
          <span className="font-medium">{email}</span>.
        </p>
        {state === "sent" ? (
          <p className="text-muted-foreground">Sent. Check your inbox.</p>
        ) : (
          <>
            {typeof state === "object" ? (
              <p className="text-destructive">{state.error}</p>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              loading={state === "sending"}
              onClick={resend}
            >
              Resend email
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
