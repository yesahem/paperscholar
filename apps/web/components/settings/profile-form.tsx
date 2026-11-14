"use client";

import type { Me } from "@repo/shared";
import { BIO_MAX_LENGTH, USERNAME_CHANGE_INTERVAL_DAYS } from "@repo/shared/accounts";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { useToast } from "@repo/ui/components/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { fieldErrors } from "@/lib/account/field-errors";
import { updateMe } from "@/lib/api/account";
import { ApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/queries";

/** Username and bio (`PATCH /v1/me`). Only what changed is sent. */
export function ProfileForm({ me }: { me: Me }) {
  const queries = useQueryClient();
  const toast = useToast();
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio ?? "");

  const save = useMutation({
    mutationFn: () =>
      updateMe({
        ...(username.trim().toLowerCase() !== me.username ? { username } : {}),
        ...(bio.trim() !== (me.bio ?? "") ? { bio } : {}),
      }),
    onSuccess: (updated) => {
      queries.setQueryData(queryKeys.me, updated);
      setUsername(updated.username);
      setBio(updated.bio ?? "");
      void queries.invalidateQueries({ queryKey: ["profile"] });
      toast({ title: "Profile saved", variant: "success" });
    },
  });

  const errors = save.isError ? fieldErrors(save.error) : {};
  const formError =
    save.isError && Object.keys(errors).length === 0
      ? save.error instanceof ApiError
        ? save.error.message
        : "Could not save your profile. Try again."
      : null;
  const changed =
    username.trim().toLowerCase() !== me.username || bio.trim() !== (me.bio ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changed) save.mutate();
  }

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {formError ? <Alert variant="destructive" title={formError} /> : null}
      <Field
        label="Username"
        description={`3–20 lowercase letters, digits or underscores. You can change it once every ${USERNAME_CHANGE_INTERVAL_DAYS} days.`}
        error={errors.username}
        required
      >
        <Input
          name="username"
          autoComplete="username"
          spellCheck={false}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </Field>
      <Field
        label="Bio"
        description={`${bio.trim().length} of ${BIO_MAX_LENGTH} characters. Shown on your public profile as plain text.`}
        error={errors.bio}
      >
        <Textarea
          name="bio"
          rows={3}
          maxLength={BIO_MAX_LENGTH}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
        />
      </Field>
      <Button
        type="submit"
        className="justify-self-start"
        loading={save.isPending}
        disabled={!changed}
      >
        Save profile
      </Button>
    </form>
  );
}
