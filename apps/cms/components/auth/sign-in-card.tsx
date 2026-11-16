"use client";

import { Alert } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader } from "@repo/ui/components/card";
import { Field } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { hasRole } from "@repo/shared/accounts";
import { signInWithEmail } from "@repo/web-core/auth/auth-api";
import { safeNextPath } from "@repo/web-core/auth/redirect";
import { useAuthForm } from "@repo/web-core/auth/use-auth-form";
import { useMe, useRefreshMe } from "@repo/web-core/queries/session";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

/** Where a maintainer lands after signing in, when nothing else was asked for. */
const AFTER_SIGN_IN = "/";

/**
 * Email and password. Accounts are made, verified and recovered on the learner
 * site, and the API refuses a CMS session to anyone who is not a maintainer or
 * admin (docs/specs/14-cms.md §3.3).
 */
export function SignInCard({ next, siteUrl }: { next: string | null; siteUrl: string }) {
  const router = useRouter();
  const me = useMe();
  const refreshMe = useRefreshMe();
  const { pending, formError, fieldErrors, run } = useAuthForm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const destination = safeNextPath(next, AFTER_SIGN_IN);

  // Someone who is already signed in has nothing to do here.
  useEffect(() => {
    if (me.data && hasRole(me.data.role, "maintainer")) router.replace(destination);
  }, [me.data, destination, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signedIn = await run(() => signInWithEmail({ email: email.trim(), password }));
    if (signedIn) {
      await refreshMe();
      router.replace(destination);
    }
  }

  return (
    <div className="w-full max-w-md px-4 py-12">
      <Card>
        <CardHeader>
          <h1 className="text-xl leading-tight font-semibold tracking-tight">
            Sign in to the CMS
          </h1>
          <CardDescription>
            For maintainers and admins. Use the email and password of your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
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
          <p className="text-sm text-muted-foreground">
            No account yet, or a forgotten password? Both are handled on{" "}
            <a
              href={`${siteUrl}/login`}
              className="text-primary underline underline-offset-4"
            >
              the learner site
            </a>
            . A maintainer then gives your account its role.
          </p>
          <noscript>
            <p className="text-sm text-destructive">Signing in needs JavaScript.</p>
          </noscript>
        </CardContent>
      </Card>
    </div>
  );
}
