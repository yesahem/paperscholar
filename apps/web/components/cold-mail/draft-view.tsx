"use client";

import type { ColdMail } from "@repo/shared";
import { COLD_MAIL_POLL_MS } from "@repo/shared/cold-mail";
import { Alert } from "@repo/ui/components/alert";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Spinner } from "@repo/ui/components/spinner";
import { Textarea } from "@repo/ui/components/textarea";
import { useToast } from "@repo/ui/components/toast";
import { LoadError } from "@repo/web-core/states/load-error";
import { Copy, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { mailtoHref } from "@/lib/cold-mail/format";
import { queryKeys, useColdMail } from "@/lib/queries";

/**
 * One draft: a spinner while it is written, the reason when it could not be,
 * and otherwise the subject and body as editable text to copy into the
 * user's own email. Never rendered as HTML (docs/specs/10-secondary-features.md §6).
 */
export function DraftView({ id }: { id: string }) {
  const mail = useColdMail(id, COLD_MAIL_POLL_MS);
  const queries = useQueryClient();
  const status = mail.data?.status;
  // The history shows each draft's status: refresh it once this one finishes.
  useEffect(() => {
    if (status === "done" || status === "failed") {
      void queries.invalidateQueries({ queryKey: queryKeys.coldMails, exact: true });
    }
  }, [status, queries]);
  if (mail.isPending) return <Skeleton className="h-64 w-full" />;
  if (mail.isError) {
    return (
      <LoadError
        what="the draft"
        message={mail.error.message}
        onRetry={() => void mail.refetch()}
        retrying={mail.isFetching}
      />
    );
  }
  const draft = mail.data;
  if (draft.status === "pending") {
    return (
      <div
        role="status"
        className="flex items-center gap-3 rounded-lg border border-border bg-card p-6 text-sm"
      >
        <Spinner />
        Writing a draft to {draft.target.name} at {draft.target.organisation}. This takes
        about half a minute.
      </div>
    );
  }
  if (draft.status === "failed") {
    return (
      <Alert
        variant="destructive"
        title={draft.failure ?? "The draft could not be written."}
      />
    );
  }
  return <EditableDraft key={draft.id} draft={draft} />;
}

function EditableDraft({ draft }: { draft: ColdMail }) {
  const toast = useToast();
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body ?? "");

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${what} copied`, variant: "success" });
    } catch {
      toast({
        title: `Could not copy the ${what.toLowerCase()}; select it and copy by hand.`,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        To {draft.target.name}, {draft.target.organisation}. Edit it freely: nothing is
        sent from this site. Copy it into your own email, or open it in your mail program.
      </p>
      <Field label="Subject">
        <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
      </Field>
      <Field label="Email">
        <Textarea
          rows={14}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void copy(body, "Email")}>
          <Copy aria-hidden="true" />
          Copy email
        </Button>
        <Button variant="outline" onClick={() => void copy(subject, "Subject")}>
          <Copy aria-hidden="true" />
          Copy subject
        </Button>
        <a
          href={mailtoHref(subject, body)}
          className={buttonVariants({ variant: "ghost" })}
        >
          <Mail aria-hidden="true" />
          Open in my email program
        </a>
      </div>
      {draft.highlights && draft.highlights.length > 0 ? (
        <div className="rounded-md bg-muted p-3 text-sm">
          <p className="mb-1 font-medium">Check these facts against your CV</p>
          <ul className="list-disc pl-5">
            {draft.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
