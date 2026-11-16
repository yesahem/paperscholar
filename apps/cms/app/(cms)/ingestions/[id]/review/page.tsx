import type { Metadata } from "next";
import { PageFrame } from "@/components/shell/page-frame";
import { ReviewView } from "@/components/ingestions/review-view";
import { loadCmsEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Review", robots: { index: false } };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PageFrame
      title="Review the draft"
      description="Edit any file, re-verify it, regenerate a step with a note, then publish. You never write a test from nothing: change what the model wrote, and the checks tell you if it still holds."
    >
      <ReviewView id={id} siteUrl={loadCmsEnv().NEXT_PUBLIC_SITE_URL} />
    </PageFrame>
  );
}
