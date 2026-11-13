import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthPageForm } from "@/components/auth/auth-page-form";
import { safeNextPath } from "@/lib/auth/redirect";
import { firstParam, type SearchParams } from "@/lib/auth/search-params";

export const metadata: Metadata = {
  title: "Create an account",
  alternates: { canonical: "/signup" },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const next = safeNextPath(firstParam((await searchParams).next));
  return (
    <AuthCard
      title="Create your account"
      description="Free. Run your code against the tests and keep track of what you have solved."
    >
      <AuthPageForm mode="sign-up" next={next} />
    </AuthCard>
  );
}
