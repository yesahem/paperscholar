import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/admin-page";
import { UsersView } from "@/components/admin/users-view";

export const metadata: Metadata = { title: "Roles", robots: { index: false } };

export default function UsersPage() {
  return (
    <AdminPage
      role="admin"
      title="Roles"
      description="Maintainers upload and publish papers; admins also manage roles."
    >
      <UsersView />
    </AdminPage>
  );
}
