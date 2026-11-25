import { Skeleton } from "@repo/ui/components/skeleton";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CourseView } from "@/components/courses/course-view";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { getCourse } from "@/lib/api/content";

export const revalidate = 30;

export function generateStaticParams(): { courseId: string }[] {
  return [];
}

interface CoursePageProps {
  params: Promise<{ courseId: string }>;
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { courseId } = await params;
  const course = await getCourse(courseId);
  if (!course) return { title: "Course not found" };
  return {
    title: course.title,
    description: course.summary,
    alternates: { canonical: `/courses/${courseId}` },
  };
}

/**
 * One course (docs/specs/08-web.md §2): the syllabus renders on the server;
 * the player, exercises, progress and notes load in the browser.
 */
export default async function CoursePage({ params }: CoursePageProps) {
  const { courseId } = await params;
  const course = await getCourse(courseId);
  if (!course) notFound();
  return (
    <PageContainer>
      <PageHeader title={course.title} description={course.summary} />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <CourseView course={course} />
      </Suspense>
    </PageContainer>
  );
}
