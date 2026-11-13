import { buttonVariants } from "@repo/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main
        id="main"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-6 py-16"
      >
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">
          The page you asked for does not exist, has moved, or is not published on this
          instance.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/papers" className={buttonVariants()}>
            Browse papers
          </Link>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go to the home page
          </Link>
        </div>
      </main>
    </>
  );
}
