import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentUnavailable } from "@/components/content/content-unavailable";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { getCourses, loadAtBuild, UNAVAILABLE_AT_BUILD } from "@/lib/api/content";
import { formatMinutes } from "@/lib/courses/player";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Courses",
  description: "Video lectures with exercises, free for everyone with an account.",
  alternates: { canonical: "/courses" },
};

/**
 * The courses on this instance (docs/specs/08-web.md §2). Rendered on the
 * server and cached like content; not found when the instance offers none.
 */
export default async function CoursesPage() {
  const courses = await loadAtBuild(getCourses);
  if (courses === null) notFound();
  if (courses === UNAVAILABLE_AT_BUILD) {
    return (
      <PageContainer>
        <PageHeader title="Courses" />
        <ContentUnavailable what="courses" />
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <PageHeader
        title="Courses"
        description="Video lectures with short exercises. Every course is free; sign in to watch and keep your place."
      />
      <ul className="grid gap-4 sm:grid-cols-2">
        {courses.map((course) => (
          <li key={course.id}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>
                  <Link href={`/courses/${course.id}`} className="hover:underline">
                    {course.title}
                  </Link>
                </CardTitle>
                <CardDescription>
                  {course.lectureCount} lecture{course.lectureCount === 1 ? "" : "s"} ·{" "}
                  {formatMinutes(course.durationSeconds)} · {course.exerciseCount}{" "}
                  exercise
                  {course.exerciseCount === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 text-sm">{course.summary}</CardContent>
              <CardFooter>
                <Link
                  href={`/courses/${course.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  aria-label={`Open ${course.title}`}
                >
                  Open course
                </Link>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
