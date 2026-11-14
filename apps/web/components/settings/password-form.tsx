"use client";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@repo/shared/accounts";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useState, type FormEvent } from "react";
import { useAuthForm } from "@/components/auth/use-auth-form";
import { changePassword } from "@/lib/auth/auth-api";

/** Change the password; every other signed-in device is signed out. */
export function PasswordForm() {
  const { pending, formError, run } = useAuthForm();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < PASSWORD_MIN_LENGTH;
  const mismatch = repeat.length > 0 && repeat !== next;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    if (tooShort || mismatch || !current || !next) return;
    if (
      await run(() => changePassword({ currentPassword: current, newPassword: next }))
    ) {
      setCurrent("");
      setNext("");
      setRepeat("");
      setDone(true);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {formError ? <Alert variant="destructive" title={formError} /> : null}
      {done ? (
        <Alert
          variant="success"
          title="Password changed. Other devices have been signed out."
        />
      ) : null}
      <Field label="Current password" required>
        <Input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </Field>
      <Field
        label="New password"
        description={`${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`}
        error={tooShort ? `Use at least ${PASSWORD_MIN_LENGTH} characters.` : undefined}
        required
      >
        <Input
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
      </Field>
      <Field
        label="Repeat the new password"
        error={mismatch ? "The two new passwords differ." : undefined}
        required
      >
        <Input
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
        />
      </Field>
      <Button
        type="submit"
        className="justify-self-start"
        loading={pending}
        disabled={!current || !next || repeat !== next || tooShort}
      >
        Change password
      </Button>
    </form>
  );
}
