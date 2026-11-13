import { notFound } from "next/navigation";
import { contentImage, OG_IMAGE_SIZE } from "@/components/og/content-image";
import { getPaper, getProblem } from "@/lib/api/content";

export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";
export const alt = "The problem's title, paper and difficulty";
export const revalidate = 3600;

export function generateStaticParams(): { paperId: string; problemId: string }[] {
  return [];
}

export default async function Image({
  params,
}: {
  params: Promise<{ paperId: string; problemId: string }>;
}) {
  const { paperId, problemId } = await params;
  const [paper, problem] = await Promise.all([
    getPaper(paperId),
    getProblem(paperId, problemId),
  ]);
  if (!paper || !problem) notFound();
  return contentImage({
    eyebrow: `${paper.title} · step ${problem.order} of ${paper.problemCount}`,
    title: problem.title,
    subtitle: problem.summary,
    difficulty: problem.difficulty,
  });
}
