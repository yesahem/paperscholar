import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Settings" />
      <SettingsView />
    </PageContainer>
  );
}
