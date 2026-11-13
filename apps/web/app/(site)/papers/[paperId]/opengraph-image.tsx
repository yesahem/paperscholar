import { notFound } from "next/navigation";
import { contentImage, OG_IMAGE_SIZE } from "@/components/og/content-image";
import { getPaper } from "@/lib/api/content";
import { pluralise } from "@/lib/content/format";

export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";
export const alt = "The paper's title and summary";
export const revalidate = 3600;

export function generateStaticParams(): { paperId: string }[] {
  return [];
}

export default async function Image({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const { paperId } = await params;
  const paper = await getPaper(paperId);
  if (!paper) notFound();
  return contentImage({
    eyebrow: `Implement it in ${pluralise(paper.problemCount, "step")}`,
    title: paper.title,
    subtitle: paper.summary,
  });
}
