import type { Metadata } from "next";
import { PageFrame } from "@/components/shell/page-frame";
import { IngestionProgress } from "@/components/ingestions/ingestion-progress";

export const metadata: Metadata = { title: "Ingestion", robots: { index: false } };

interface IngestionPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ existing?: string }>;
}

export default async function IngestionPage({
  params,
  searchParams,
}: IngestionPageProps) {
  const { id } = await params;
  const { existing } = await searchParams;
  return (
    <PageFrame title="Ingestion">
      <IngestionProgress id={id} existing={existing === "1"} />
    </PageFrame>
  );
}
