import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/admin-page";
import { IngestionProgress } from "@/components/admin/ingestion-progress";

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
    <AdminPage title="Ingestion">
      <IngestionProgress id={id} existing={existing === "1"} />
    </AdminPage>
  );
}
