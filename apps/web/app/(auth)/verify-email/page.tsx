import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailStatus } from "@/components/auth/verify-email-status";
import { firstParam, type SearchParams } from "@/lib/auth/search-params";

export const metadata: Metadata = {
  title: "Confirm your email",
  alternates: { canonical: "/verify-email" },
};

/** Where the verification link lands after the API has checked it. */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const error = firstParam((await searchParams).error);
  return (
    <AuthCard title={error ? "That link did not work" : "Email confirmed"}>
      <VerifyEmailStatus error={error} />
    </AuthCard>
  );
}
