"use client";

import type { FeedbackType } from "@repo/shared/feedback";
import { FEEDBACK_BODY_MAX_LENGTH, FEEDBACK_RATING } from "@repo/shared/feedback";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { RadioGroup } from "@repo/ui/components/radio-group";
import { Select } from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { useToast } from "@repo/ui/components/toast";
import { ApiError } from "@repo/web-core/api/errors";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { fieldErrors } from "@/lib/account/field-errors";
import { createFeedback } from "@/lib/api/feedback";
import { charactersLeft } from "@/lib/feedback/format";
import { queryKeys } from "@/lib/queries";

const TYPE_OPTIONS = [
  {
    value: "review",
    label: "A review",
    description: "What you think of the site. Shown publicly once an admin approves it.",
  },
  {
    value: "bug",
    label: "A bug report",
    description: "Something broken. Only you and the maintainers see it.",
  },
] as const;

const RATINGS = Array.from(
  { length: FEEDBACK_RATING.max - FEEDBACK_RATING.min + 1 },
  (_, index) => FEEDBACK_RATING.max - index,
);

/** Write a review or report a bug (`POST /v1/feedback`). */
export function FeedbackForm() {
  const queries = useQueryClient();
  const toast = useToast();
  const [type, setType] = useState<FeedbackType>("review");
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState("");

  const send = useMutation({
    mutationFn: () =>
      createFeedback(
        type === "review"
          ? { type, body, ...(rating === null ? {} : { rating }) }
          : { type, body },
      ),
    onSuccess: (item) => {
      setBody("");
      setRating(null);
      void queries.invalidateQueries({ queryKey: queryKeys.myFeedback });
      toast({
        title:
          item.type === "review"
            ? "Thanks. Your review will appear once an admin approves it."
            : "Thanks. The maintainers will see your report.",
        variant: "success",
      });
    },
  });

  const errors = send.isError ? fieldErrors(send.error) : {};
  const formError =
    send.isError && Object.keys(errors).length === 0
      ? send.error instanceof ApiError
        ? send.error.message
        : "Could not send it. Try again."
      : null;
  const empty = body.trim().length === 0;
  const tooLong = body.trim().length > FEEDBACK_BODY_MAX_LENGTH;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!empty && !tooLong) send.mutate();
  }

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {formError ? <Alert variant="destructive" title={formError} /> : null}
      <RadioGroup
        legend="What are you sending?"
        options={TYPE_OPTIONS}
        value={type}
        onValueChange={(value) => setType(value === "bug" ? "bug" : "review")}
      />
      {type === "review" ? (
        <Field
          label="Rating"
          description="Optional."
          error={errors.rating}
          className="max-w-xs"
        >
          <Select
            value={rating === null ? "" : String(rating)}
            onChange={(event) =>
              setRating(event.target.value === "" ? null : Number(event.target.value))
            }
          >
            <option value="">No rating</option>
            {RATINGS.map((value) => (
              <option key={value} value={value}>
                {value} out of {FEEDBACK_RATING.max}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field
        label={type === "review" ? "Your review" : "What went wrong?"}
        description={`Plain text. ${charactersLeft(body, FEEDBACK_BODY_MAX_LENGTH)}.`}
        error={errors.body ?? (tooLong ? "That is longer than the limit." : undefined)}
        required
      >
        <Textarea
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      <div>
        <Button type="submit" loading={send.isPending} disabled={empty || tooLong}>
          Send
        </Button>
      </div>
    </form>
  );
}
