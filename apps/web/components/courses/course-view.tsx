"use client";

import type { CourseDetail, ItemProgress } from "@repo/shared";
import { Button } from "@repo/ui/components/button";
import { Meter } from "@repo/ui/components/meter";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useMe } from "@repo/web-core/queries/session";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { completion, formatMinutes } from "@/lib/courses/player";
import { queryKeys, useCourseProgress } from "@/lib/queries";
import { ExerciseView } from "./exercise-view";
import { LecturePlayer } from "./lecture-player";
import { NotesEditor } from "./notes-editor";
import { Syllabus } from "./syllabus";

/**
 * A course: the syllabus beside the selected item (`?item=`), with the
 * learner's progress and notes (docs/specs/10-secondary-features.md §5).
 * Signed out, the syllabus shows and the player asks to sign in.
 */
export function CourseView({ course }: { course: CourseDetail }) {
  const me = useMe();
  const dialog = useAuthDialog();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queries = useQueryClient();
  const signedIn = Boolean(me.data);
  const progress = useCourseProgress(course.id, signedIn);

  const requested = params.get("item");
  const item =
    course.items.find((candidate) => candidate.id === requested) ?? course.items[0];
  const byItem = useMemo(
    () => new Map((progress.data?.items ?? []).map((entry) => [entry.itemId, entry])),
    [progress.data],
  );
  const completed = useMemo(
    () =>
      new Set(
        [...byItem.values()]
          .filter((entry) => entry.completed)
          .map((entry) => entry.itemId),
      ),
    [byItem],
  );
  const { done, total } = completion(
    course.items.map((candidate) => candidate.id),
    progress.data?.items ?? [],
  );

  const select = (itemId: string) =>
    router.replace(`${pathname}?${new URLSearchParams({ item: itemId })}`, {
      scroll: false,
    });

  const onProgress = useCallback(
    (updated: ItemProgress) => {
      queries.setQueryData(
        queryKeys.courseProgress(course.id),
        (current: typeof progress.data) =>
          current
            ? {
                ...current,
                items: [
                  ...current.items.filter((entry) => entry.itemId !== updated.itemId),
                  updated,
                ],
              }
            : current,
      );
    },
    [queries, course.id],
  );

  if (!item) return null;
  const saved = byItem.get(item.id);

  let main;
  if (me.isPending || (signedIn && progress.isPending)) {
    main = <Skeleton className="aspect-video w-full" />;
  } else if (!signedIn) {
    main = (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Sign in to watch lectures and do the exercises.</p>
        <p className="text-sm text-muted-foreground">
          Courses are free. Your place, completed items and notes are kept with your
          account.
        </p>
        <Button onClick={() => dialog.open("sign-in")}>Sign in</Button>
      </div>
    );
  } else {
    main = (
      <div className="grid gap-8">
        {item.type === "lecture" ? (
          <LecturePlayer
            key={item.id}
            courseId={course.id}
            itemId={item.id}
            title={item.title}
            durationSeconds={item.durationSeconds}
            savedSeconds={saved?.lastWatchedSeconds ?? 0}
            completed={saved?.completed ?? false}
            onProgress={onProgress}
          />
        ) : (
          <ExerciseView
            key={item.id}
            courseId={course.id}
            itemId={item.id}
            bestScore={saved?.score ?? null}
            onGraded={() =>
              void queries.invalidateQueries({
                queryKey: queryKeys.courseProgress(course.id),
              })
            }
          />
        )}
        <section aria-labelledby="notes-heading" className="grid gap-3">
          <h2 id="notes-heading" className="text-lg font-semibold">
            Notes
          </h2>
          <NotesEditor courseId={course.id} itemId={item.id} />
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
      <aside className="grid content-start gap-4">
        <p className="text-sm text-muted-foreground">
          {course.lectureCount} lecture{course.lectureCount === 1 ? "" : "s"} ·{" "}
          {formatMinutes(course.durationSeconds)} · {course.exerciseCount} exercise
          {course.exerciseCount === 1 ? "" : "s"}
        </p>
        {signedIn && progress.data ? (
          <div className="grid gap-1.5">
            <p className="text-sm">
              {done} of {total} completed
            </p>
            <Meter label="Course completed" value={done} max={total} tone="success" />
          </div>
        ) : null}
        <Syllabus
          items={course.items}
          selected={item.id}
          completed={completed}
          onSelect={select}
        />
      </aside>
      <section
        aria-labelledby="item-heading"
        className="grid min-w-0 content-start gap-4"
      >
        <h2 id="item-heading" className="text-xl font-semibold">
          {item.title}
        </h2>
        {main}
      </section>
    </div>
  );
}
