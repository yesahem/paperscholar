import { Alert } from "@repo/ui/components/alert";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import {
  RequestResetForm,
  ResetPasswordForm,
} from "@/components/auth/reset-password-forms";
import { firstParam, type SearchParams } from "@/lib/auth/search-params";

export const metadata: Metadata = {
  title: "Reset your password",
  alternates: { canonical: "/reset-password" },
};

/**
 * Without a token: ask for a reset link. With one (from the emailed link, via
 * /api/auth/reset-password/:token): choose a new password.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = firstParam(params.token);
  const failed = firstParam(params.error) !== null;

  if (token && !failed) {
    return (
      <AuthCard title="Choose a new password">
        <ResetPasswordForm token={token} />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Reset your password"
      description="We will email you a link to choose a new one."
    >
      {failed ? (
        <Alert variant="destructive" title="That link has expired or was already used.">
          Ask for a new one below.
        </Alert>
      ) : null}
      <RequestResetForm />
    </AuthCard>
  );
}
