"use client";

import { COURSE_NOTE_MAX_LENGTH } from "@repo/shared/courses";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Textarea } from "@repo/ui/components/textarea";
import { ApiError } from "@repo/web-core/api/errors";
import { LoadError } from "@repo/web-core/states/load-error";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { putNote } from "@/lib/api/courses";
import { queryKeys, useNote } from "@/lib/queries";

/** Personal notes on one course item, kept with the account (docs/specs/10-secondary-features.md §5). */
export function NotesEditor({ courseId, itemId }: { courseId: string; itemId: string }) {
  const note = useNote(courseId, itemId);
  if (note.isPending) return <Skeleton className="h-40 w-full" />;
  if (note.isError) {
    return (
      <LoadError
        what="your notes"
        message={note.error.message}
        onRetry={() => void note.refetch()}
        retrying={note.isFetching}
      />
    );
  }
  return (
    <NoteForm
      key={`${courseId}/${itemId}`}
      courseId={courseId}
      itemId={itemId}
      saved={note.data.body}
      savedAt={note.data.updatedAt}
    />
  );
}

function NoteForm({
  courseId,
  itemId,
  saved,
  savedAt,
}: {
  courseId: string;
  itemId: string;
  saved: string;
  savedAt: string | null;
}) {
  const queries = useQueryClient();
  const [body, setBody] = useState(saved);
  const save = useMutation({
    mutationFn: () => putNote(courseId, itemId, body),
    onSuccess: (updated) => {
      queries.setQueryData(queryKeys.note(courseId, itemId), updated);
    },
  });
  const tooLong = body.length > COURSE_NOTE_MAX_LENGTH;
  const changed = body !== saved;
  return (
    <div className="grid gap-3">
      {save.isError ? (
        <Alert
          variant="destructive"
          title={
            save.error instanceof ApiError
              ? save.error.message
              : "Could not save your notes."
          }
        />
      ) : null}
      <Field
        label="Your notes"
        description={`Only you see them, on any device. ${body.length} of ${COURSE_NOTE_MAX_LENGTH} characters.`}
        error={tooLong ? "That is longer than the limit." : undefined}
      >
        <Textarea
          rows={6}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          loading={save.isPending}
          disabled={!changed || tooLong}
          onClick={() => save.mutate()}
        >
          Save notes
        </Button>
        <span className="text-sm text-muted-foreground" role="status">
          {changed
            ? "Unsaved changes"
            : savedAt
              ? `Saved ${new Date(savedAt).toLocaleString()}`
              : null}
        </span>
      </div>
    </div>
  );
}
