import type { Metadata } from "next";
import { SignInCard } from "@/components/auth/sign-in-card";
import { loadCmsEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next } = await searchParams;
  return (
    <SignInCard
      next={Array.isArray(next) ? (next[0] ?? null) : (next ?? null)}
      siteUrl={loadCmsEnv().NEXT_PUBLIC_SITE_URL}
    />
  );
}
