import type { Metadata } from "next";
import { PageFrame } from "@/components/shell/page-frame";
import { ReviewView } from "@/components/ingestions/review-view";
import { loadCmsEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Review", robots: { index: false } };

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /** `?step=<id>` opens that step first, as links from step reports do. */
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const { id } = await params;
  const { step } = await searchParams;
  return (
    <PageFrame
      title="Review the draft"
      description="Edit any file, re-verify it, regenerate a step with a note, then publish. You never write a test from nothing: change what the model wrote, and the checks tell you if it still holds."
    >
      <ReviewView
        id={id}
        siteUrl={loadCmsEnv().NEXT_PUBLIC_SITE_URL}
        initialStep={typeof step === "string" ? step : null}
      />
    </PageFrame>
  );
}
