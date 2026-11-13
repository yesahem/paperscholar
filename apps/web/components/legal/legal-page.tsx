import type { ReactNode } from "react";
import { PageContainer, PageHeader } from "@/components/layout/page-header";

/** Shared frame for the about, terms and privacy pages. */
export function LegalPage({
  title,
  description,
  updated,
  children,
  aside,
}: {
  title: string;
  description: string;
  /** ISO date the text last changed. */
  updated?: string;
  children: ReactNode;
  /** Shown after the text, outside its prose styles. */
  aside?: ReactNode;
}) {
  return (
    <PageContainer>
      <PageHeader title={title} description={description}>
        {updated ? (
          <p className="text-sm text-muted-foreground">
            Last updated <time dateTime={updated}>{updated}</time>
          </p>
        ) : null}
      </PageHeader>
      <div className="markdown max-w-3xl">{children}</div>
      {aside}
    </PageContainer>
  );
}
