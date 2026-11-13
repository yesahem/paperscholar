"use client";

import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signInWithEmail } from "@/lib/auth/auth-api";
import { useInstanceConfig } from "@/lib/queries";
import { FormDivider } from "./form-divider";
import { GoogleButton } from "./google-button";
import { useAuthForm } from "./use-auth-form";

export interface SignInFormProps {
  /** Where to go after signing in with Google, which leaves the page. */
  next: string;
  /** Called once signed in with email and password. */
  onSignedIn: () => void;
  /** Called when the user would rather create an account. */
  onWantsSignUp?: () => void;
}

/** Email and password, plus Google when this instance offers it. */
export function SignInForm({ next, onSignedIn, onWantsSignUp }: SignInFormProps) {
  const config = useInstanceConfig();
  const features = config.data?.features;
  const { pending, formError, fieldErrors, run } = useAuthForm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await run(() => signInWithEmail({ email: email.trim(), password }))) onSignedIn();
  }

  return (
    <div className="grid gap-4">
      {features?.googleSignIn ? (
        <>
          <GoogleButton next={next} />
          <FormDivider />
        </>
      ) : null}
      <form className="grid gap-4" onSubmit={submit} noValidate>
        {formError ? <Alert variant="destructive" title={formError} /> : null}
        <Field label="Email" error={fieldErrors.email} required>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Password" error={fieldErrors.password} required>
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" loading={pending} disabled={!email || !password}>
          Sign in
        </Button>
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {features?.passwordReset ? (
          <Link
            href="/reset-password"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Forgot your password?
          </Link>
        ) : (
          <span />
        )}
        {features?.signups === false ? null : onWantsSignUp ? (
          <Button variant="link" size="sm" onClick={onWantsSignUp}>
            Create an account
          </Button>
        ) : (
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        )}
      </div>
    </div>
  );
}
