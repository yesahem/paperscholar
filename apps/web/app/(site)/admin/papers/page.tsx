import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/admin-page";
import { PapersView } from "@/components/admin/papers-view";

export const metadata: Metadata = { title: "Manage papers", robots: { index: false } };

export default function AdminPapersPage() {
  return (
    <AdminPage
      title="Papers"
      description="Published papers, drafts, and papers the pipeline is working on."
    >
      <PapersView />
    </AdminPage>
  );
}
