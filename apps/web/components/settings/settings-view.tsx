"use client";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Skeleton } from "@repo/ui/components/skeleton";
import type { ReactNode } from "react";
import { useAuthDialog } from "@/components/auth/auth-dialog";
import { LoadError } from "@/components/states/load-error";
import { useMe } from "@/lib/queries";
import { AvatarForm } from "./avatar-form";
import { DeleteAccount } from "./delete-account";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

/** Account settings (docs/specs/08-web.md §6). Loaded in the browser; needs a session. */
export function SettingsView() {
  const me = useMe();
  const dialog = useAuthDialog();

  if (me.isPending) {
    return (
      <div className="grid gap-6">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-48 w-full" />
        ))}
      </div>
    );
  }
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
        <p className="font-medium">
          Sign in to change your username, avatar or password.
        </p>
        <Button onClick={() => dialog.open("sign-in")}>Sign in</Button>
      </div>
    );
  }

  const account = me.data;
  return (
    <div className="grid gap-6">
      <Section
        title="Profile"
        description={`Signed in as ${account.email}. Your email is never shown to others.`}
      >
        <ProfileForm key={`${account.username}:${account.bio ?? ""}`} me={account} />
      </Section>
      <Section title="Avatar">
        <AvatarForm me={account} />
      </Section>
      <Section title="Password">
        <PasswordForm />
      </Section>
      <Section title="Delete account">
        <DeleteAccount username={account.username} />
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
