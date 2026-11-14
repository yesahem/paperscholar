import type { Metadata } from "next";
import { OwnProfileRedirect } from "@/components/account/own-profile-redirect";
import { PageContainer } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Your profile", robots: { index: false } };

export default function OwnProfilePage() {
  return (
    <PageContainer>
      <OwnProfileRedirect />
    </PageContainer>
  );
}
