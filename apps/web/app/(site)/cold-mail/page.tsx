import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ColdMailView } from "@/components/cold-mail/cold-mail-view";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { getInstanceConfig } from "@/lib/api/content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cold mail",
  description: "Draft an outreach email to a professor or company from your CV.",
  robots: { index: false },
};

/**
 * The cold-mail generator (docs/specs/08-web.md §2). Not found on an instance
 * without a model; everything else loads in the browser for the signed-in user.
 */
export default async function ColdMailPage() {
  const config = await getInstanceConfig();
  if (!config.features.coldMail) notFound();
  return (
    <PageContainer>
      <PageHeader
        title="Cold mail"
        description="Upload your CV, say who you are writing to, and get a first draft to edit and send yourself. Check every fact before sending."
      />
      <ColdMailView />
    </PageContainer>
  );
}
