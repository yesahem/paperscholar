"use client";

import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useMe } from "@repo/web-core/queries/session";
import { LoadError } from "@repo/web-core/states/load-error";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { FeedbackForm } from "./feedback-form";
import { MyFeedback } from "./my-feedback";

/** Sending feedback and managing your own (docs/specs/10-secondary-features.md §4). */
export function FeedbackView() {
  const me = useMe();
  const dialog = useAuthDialog();
  if (me.isPending) return <Skeleton className="h-64 w-full" />;
  if (me.isError) {
    return (
      <LoadError
        what="your account"
        message={me.error.message}
        onRetry={() => void me.refetch()}
        retrying={me.isFetching}
      />
    );
  }
  if (!me.data) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6">
        <p className="font-medium">Sign in to write a review or report a bug.</p>
        <p className="text-sm text-muted-foreground">
          You can follow what happens to everything you send, and edit or delete it.
        </p>
        <Button onClick={() => dialog.open("sign-in")}>Sign in</Button>
      </div>
    );
  }
  return (
    <div className="grid gap-10">
      <section aria-labelledby="feedback-send" className="grid gap-4">
        <h2 id="feedback-send" className="text-lg font-semibold">
          Send feedback
        </h2>
        <FeedbackForm />
      </section>
      <section aria-labelledby="feedback-mine" className="grid gap-4">
        <h2 id="feedback-mine" className="text-lg font-semibold">
          What you have sent
        </h2>
        <MyFeedback />
      </section>
    </div>
  );
}
