import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthPageForm } from "@/components/auth/auth-page-form";
import { safeNextPath } from "@/lib/auth/redirect";
import { firstParam, type SearchParams } from "@/lib/auth/search-params";

export const metadata: Metadata = {
  title: "Sign in",
  alternates: { canonical: "/login" },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next));
  const failed = firstParam(params.error) !== null;
  return (
    <AuthCard
      title="Sign in"
      description={
        failed
          ? "Signing in with Google did not complete. Try again."
          : "Pick up where you left off."
      }
    >
      <AuthPageForm mode="sign-in" next={next} />
    </AuthCard>
  );
}
