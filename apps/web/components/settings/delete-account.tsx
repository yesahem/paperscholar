"use client";

import { normaliseUsername } from "@repo/shared/accounts";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Dialog } from "@repo/ui/components/dialog";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteMe } from "@/lib/api/account";
import { ApiError } from "@/lib/api/errors";

/** Deletes the account after the username is typed (`DELETE /v1/me`). */
export function DeleteAccount({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const queries = useQueryClient();
  const router = useRouter();
  const confirmed = normaliseUsername(typed) === username;

  const remove = useMutation({
    mutationFn: () => deleteMe(typed),
    onSuccess: () => {
      // Everything cached belonged to the account.
      queries.clear();
      router.replace("/");
    },
  });

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Deletes your account, your submissions, your progress and your avatar. This cannot
        be undone.
      </p>
      <Button
        variant="destructive"
        className="justify-self-start"
        onClick={() => setOpen(true)}
      >
        Delete my account
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setTyped("");
            remove.reset();
          }
        }}
        title="Delete your account?"
        description={`Type your username, ${username}, to confirm.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!confirmed}
              loading={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete forever
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          {remove.isError ? (
            <Alert
              variant="destructive"
              title={
                remove.error instanceof ApiError
                  ? remove.error.message
                  : "Could not delete the account. Try again."
              }
            />
          ) : null}
          <Field label="Username">
            <Input
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
