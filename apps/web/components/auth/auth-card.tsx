import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import type { ReactNode } from "react";

/** The narrow card every auth page is laid out in. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <Card>
        <CardHeader>
          <h1 className="text-xl leading-tight font-semibold tracking-tight">{title}</h1>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          {children}
          <noscript>
            <p className="text-sm text-destructive">
              Signing in needs JavaScript. Everything else on the site works without it.
            </p>
          </noscript>
        </CardContent>
      </Card>
    </div>
  );
}
