import { SITE } from "@repo/shared";
import { Badge } from "@repo/ui/components/badge";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { BookOpen, ExternalLink } from "lucide-react";
import { ApiStatus } from "@/components/system/api-status";

/**
 * Placeholder home page for the foundation milestone. The real landing page
 * arrives with the content pages in M2.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <div className="flex flex-col items-start gap-5">
        <Badge variant="secondary">Early development · open source</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {SITE.tagline}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          {SITE.description} Free to use and free to host yourself.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={SITE.repositoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants()}
          >
            <ExternalLink aria-hidden="true" />
            View on GitHub
          </a>
          <a
            href={`${SITE.repositoryUrl}/tree/main/docs/specs`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" })}
          >
            <BookOpen aria-hidden="true" />
            Read the specs
          </a>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System status</CardTitle>
          <CardDescription>
            Checked from your browser through the same-origin /api proxy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApiStatus />
        </CardContent>
      </Card>
    </main>
  );
}
