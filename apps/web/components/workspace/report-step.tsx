"use client";

import { FEEDBACK_BODY_MAX_LENGTH } from "@repo/shared/feedback";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Dialog } from "@repo/ui/components/dialog";
import { Field } from "@repo/ui/components/field";
import { Textarea } from "@repo/ui/components/textarea";
import { useToast } from "@repo/ui/components/toast";
import { ApiError } from "@repo/web-core/api/errors";
import { useMe } from "@repo/web-core/queries/session";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useState } from "react";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { createFeedback } from "@/lib/api/feedback";
import { charactersLeft } from "@/lib/feedback/format";
import { queryKeys } from "@/lib/queries";

/**
 * "Report a problem with this step" (docs/specs/08-web.md §5.6): files a bug
 * report tagged with the paper and problem, which maintainers read in the CMS.
 */
export function ReportStep({
  paperId,
  problemId,
  problemTitle,
}: {
  paperId: string;
  problemId: string;
  problemTitle: string;
}) {
  const me = useMe();
  const dialog = useAuthDialog();
  const queries = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");

  const send = useMutation({
    mutationFn: () => createFeedback({ type: "bug", body, paperId, problemId }),
    onSuccess: () => {
      setOpen(false);
      setBody("");
      void queries.invalidateQueries({ queryKey: queryKeys.myFeedback });
      toast({
        title: "Thanks. The maintainers will look at this step.",
        description: "You can follow your report on the Feedback page.",
        variant: "success",
      });
    },
  });
  const tooLong = body.trim().length > FEEDBACK_BODY_MAX_LENGTH;

  return (
    <>
      <Button
        variant="link"
        size="sm"
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => (me.data ? setOpen(true) : dialog.open("sign-in"))}
      >
        <Flag aria-hidden="true" className="size-3.5" />
        Report a problem with this step
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Report a problem with this step"
        description={`“${problemTitle}”. A wrong test, an unclear description, a typo: say what you saw. Your code is not sent.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={send.isPending}
              disabled={body.trim().length === 0 || tooLong}
              onClick={() => send.mutate()}
            >
              Send report
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {send.isError ? (
            <Alert
              variant="destructive"
              title={
                send.error instanceof ApiError
                  ? send.error.message
                  : "Could not send the report. Try again."
              }
            />
          ) : null}
          <Field
            label="What is wrong?"
            description={`Plain text. ${charactersLeft(body, FEEDBACK_BODY_MAX_LENGTH)}.`}
            error={tooLong ? "That is longer than the limit." : undefined}
            required
          >
            <Textarea
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
