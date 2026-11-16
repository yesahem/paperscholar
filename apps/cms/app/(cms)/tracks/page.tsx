import type { Metadata } from "next";
import { PageFrame } from "@/components/shell/page-frame";
import { TracksView } from "@/components/tracks/tracks-view";

export const metadata: Metadata = { title: "Tracks" };

export default function TracksPage() {
  return (
    <PageFrame
      title="Tracks"
      description="Ordered groups of published papers, shown on the learners' roadmap. Saving a track here makes it yours: syncing the library files will not change it."
    >
      <TracksView />
    </PageFrame>
  );
}
