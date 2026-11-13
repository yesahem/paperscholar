"use client";

import { Alert } from "@repo/ui/components/alert";
import { buttonVariants } from "@repo/ui/components/button";
import Link from "next/link";
import { useEffect } from "react";
import { useRefreshMe } from "@/lib/queries";
import { VerificationBanner } from "./verification-banner";

const ERRORS: Record<string, string> = {
  TOKEN_EXPIRED: "This link has expired.",
  INVALID_TOKEN: "This link is not valid, or was already used.",
  USER_NOT_FOUND: "The account for this link no longer exists.",
  INVALID_USER: "This link belongs to a different account than the one signed in.",
};

/** Where a verification link lands: success, or what went wrong and how to get a new link. */
export function VerifyEmailStatus({ error }: { error: string | null }) {
  const refreshMe = useRefreshMe();
  useEffect(() => {
    if (!error) void refreshMe();
  }, [error, refreshMe]);

  if (error) {
    return (
      <>
        <Alert variant="destructive" title={ERRORS[error] ?? "This link did not work."}>
          Sign in and use “Resend email” to get a new one.
        </Alert>
        <VerificationBanner />
      </>
    );
  }
  return (
    <>
      <Alert variant="success" title="Your email is confirmed.">
        You can now run and submit code.
      </Alert>
      <Link href="/papers" className={buttonVariants()}>
        Browse papers
      </Link>
    </>
  );
}
