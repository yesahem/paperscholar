import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/admin-page";
import { ReviewView } from "@/components/admin/review-view";

export const metadata: Metadata = { title: "Review", robots: { index: false } };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminPage
      title="Review the draft"
      description="Edit any file, re-verify it, regenerate a step with a note, then publish. You never write a test from nothing: change what the model wrote, and the checks tell you if it still holds."
    >
      <ReviewView id={id} />
    </AdminPage>
  );
}
