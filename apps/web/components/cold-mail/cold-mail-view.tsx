"use client";

import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { useMe } from "@repo/web-core/queries/session";
import { LoadError } from "@repo/web-core/states/load-error";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { queryKeys } from "@/lib/queries";
import { ColdMailForm } from "./cold-mail-form";
import { CvPanel } from "./cv-panel";
import { DraftHistory } from "./draft-history";
import { DraftView } from "./draft-view";

/** The cold-mail generator (docs/specs/10-secondary-features.md §6). */
export function ColdMailView() {
  const me = useMe();
  const dialog = useAuthDialog();
  const queries = useQueryClient();
  const [current, setCurrent] = useState<string | null>(null);

  if (me.isPending) return <Skeleton className="h-96 w-full" />;
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
        <p className="font-medium">Sign in to write outreach emails from your CV.</p>
        <p className="text-sm text-muted-foreground">
          Your CV stays private to your account and is deleted with it. Drafts are only
          shown to you; nothing is ever sent from this site.
        </p>
        <Button onClick={() => dialog.open("sign-in")}>Sign in</Button>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div className="grid content-start gap-10">
        <section aria-labelledby="cv-heading" className="grid gap-4">
          <h2 id="cv-heading" className="text-lg font-semibold">
            Your CV
          </h2>
          <CvPanel />
        </section>
        <section aria-labelledby="request-heading" className="grid gap-4">
          <h2 id="request-heading" className="text-lg font-semibold">
            Who are you writing to?
          </h2>
          <ColdMailForm
            onCreated={(id) => {
              setCurrent(id);
              void queries.invalidateQueries({ queryKey: queryKeys.coldMails });
            }}
          />
        </section>
      </div>
      <div className="grid content-start gap-10">
        <section aria-labelledby="draft-heading" className="grid gap-4">
          <h2 id="draft-heading" className="text-lg font-semibold">
            Draft
          </h2>
          {current ? (
            <DraftView key={current} id={current} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Your draft appears here. Open an earlier one from the list below.
            </p>
          )}
        </section>
        <section aria-labelledby="history-heading" className="grid gap-4">
          <h2 id="history-heading" className="text-lg font-semibold">
            Earlier drafts
          </h2>
          <DraftHistory selected={current} onOpen={setCurrent} />
        </section>
      </div>
    </div>
  );
}
