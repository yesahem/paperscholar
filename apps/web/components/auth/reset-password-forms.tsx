"use client";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@repo/shared/accounts";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { requestPasswordReset, resetPassword } from "@/lib/auth/auth-api";
import { useInstanceConfig } from "@/lib/queries";
import { useAuthForm } from "./use-auth-form";

/** Asks for a reset link. The answer is the same whether or not the address has an account. */
export function RequestResetForm() {
  const config = useInstanceConfig();
  const { pending, formError, run } = useAuthForm();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (config.isPending) return <Skeleton className="h-40 w-full" />;
  if (config.data && !config.data.features.passwordReset) {
    return (
      <Alert title="This instance cannot send email.">
        Ask its operator to reset your password; they can do it from the command line.
      </Alert>
    );
  }
  if (sent) {
    return (
      <Alert variant="success" title="Check your inbox.">
        If an account uses that address, a link to choose a new password is on its way. It
        works once, for one hour.
      </Alert>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run(() => requestPasswordReset(email.trim()))) setSent(true);
  }

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {formError ? <Alert variant="destructive" title={formError} /> : null}
      <Field label="Email" required>
        <Input
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Button type="submit" loading={pending} disabled={!email}>
        Send reset link
      </Button>
    </form>
  );
}

/** Chooses a new password with the token from the emailed link. */
export function ResetPasswordForm({ token }: { token: string }) {
  const { pending, formError, fieldErrors, setFieldErrors, run } = useAuthForm();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Alert variant="success" title="Your password is changed.">
        You were signed out everywhere.{" "}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>{" "}
        with the new password.
      </Alert>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      setFieldErrors({
        password: `Use ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
      });
      return;
    }
    if (await run(() => resetPassword({ token, newPassword: password }))) setDone(true);
  }

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      {formError ? <Alert variant="destructive" title={formError} /> : null}
      <Field
        label="New password"
        description={`At least ${PASSWORD_MIN_LENGTH} characters. Saving it signs you out everywhere.`}
        error={fieldErrors.password}
        required
      >
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <Button type="submit" loading={pending} disabled={!password}>
        Save new password
      </Button>
    </form>
  );
}
