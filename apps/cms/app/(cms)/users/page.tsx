import type { Metadata } from "next";
import { PageFrame } from "@/components/shell/page-frame";
import { UsersView } from "@/components/users/users-view";

export const metadata: Metadata = { title: "Roles", robots: { index: false } };

export default function UsersPage() {
  return (
    <PageFrame
      role="admin"
      title="Roles"
      description="Maintainers upload and publish papers; admins also manage roles."
    >
      <UsersView />
    </PageFrame>
  );
}
