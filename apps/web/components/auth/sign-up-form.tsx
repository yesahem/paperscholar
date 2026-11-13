"use client";

import {
  normaliseUsername,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  usernameProblem,
} from "@repo/shared/accounts";
import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signUpWithEmail } from "@/lib/auth/auth-api";
import { useInstanceConfig } from "@/lib/queries";
import { FormDivider } from "./form-divider";
import { GoogleButton } from "./google-button";
import { useAuthForm } from "./use-auth-form";

export interface SignUpFormProps {
  /** Where to go after signing up with Google, which leaves the page. */
  next: string;
  /** Called once the account exists and is signed in. */
  onSignedUp: () => void;
  /** Called when the user already has an account. */
  onWantsSignIn?: () => void;
}

/** Username, email and password (docs/specs/06-auth.md §4), plus Google when offered. */
export function SignUpForm({ next, onSignedUp, onWantsSignIn }: SignUpFormProps) {
  const config = useInstanceConfig();
  const features = config.data?.features;
  const { pending, formError, fieldErrors, setFieldErrors, run } = useAuthForm();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = normaliseUsername(username);
    const nameProblem = usernameProblem(name);
    const passwordProblem =
      password.length < PASSWORD_MIN_LENGTH
        ? `Use at least ${PASSWORD_MIN_LENGTH} characters.`
        : password.length > PASSWORD_MAX_LENGTH
          ? `Use at most ${PASSWORD_MAX_LENGTH} characters.`
          : null;
    if (nameProblem || passwordProblem) {
      setFieldErrors({
        ...(nameProblem ? { username: nameProblem } : {}),
        ...(passwordProblem ? { password: passwordProblem } : {}),
      });
      return;
    }
    if (
      await run(() => signUpWithEmail({ username: name, email: email.trim(), password }))
    ) {
      onSignedUp();
    }
  }

  const signInLink = onWantsSignIn ? (
    <Button variant="link" size="sm" onClick={onWantsSignIn}>
      Sign in instead
    </Button>
  ) : (
    <Link
      href={`/login?next=${encodeURIComponent(next)}`}
      className="text-primary underline-offset-4 hover:underline"
    >
      Sign in instead
    </Link>
  );

  if (features?.signups === false) {
    return (
      <div className="grid gap-4">
        <Alert title="This instance is not taking new accounts.">
          Its operator has turned sign-up off. If you already have an account, sign in.
        </Alert>
        <div className="text-sm">{signInLink}</div>
      </div>
    );
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
        <Field
          label="Username"
          description="Shown on your profile and the leaderboard. 3–20 letters, digits or underscores."
          error={fieldErrors.username}
          required
        >
          <Input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>
        <Field label="Email" error={fieldErrors.email} required>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field
          label="Password"
          description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
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
        <Button
          type="submit"
          loading={pending}
          disabled={!username || !email || !password}
        >
          Create account
        </Button>
        <p className="text-xs text-muted-foreground">
          By creating an account you accept the{" "}
          <Link
            href="/terms"
            className="underline underline-offset-4 hover:text-foreground"
          >
            terms
          </Link>{" "}
          and the{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-4 hover:text-foreground"
          >
            privacy policy
          </Link>
          .
        </p>
      </form>
      <div className="text-sm">{signInLink}</div>
    </div>
  );
}
